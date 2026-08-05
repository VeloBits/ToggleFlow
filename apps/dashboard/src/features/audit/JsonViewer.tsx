/**
 * A JSON payload, indented and syntax-highlighted, with a copy button.
 *
 * The highlighter is ~40 lines here rather than a dependency because the repo has
 * no syntax highlighter and the smallest credible one is larger than this whole
 * feature. `highlightJson` is exported separately from the component so the
 * tokenising - the part with an edge case in it - is testable without a DOM.
 *
 * ## Long values wrap, they are never cut
 *
 * `whitespace-pre-wrap break-all` plus a scrolling container, and no `slice()`
 * anywhere near the render path. A value clipped by CSS is still in the DOM for
 * Ctrl+F, for a screen reader and for select-and-copy; a value clipped by
 * `slice()` is gone. The one exception is the truncation guard below, which
 * exists so a pathological payload cannot lock the tab up - and even then the
 * copy button still copies the whole thing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { prettyJson } from '@/components/diff';
import { cn } from '@/ui/cn';
import { CheckIcon, CopyIcon } from '@/ui/icons';

export interface JsonToken {
  text: string;
  kind: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain';
}

/**
 * Past this many characters the payload is rendered truncated.
 *
 * `jsonb` has no size limit and a config blob can be enormous; tokenising a
 * megabyte on every expand would block the main thread. 20k is far above any
 * real audit payload and far below the point where this gets slow.
 */
const MAX_RENDERED_CHARS = 20_000;

const TOKEN_CLASS: Record<JsonToken['kind'], string> = {
  // Deliberately the VS Code-ish assignments the rest of this theme is derived
  // from - blue for keys, green for strings, pale yellow for numbers - so the
  // payload reads the same way as an editor. All four are theme tokens, so dark
  // mode comes free.
  key: 'text-primary',
  string: 'text-on',
  number: 'text-rollout',
  boolean: 'text-rollout',
  null: 'text-muted-foreground',
  punctuation: 'text-muted-foreground',
  plain: '',
};

/**
 * Splits pretty-printed JSON into coloured runs.
 *
 * The one case worth naming: a quoted run is a KEY only when the next
 * non-whitespace character is a colon. Deciding it by position instead - "the
 * first string after a brace" - misreads `{"url": "https://x"}`, where the value
 * contains the very colon the naive rule looks for.
 */
export function highlightJson(json: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let plain = '';
  let index = 0;

  const flush = () => {
    if (plain !== '') {
      tokens.push({ text: plain, kind: 'plain' });
      plain = '';
    }
  };
  const push = (text: string, kind: JsonToken['kind']) => {
    flush();
    tokens.push({ text, kind });
    index += text.length;
  };

  while (index < json.length) {
    const char = json[index]!;

    if (char === '"') {
      const start = index;
      index += 1;
      while (index < json.length) {
        // A backslash escapes the next character, `\"` included - stepping over
        // both is what stops an escaped quote from ending the string early.
        if (json[index] === '\\') {
          index += 2;
          continue;
        }
        if (json[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      const text = json.slice(start, index);
      let peek = index;
      while (peek < json.length && /\s/.test(json[peek]!)) peek += 1;
      flush();
      tokens.push({ text, kind: json[peek] === ':' ? 'key' : 'string' });
      continue;
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(json.slice(index));
      if (match) {
        push(match[0], 'number');
        continue;
      }
    }

    if (json.startsWith('true', index) || json.startsWith('false', index)) {
      push(json.startsWith('true', index) ? 'true' : 'false', 'boolean');
      continue;
    }
    if (json.startsWith('null', index)) {
      push('null', 'null');
      continue;
    }
    if (
      char === '{' ||
      char === '}' ||
      char === '[' ||
      char === ']' ||
      char === ',' ||
      char === ':'
    ) {
      push(char, 'punctuation');
      continue;
    }

    plain += char;
    index += 1;
  }

  flush();
  return tokens;
}

export function JsonViewer({
  value,
  label = 'JSON',
  className,
  maxHeight = 'max-h-96',
}: {
  value: unknown;
  /** Names the payload for the copy affordance and the region. */
  label?: string;
  className?: string;
  /** Tailwind max-height class for the scroll container. */
  maxHeight?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount: the panel closes while the confirmation is still up
  // every time somebody copies and hits Escape.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const absent = value === null || value === undefined;
  const full = useMemo(() => (absent ? '' : prettyJson(value)), [absent, value]);
  const truncated = full.length > MAX_RENDERED_CHARS;
  const shown = truncated ? full.slice(0, MAX_RENDERED_CHARS) : full;
  const tokens = useMemo(() => highlightJson(shown), [shown]);

  if (absent) {
    return <p className={cn('text-muted-foreground m-0 px-3 py-2 text-[12.5px]', className)}>—</p>;
  }

  const copy = () => {
    void navigator.clipboard?.writeText(full)?.catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn('border-border bg-panel relative rounded-md border', className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        // The label carries the copied state so the confirmation is not
        // colour-and-glyph only.
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        onClick={copy}
        className="absolute top-1 right-1 z-10"
      >
        {copied ? <CheckIcon size={13} className="text-on" /> : <CopyIcon size={13} />}
      </Button>
      <div
        role="region"
        aria-label={label}
        // Focusable so a keyboard user can scroll a payload taller than the box.
        tabIndex={0}
        className={cn('overflow-auto px-3 py-2 pr-9', maxHeight)}
      >
        <pre className="m-0 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap">
          {tokens.map((token, position) => (
            <span key={position} className={TOKEN_CLASS[token.kind]}>
              {token.text}
            </span>
          ))}
        </pre>
        {truncated && (
          <p className="text-muted-foreground m-0 mt-2 text-[11.5px] tabular-nums">
            Truncated at {MAX_RENDERED_CHARS.toLocaleString()} of {full.length.toLocaleString()}{' '}
            characters — use Copy for the whole payload.
          </p>
        )}
      </div>
    </div>
  );
}
