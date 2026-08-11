/**
 * Page-level furniture: the three shapes every screen in the app is built from.
 *
 * All three are thin compositions over the design system rather than markup of
 * their own. They exist because a page header, a titled panel and a "not built
 * yet" body are product decisions about layout, not components the system should
 * own — but the surfaces they paint (`Card`, `EmptyState`) come from it.
 *
 * `EmptyState` is no longer defined here at all: it is re-exported from
 * `@velobits-dev/ui` so the ~10 call sites keep one import path. The system's
 * version takes `icon` as a NODE (`icon={<FlagIcon />}`) where this app's took a
 * component type (`icon={FlagIcon}`) — that is the one call-site change.
 */
import { Card, CardAction, CardContent, CardHeader } from '@velobits-dev/ui';
import type { ReactNode } from 'react';

import { cn } from '../ui/cn';

export { EmptyState } from '@velobits-dev/ui';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-fg m-0 text-[20px] leading-tight font-bold">{title}</h1>
        {description && <p className="text-muted-foreground m-0 mt-1 text-[13px]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A titled section, on the design system's `Card` surface.
 *
 * Two deliberate departures from the system's default Card metrics:
 *
 * - `gap-0 py-0` and an unpadded `CardContent`, because most callers put a table
 *   or a full-bleed list inside and pad it themselves when they do not. A Card's
 *   own `py-4` would inset the first table row from the header rule.
 * - The title is a real `<h2>` rather than `CardTitle` (a styled `div`). Panel
 *   titles are document structure — a screen-reader user navigating by heading
 *   should find them — and the app's 13px header metric is denser than the
 *   system's `text-base` anyway.
 */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {(title || actions) && (
        <CardHeader className="border-border items-center gap-3 border-b px-4 py-2.5">
          <h2 className="text-fg m-0 text-[13px] font-semibold">{title}</h2>
          {actions && <CardAction>{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

/**
 * The shared body for the surfaces whose backend does not exist yet
 * (Webhooks, Integrations, Billing).
 *
 * These have a nav row and a route because the information architecture is a
 * promise about where things will live, and moving a nav item after people have
 * learned it costs more than showing it early. What they must not do is pretend:
 * each one names what it will do, and says plainly that it is not built. That is
 * the difference between a roadmap and a dead link.
 */
export function ComingSoon({
  icon,
  title,
  description,
  planned,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <span className="bg-bg2 text-muted-foreground rounded-sm px-2 py-1 text-[11px] font-semibold tracking-wide uppercase">
            Not yet available
          </span>
        }
      />
      <Panel
        title={
          <span className="text-muted-foreground flex items-center gap-2">
            {icon}
            Planned
          </span>
        }
      >
        <ul className="m-0 list-none p-4 text-[13px]">
          {planned.map((item) => (
            <li key={item} className="text-muted-foreground flex gap-2.5 py-1">
              <span aria-hidden className="text-border select-none">
                —
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
