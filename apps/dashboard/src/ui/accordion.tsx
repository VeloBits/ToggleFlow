import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from './cn';
import { ChevronDownIcon } from './icons';

export interface AccordionItem {
  /** Stable id - also seeds the trigger/panel element ids. */
  id: string;
  title: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Item open on first render; omit for all-collapsed. */
  defaultOpenId?: string;
  /** Heading level wrapping each trigger, so the accordion slots into the host page's outline. Default 3. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/**
 * The container is `rounded-xl` (10px) with a 1px border, so the *inner* radius
 * the trigger's hover fill has to follow is 9px. Only the first row's top and
 * the last row's bottom touch the container edge; every other corner is square
 * so the hover band reads as a full-bleed row. Written as one shorthand
 * `border-radius` per case rather than `rounded-none` + `rounded-t-*`, because a
 * single property can't lose a cascade-order argument with the bare
 * `button { border-radius: 6px }` rule in styles.css.
 *
 * A last row that is *open* keeps square bottom corners: its panel sits below
 * it, so it is no longer the element at the container's edge.
 */
function triggerRadius(isFirst: boolean, isLast: boolean, open: boolean) {
  const roundTop = isFirst;
  const roundBottom = isLast && !open;
  if (roundTop && roundBottom) return 'rounded-[9px]';
  if (roundTop) return 'rounded-[9px_9px_0_0]';
  if (roundBottom) return 'rounded-[0_0_9px_9px]';
  return 'rounded-none';
}

/** Same focus treatment as GuestNav/GuestFooter, so the landing page has one focus language. */
const FOCUS = 'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none';

/**
 * `styles.css` lands in Tailwind's `components` layer and styles bare `button`
 * (border, background, radius, padding). Utilities beat it, but only where one
 * is actually written - hence the explicit `border-0`, `bg-transparent`, own
 * padding and own radius. Drop any of those and the row grows a 6px-rounded
 * panel-coloured box inside the container.
 *
 * `min-h-11` keeps the row at the 44px touch minimum even if a title renders
 * unusually short.
 */
const TRIGGER = `flex w-full min-h-11 cursor-pointer items-center justify-between gap-4 border-0 bg-transparent px-5 py-4 text-left text-[15px] leading-snug font-semibold text-text transition-colors duration-200 ease-out hover:bg-highlight motion-reduce:transition-none sm:px-6 sm:py-[1.15rem] ${FOCUS}`;

/**
 * Height animation without JS measuring or a magic max-height: the panel is a
 * grid whose single row goes `0fr → 1fr`, and its child clips. `1fr` resolves to
 * the content's natural height, so a two-line answer and a ten-line answer both
 * animate correctly and reflow (wrap, font-size change, i18n) for free.
 */
const PANEL =
  'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none';

/**
 * `max-w-[70ch]` caps the measure: the FAQ container is as wide as the page's
 * content grid, and a 90-character line of 13.5px muted text is unreadable.
 * Left padding matches the trigger's so title and answer share a left edge.
 */
const PANEL_CONTENT =
  'max-w-[70ch] px-5 pb-4 text-[13.5px] leading-relaxed text-muted-foreground transition duration-200 ease-out motion-reduce:transition-none sm:px-6 sm:pb-[1.15rem]';

/**
 * Single-expand accordion (WAI-ARIA accordion pattern), uncontrolled.
 *
 * Built for the public landing page's FAQ, but generic: no Radix dependency, no
 * measured heights, no portal. Opening a row closes the previous one, and
 * clicking the open row collapses it, so "nothing open" is a reachable state.
 *
 * Element ids are derived from `item.id` (`<id>-trigger` / `<id>-panel`) so they
 * are stable and deep-linkable. That means item ids must be unique across the
 * whole page, not just within one Accordion.
 */
export function Accordion({ items, defaultOpenId, headingLevel = 3, className }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // `h2` | `h3` | `h4` as a tag name: the host page decides where the accordion
  // sits in its outline, and a heading that lies about its depth is worse than
  // no heading. The heading needs `m-0` - styles.css gives h1–h3 a 0.5rem
  // bottom margin, which would push every row off its divider.
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';

  /**
   * Roving focus across the triggers. Wraps at both ends: on a 4–8 row FAQ a
   * dead-ended ArrowDown reads as a broken key more often than a wrap surprises
   * anyone. (APG lists wrapping as optional either way.)
   */
  function focusTrigger(index: number) {
    const count = items.length;
    if (count === 0) return;
    triggerRefs.current[((index % count) + count) % count]?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowDown':
        focusTrigger(index + 1);
        break;
      case 'ArrowUp':
        focusTrigger(index - 1);
        break;
      case 'Home':
        focusTrigger(0);
        break;
      case 'End':
        focusTrigger(items.length - 1);
        break;
      default:
        // Everything else - crucially Tab, Enter and Space - stays native.
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      className={cn(
        'bg-panel border-border divide-border/60 divide-y rounded-xl border',
        className,
      )}
    >
      {items.map((item, index) => {
        const open = openId === item.id;
        const triggerId = `${item.id}-trigger`;
        const panelId = `${item.id}-panel`;
        return (
          <div key={item.id}>
            <Heading className="m-0">
              <button
                type="button"
                id={triggerId}
                ref={(node) => {
                  triggerRefs.current[index] = node;
                }}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
                onKeyDown={(event) => onTriggerKeyDown(event, index)}
                className={cn(
                  TRIGGER,
                  triggerRadius(index === 0, index === items.length - 1, open),
                )}
              >
                <span>{item.title}</span>
                <ChevronDownIcon
                  size={18}
                  aria-hidden
                  className={cn(
                    'shrink-0 transition-[transform,color] duration-200 ease-out motion-reduce:transition-none',
                    open ? 'text-primary rotate-180' : 'text-muted-foreground',
                  )}
                />
              </button>
            </Heading>

            {/*
              Collapsed panels stay MOUNTED, unlike the pattern's usual `hidden`.
              This landing page is the product's only crawlable surface, so every
              answer has to be in the served HTML for search and AI crawlers -
              `hidden` (or unmounting) would ship an FAQ with no content in it.

              The trade-off that buys is that a zero-height-but-rendered panel is
              still in the a11y tree and still tabbable, which is strictly worse
              than `hidden` for a screen reader or keyboard user. `aria-hidden`
              removes it from the a11y tree and React 19's `inert` removes it and
              its links from tab order and from find-in-page, which together get
              us back to `hidden`'s semantics while keeping the text in the DOM.
              Both must be present: `aria-hidden` alone leaves focusable
              descendants reachable, `inert` alone is not honoured everywhere yet.
            */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              aria-hidden={open ? undefined : true}
              inert={!open}
              className={cn(PANEL, open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
            >
              {/* The clip. Height comes from the grid row, so this must not add any. */}
              <div className="overflow-hidden">
                {/*
                  Padding lives here, not on the clip: on the clip it would be
                  height the `0fr` row cannot remove, leaving a collapsed panel
                  ~32px tall. The fade/rise is a separate, same-duration
                  transition so the text arrives with the height rather than
                  snapping in at the end.
                */}
                <div
                  className={cn(
                    PANEL_CONTENT,
                    open ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
                  )}
                >
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
