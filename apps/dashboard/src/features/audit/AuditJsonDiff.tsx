/**
 * The before/after payloads as a unified line diff.
 *
 * Unified rather than side by side: these payloads are narrow and deep, and two
 * columns halve the width available for a long value inside an already ~576px
 * panel. The raw tab shows both payloads whole for anyone who wants the
 * unchanged fields too - this view answers "what is different" and nothing else.
 *
 * Both halves now come from the design system: `diffLines` is the same LCS diff
 * this app used to carry in `components/diff.ts` (with a size cap added), and
 * `DiffViewer` renders it - the `+`/`−` gutter, the counted summary and the
 * labelled scroll region included. What is left here is the part that is about
 * audit events rather than about diffing: three payload shapes that must not be
 * handed to a differ at all.
 */
import { useMemo } from 'react';

import { DiffViewer, diffLines, type DiffLine } from '@velobits-dev/ui';
import { prettyJson } from '@/components/json';
import { cn } from '@/ui/cn';

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

  return (
    <div className={cn('min-w-0', className)}>
      {/*
        Why the one-sided cases still say something above the diff: a wall of
        green with no explanation reads as a huge edit, when what actually
        happened is that the thing did not exist before. `DiffViewer`'s own
        summary counts the lines; it cannot know why they are all one colour.
      */}
      {beforeText === '' && (
        <p className="text-muted-foreground m-0 mb-1.5 text-[11.5px]">
          Everything here is new — there was no previous value.
        </p>
      )}
      {afterText === '' && (
        <p className="text-muted-foreground m-0 mb-1.5 text-[11.5px]">
          Everything here is gone — the payload was removed.
        </p>
      )}
      <DiffViewer lines={lines} label="Payload diff" />
    </div>
  );
}
