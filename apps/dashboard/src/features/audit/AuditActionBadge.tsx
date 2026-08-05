/**
 * One event's action, as an icon plus a word.
 *
 * The raw `action` string stays reachable through the `title` - "CHANGED" is
 * what a reader wants and `flag.update` is what they will paste into a support
 * thread, and a viewer that only shows the friendly label makes the machine
 * value unrecoverable from the screen.
 *
 * Colour is never the only channel: every tone in `TONE_CLASS` arrives with its
 * own glyph, for the same reason `FlagStatusBadge` carries one.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/ui/cn';

import { TONE_CLASS, type AuditEventMeta } from './audit-events';

export function AuditActionBadge({
  meta,
  action,
  className,
}: {
  meta: AuditEventMeta;
  action: string;
  className?: string;
}) {
  const Icon = meta.icon;
  return (
    <Badge
      variant="secondary"
      title={action}
      className={cn(
        'gap-1 border-transparent px-1.5 text-[11px] font-semibold whitespace-nowrap',
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      <Icon size={11} className="shrink-0" />
      {meta.badge}
    </Badge>
  );
}
