// @vitest-environment happy-dom
/**
 * The two payload renderers: the hand-written JSON tokeniser and the unified
 * diff.
 *
 * `highlightJson` is tested as a pure function because the interesting part of
 * it - deciding whether a quoted run is a key or a value - is a lookahead with a
 * false positive waiting in it, and that is much easier to pin down as data than
 * as coloured spans in a DOM.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditJsonDiff } from '../src/features/audit/AuditJsonDiff';
import { JsonViewer, highlightJson } from '../src/features/audit/JsonViewer';

/** Token text grouped by kind, which is what the assertions actually care about. */
const byKind = (json: string, kind: string) =>
  highlightJson(json)
    .filter((token) => token.kind === kind)
    .map((token) => token.text);

/** Stubs the clipboard, which happy-dom does not provide. */
function stubClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('highlightJson', () => {
  it('tells a key from a string value by the colon that follows it', () => {
    const json = '{\n  "name": "Checkout"\n}';
    expect(byKind(json, 'key')).toEqual(['"name"']);
    expect(byKind(json, 'string')).toEqual(['"Checkout"']);
  });

  it('does not mistake a colon inside a value for a key separator', () => {
    // The classic false positive: "the first string after a brace is a key"
    // misreads this, because the value contains the character the rule looks for.
    const json = '{"url": "https://x.test:8080/a"}';
    expect(byKind(json, 'key')).toEqual(['"url"']);
    expect(byKind(json, 'string')).toEqual(['"https://x.test:8080/a"']);
  });

  it('does not let an escaped quote end the string early', () => {
    const json = '{"note": "say \\"hi\\" now"}';
    expect(byKind(json, 'string')).toEqual(['"say \\"hi\\" now"']);
    expect(byKind(json, 'key')).toEqual(['"note"']);
  });

  it('reads a key whose own text contains a colon', () => {
    const json = '{"a:b": 1}';
    expect(byKind(json, 'key')).toEqual(['"a:b"']);
  });

  it('covers every number shape JSON allows', () => {
    const json = '[1, -2, 3.5, -4.25, 1e3, 2E-2]';
    expect(byKind(json, 'number')).toEqual(['1', '-2', '3.5', '-4.25', '1e3', '2E-2']);
  });

  it('marks booleans, null and punctuation', () => {
    const json = '{"a": true, "b": false, "c": null}';
    expect(byKind(json, 'boolean')).toEqual(['true', 'false']);
    expect(byKind(json, 'null')).toEqual(['null']);
    expect(byKind(json, 'punctuation')).toContain('{');
    expect(byKind(json, 'punctuation')).toContain(':');
  });

  it('reassembles to exactly the input, losing nothing', () => {
    // The real invariant: whatever the tokeniser does not recognise still has to
    // render, or the payload silently loses characters.
    const json = JSON.stringify(
      { a: [1, true, null, 'x'], 'b:c': { d: -2.5 }, e: 'has "quotes"' },
      null,
      2,
    );
    expect(highlightJson(json).reduce((text, token) => text + token.text, '')).toBe(json);
  });

  it('does not choke on a bare dash that is not a number', () => {
    expect(highlightJson('-').map((token) => token.kind)).toEqual(['plain']);
  });

  it('returns nothing for an empty string', () => {
    expect(highlightJson('')).toEqual([]);
  });
});

describe('JsonViewer', () => {
  it('renders the payload indented, in a named scrollable region', () => {
    render(<JsonViewer value={{ enabled: false, rolloutPercent: 25 }} label="the after payload" />);

    const region = screen.getByRole('region', { name: 'the after payload' });
    expect(region.textContent).toContain('"enabled"');
    // Indented, not the single-line stringify this feature replaced.
    expect(region.textContent).toContain('\n  ');
    // Focusable, so a keyboard user can scroll a payload taller than the box.
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('shows a dash and no copy button when there is no payload', () => {
    render(<JsonViewer value={null} label="the before payload" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('copies the payload and says so in the button label', async () => {
    const writeText = stubClipboard();
    render(<JsonViewer value={{ a: 1 }} label="the after payload" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy the after payload' }));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ a: 1 }, null, 2));
    // The confirmation is in the accessible name, not only in the swapped glyph.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied the after payload' })).toBeTruthy(),
    );
  });

  it('survives a browser with no clipboard rather than throwing', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<JsonViewer value={{ a: 1 }} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))).not.toThrow();
  });

  it('truncates a pathological payload but still copies all of it', () => {
    // `jsonb` has no size limit; tokenising a megabyte would block the thread.
    const writeText = stubClipboard();
    const value = { blob: 'x'.repeat(25_000) };
    render(<JsonViewer value={value} label="the after payload" />);

    expect(screen.getByText(/Truncated at/)).toBeTruthy();
    const region = screen.getByRole('region', { name: 'the after payload' });
    expect(region.textContent!.length).toBeLessThan(21_000);

    fireEvent.click(screen.getByRole('button', { name: 'Copy the after payload' }));
    expect(writeText.mock.calls[0]![0].length).toBeGreaterThan(25_000);
  });
});

describe('AuditJsonDiff', () => {
  const region = () => within(screen.getByRole('region', { name: 'Payload diff' }));

  it('marks changed lines as well as tinting them', () => {
    render(<AuditJsonDiff before={{ enabled: true }} after={{ enabled: false }} />);
    // Colour alone fails for a red/green deficiency, so the gutter carries it too.
    expect(region().getByText('+')).toBeTruthy();
    expect(region().getByText('−')).toBeTruthy();
    expect(screen.getByText(/added/).textContent).toContain('+1');
  });

  it('reads a creation as all-new rather than as a diff against nothing', () => {
    render(<AuditJsonDiff before={null} after={{ key: 'a.b' }} />);
    expect(screen.getByText(/no previous value/)).toBeTruthy();
    expect(region().queryByText('−')).toBeNull();
  });

  it('reads a deletion as a removal', () => {
    render(<AuditJsonDiff before={{ key: 'a.b' }} after={null} />);
    expect(screen.getByText(/the payload was removed/)).toBeTruthy();
    expect(region().queryByText('+')).toBeNull();
  });

  it('says plainly when the two sides are identical', () => {
    // Better than a wall of unchanged lines that the reader has to scan to
    // conclude the same thing.
    render(<AuditJsonDiff before={{ a: 1 }} after={{ a: 1 }} />);
    expect(screen.getByText(/No changes to the payload/)).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('says plainly when there was no payload at all', () => {
    render(<AuditJsonDiff before={null} after={null} />);
    expect(screen.getByText(/without a before or after payload/)).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('keeps a long value reachable by wrapping it', () => {
    render(<AuditJsonDiff before={{ a: 'y'.repeat(400) }} after={{ a: 'z'.repeat(400) }} />);
    const line = region().getByText(new RegExp('z{50}'));
    // Wrapped, never clipped: the whole value stays in the DOM for Ctrl+F.
    expect(line.className).toContain('whitespace-pre-wrap');
    expect(line.textContent).toContain('z'.repeat(400));
  });
});
