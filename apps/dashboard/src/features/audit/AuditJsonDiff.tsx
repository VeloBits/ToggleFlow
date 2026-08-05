/**
 * The before/after payloads as a unified line diff.
 *
 * Unified rather than side by side: these payloads are narrow and deep, and two
 * columns halve the width available for wrapping a long value inside an already
 * ~576px panel. The raw tab shows both payloads whole for anyone who wants the
 * unchanged fields too - this view answers "what is different" and nothing else.
 *
 * Built on `components/diff.ts`, the same LCS diff the config version history
 * uses, but styled in Tailwind rather than through the legacy `.diff` class: this
 * surface needs wrapping and a scroll container, and `.diff` sets neither.
 *
 * The `+`/`−` gutter is not decoration. Colour alone fails for a red/green
 * deficiency, which is the failure mode a diff is most exposed to, so every
 * added and removed line is marked as well as tinted.
 */
import { useMemo } from 'react';

import { diffLines, prettyJson, type DiffLine } from '@/components/diff';
import { cn } from '@/ui/cn';

const LINE_CLASS: Record<DiffLine['kind'], string> = {
  added: 'bg-on-soft text-on',
  removed: 'bg-off-soft text-off',
  same: 'text-muted-foreground',
};

const MARK: Record<DiffLine['kind'], string> = { added: '+', removed: '−', same: ' ' };

export function AuditJsonDiff({
  before,
  after,
  className,
}: {
  before: unknown;
  after: unknown;
  className?: string;
}) {
  const beforeText = before === null || before === undefined ? '' : prettyJson(before);
  const afterText = after === null || after === undefined ? '' : prettyJson(after);

  const lines = useMemo<DiffLine[]>(() => {
    /*
     * A missing side is not an empty document. Diffing against `''` yields one
     * phantom empty line, and diffing against the string `"null"` invents a
     * change to a field called null - so a one-sided event is expanded directly
     * instead of being handed to the differ.
     */
    if (beforeText === '') {
      return afterText.split('\n').map((text) => ({ kind: 'added', text }));
    }
    if (afterText === '') {
      return beforeText.split('\n').map((text) => ({ kind: 'removed', text }));
    }
    return diffLines(beforeText, afterText);
  }, [beforeText, afterText]);

  if (beforeText === '' && afterText === '') {
    return (
      <p className={cn('text-muted-foreground m-0 text-[12.5px]', className)}>
        This event was recorded without a before or after payload.
      </p>
    );
  }

  if (beforeText === afterText) {
    return (
      <p className={cn('text-muted-foreground m-0 text-[12.5px]', className)}>
        No changes to the payload — the two sides are identical.
      </p>
    );
  }

  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;

  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-muted-foreground m-0 mb-1.5 text-[11.5px] tabular-nums">
        <span className="text-on">+{added} added</span>
        {' · '}
        <span className="text-off">−{removed} removed</span>
        {beforeText === '' && ' · no previous value, every line is new'}
        {afterText === '' && ' · the payload was removed'}
      </p>
      <div
        role="region"
        aria-label="Payload diff"
        tabIndex={0}
        className="border-border bg-panel max-h-96 overflow-auto rounded-md border p-2 font-mono text-[12px] leading-relaxed"
      >
        {lines.map((line, position) => (
          <div key={position} className={cn('flex gap-2', LINE_CLASS[line.kind])}>
            <span aria-hidden className="shrink-0 select-none opacity-70">
              {MARK[line.kind]}
            </span>
            <span className="min-w-0 break-all whitespace-pre-wrap">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
