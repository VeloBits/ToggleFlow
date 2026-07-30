// @vitest-environment happy-dom
/**
 * The Accordion UI primitive: single-expand behaviour, the WAI-ARIA wiring, the
 * SEO-driven "collapsed but mounted" panel, and roving arrow-key focus.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Accordion, type AccordionItem } from '../src/ui/accordion';

afterEach(cleanup);

const items: AccordionItem[] = [
  { id: 'sdk', title: 'Which SDKs are supported?', content: <p>Node, browser and edge.</p> },
  {
    id: 'latency',
    title: 'How fast is a flag read?',
    content: <p>Sub-millisecond, in-process.</p>,
  },
  { id: 'pricing', title: 'What does it cost?', content: <p>Free while in beta.</p> },
];

const trigger = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

/** Resolves the panel through `aria-controls`, so every lookup exercises the wiring. */
function panelFor(name: string) {
  const id = trigger(name).getAttribute('aria-controls');
  expect(id).toBeTruthy();
  const panel = document.getElementById(id as string);
  expect(panel).toBeTruthy();
  return panel as HTMLElement;
}

const isOpen = (name: string) => trigger(name).getAttribute('aria-expanded') === 'true';

describe('Accordion open state', () => {
  it('expands only the defaultOpenId item on first render', () => {
    render(<Accordion items={items} defaultOpenId="latency" />);
    expect(isOpen('How fast')).toBe(true);
    expect(isOpen('Which SDKs')).toBe(false);
    expect(isOpen('What does it cost')).toBe(false);
  });

  it('starts fully collapsed when no defaultOpenId is given', () => {
    render(<Accordion items={items} />);
    expect(items.every((item) => !isOpen(String(item.title)))).toBe(true);
  });

  it('opening a row closes the one that was open — single-expand', () => {
    render(<Accordion items={items} defaultOpenId="sdk" />);
    fireEvent.click(trigger('What does it cost'));
    expect(isOpen('What does it cost')).toBe(true);
    expect(isOpen('Which SDKs')).toBe(false);
  });

  it('clicking the open row collapses it, so "none open" is reachable', () => {
    render(<Accordion items={items} defaultOpenId="sdk" />);
    fireEvent.click(trigger('Which SDKs'));
    expect(isOpen('Which SDKs')).toBe(false);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('drives the height animation off the grid-template-rows swap, not a max-height', () => {
    render(<Accordion items={items} defaultOpenId="sdk" />);
    expect(panelFor('Which SDKs').className).toContain('grid-rows-[1fr]');
    expect(panelFor('How fast').className).toContain('grid-rows-[0fr]');
  });
});

describe('Accordion ARIA wiring', () => {
  it('links each trigger to its panel in both directions', () => {
    render(<Accordion items={items} defaultOpenId="sdk" />);
    const button = trigger('Which SDKs');
    const panel = panelFor('Which SDKs');

    expect(button.id).toBe('sdk-trigger');
    expect(button.getAttribute('aria-controls')).toBe('sdk-panel');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe('sdk-trigger');
  });

  it('exposes only the open panel as a region to assistive tech', () => {
    render(<Accordion items={items} defaultOpenId="latency" />);
    // The default byRole query skips aria-hidden subtrees, so this is the a11y-tree view.
    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(1);
    expect(regions[0]?.id).toBe('latency-panel');
  });

  it('keeps collapsed answers in the DOM for crawlers but hides them from the a11y tree', () => {
    render(<Accordion items={items} defaultOpenId="sdk" />);
    const collapsed = panelFor('What does it cost');

    // Server-rendered text must still be there — this page is the only crawlable surface.
    expect(collapsed.textContent).toContain('Free while in beta.');
    expect(collapsed.getAttribute('aria-hidden')).toBe('true');
    expect(collapsed.hasAttribute('inert')).toBe(true);

    // ...and the open one carries neither.
    const open = panelFor('Which SDKs');
    expect(open.hasAttribute('aria-hidden')).toBe(false);
    expect(open.hasAttribute('inert')).toBe(false);
  });
});

describe('Accordion keyboard navigation', () => {
  const arrow = (from: string, key: string) => {
    const button = trigger(from);
    button.focus();
    fireEvent.keyDown(button, { key });
  };

  it('ArrowDown/ArrowUp walk the triggers', () => {
    render(<Accordion items={items} />);
    arrow('Which SDKs', 'ArrowDown');
    expect(document.activeElement).toBe(trigger('How fast'));
    arrow('How fast', 'ArrowUp');
    expect(document.activeElement).toBe(trigger('Which SDKs'));
  });

  it('wraps at both ends rather than dead-ending', () => {
    render(<Accordion items={items} />);
    arrow('What does it cost', 'ArrowDown');
    expect(document.activeElement).toBe(trigger('Which SDKs'));
    arrow('Which SDKs', 'ArrowUp');
    expect(document.activeElement).toBe(trigger('What does it cost'));
  });

  it('Home and End jump to the first and last trigger', () => {
    render(<Accordion items={items} />);
    arrow('How fast', 'End');
    expect(document.activeElement).toBe(trigger('What does it cost'));
    arrow('How fast', 'Home');
    expect(document.activeElement).toBe(trigger('Which SDKs'));
  });

  it('does not move focus or open anything on Tab', () => {
    render(<Accordion items={items} />);
    arrow('How fast', 'Tab');
    expect(document.activeElement).toBe(trigger('How fast'));
    expect(isOpen('How fast')).toBe(false);
  });
});

describe('Accordion headingLevel', () => {
  it('wraps triggers in an h3 by default', () => {
    render(<Accordion items={items} />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(items.length);
  });

  it('honours the requested level so it fits the host page outline', () => {
    const { unmount } = render(<Accordion items={items} headingLevel={2} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(items.length);
    unmount();

    render(<Accordion items={items} headingLevel={4} />);
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(items.length);
  });
});
