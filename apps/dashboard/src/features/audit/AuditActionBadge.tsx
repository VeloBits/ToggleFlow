/**
 * One event's action, as an icon plus a word.
 *
 * The raw `action` string stays reachable through the `title` - "CHANGED" is
 * what a reader wants and `flag.update` is what they will paste into a support
 * thread, and a viewer that only shows the friendly label makes the machine
 * value unrecoverable from the screen.
 *
 * Colour is never the only channel: every tone in `TONE_VARIANT` arrives with
 * its own glyph, for the same reason `FlagStatusBadge` carries one.
 */
import { Badge } from '@velobits-dev/ui';
import { cn } from '@/ui/cn';

import { TONE_VARIANT, type AuditEventMeta } from './audit-events';

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
      variant={TONE_VARIANT[meta.tone]}
      title={action}
      // Only the density is local: the tone's wash, text colour and border all
      // come from the variant now, so there is nothing here to drift out of step
      // with the rest of the app's badges.
      className={cn('gap-1 px-1.5 text-[11px] font-semibold', className)}
    >
      <Icon size={11} className="shrink-0" />
      {meta.badge}
    </Badge>
  );
}
