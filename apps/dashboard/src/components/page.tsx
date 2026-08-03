/**
 * Page-level furniture shared by the screens this refactor introduced.
 *
 * The pages that predate it still use the legacy `.page-head` rule in
 * styles.css; these are the Tailwind replacements, and moving the older pages
 * onto them belongs with the dashboard v2 content pass, not with a change to
 * the app chrome.
 */
import type { ComponentType, ReactNode } from 'react';

import { cn } from '../ui/cn';
import type { IconProps } from '../ui/icons';

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
        <h1 className="text-text m-0 text-[20px] leading-tight font-bold">{title}</h1>
        {description && <p className="text-muted m-0 mt-1 text-[13px]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

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
    <section className={cn('border-border bg-panel rounded-lg border', className)}>
      {(title || actions) && (
        <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <h2 className="text-text m-0 text-[13px] font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<IconProps>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {Icon && <Icon size={22} className="text-muted mb-1" />}
      <p className="text-text m-0 text-[14px] font-semibold">{title}</p>
      {description && <p className="text-muted m-0 max-w-md text-[13px]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * The shared body for the surfaces whose backend does not exist yet
 * (Webhooks, Integrations, Billing).
 *
 * These have a nav row and a route because the information architecture is a
 * promise about where things will live, and moving a nav item after people
 * have learned it costs more than showing it early. What they must not do is
 * pretend: each one names what it will do, and says plainly that it is not
 * built. That is the difference between a roadmap and a dead link.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  planned,
}: {
  icon: ComponentType<IconProps>;
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
          <span className="bg-bg2 text-muted rounded-sm px-2 py-1 text-[11px] font-semibold tracking-wide uppercase">
            Not yet available
          </span>
        }
      />
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Icon size={15} className="text-muted" />
            Planned
          </span>
        }
      >
        <ul className="m-0 list-none p-4 text-[13px]">
          {planned.map((item) => (
            <li key={item} className="text-muted flex gap-2.5 py-1">
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
