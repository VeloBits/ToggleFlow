/**
 * The navigation rail: primary links, then the product sections, then the
 * account footer (AccountMenu).
 *
 * One column at `md` and up; below that the same markup is rendered as an
 * overlay drawer by Layout, which is why this component takes no responsibility
 * for its own positioning - it fills whatever box it is given.
 */
import { NavLink } from 'react-router-dom';

import { cn } from '../../ui/cn';
import { AccountMenu } from './AccountMenu';
import { NAV_SECTIONS } from './nav-items';

const ROW = [
  'flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] no-underline',
  'transition-colors duration-100 motion-reduce:transition-none',
  'focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none',
].join(' ');

/**
 * `aria-current="page"` is what NavLink sets on the active row, and it is the
 * accessible half of the highlight - the accent fill is the visible half. The
 * left bar is a third, redundant channel for anyone who cannot separate the
 * accent tint from the panel behind it.
 */
const ROW_ACTIVE = 'bg-accent-soft text-accent font-semibold';
const ROW_IDLE = 'text-text hover:bg-highlight';

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    // `w-full` is load-bearing: Layout's desktop rail is `display: flex`, and a
    // flex item is sized by its content along the main axis. Without it the
    // panel background, the row highlights and the footer border all stop at
    // the width of the longest label - so the rail visibly changed width when
    // the org name in the footer got shorter.
    <div className="bg-panel flex h-full min-h-0 w-full flex-col">
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label ?? 'primary'}>
            {index > 0 && <hr className="border-border/70 mx-1 my-2.5 border-0 border-t" />}
            {section.label && (
              <p className="text-muted m-0 px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(ROW, 'relative mb-0.5', isActive ? ROW_ACTIVE : ROW_IDLE)
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="bg-accent absolute top-1/2 -left-2 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
                      />
                    )}
                    <item.icon
                      size={16}
                      className={cn('shrink-0', isActive ? 'text-accent' : 'text-muted')}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.soon && (
                      <span className="bg-bg2 text-muted ml-auto shrink-0 rounded-sm px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
                        Soon
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-border shrink-0 border-t p-2">
        <AccountMenu onNavigate={onNavigate} />
      </div>
    </div>
  );
}
