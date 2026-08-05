// @vitest-environment happy-dom
/**
 * The shared UI layer: class merging, theme persistence, the Radix-backed
 * Dialog and SegmentedControl wrappers, and the toast queue.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmButton, ErrorNote, Modal, StatusChip } from '../src/components/ui';
import { cn } from '../src/ui/cn';
import { Dialog } from '../src/ui/dialog';
import { SegmentedControl } from '../src/ui/segmented-control';
import { SidePanel } from '../src/ui/side-panel';
import { initTheme, isDark, toggleTheme } from '../src/ui/theme';
import { ToastProvider, useToast } from '../src/ui/toast';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('cn', () => {
  it('lets a later Tailwind utility win over an earlier conflicting one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values and flattens conditionals', () => {
    // Held in a variable so the condition is not a compile-time constant.
    const active = false;
    expect(cn('a', active && 'b', undefined, ['c', null])).toBe('a c');
  });
});

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('follows the stored preference over the OS setting', () => {
    localStorage.setItem('tf.theme', 'dark');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    initTheme();
    expect(isDark()).toBe(true);
  });

  it('honours a stored light preference even when the OS prefers dark', () => {
    localStorage.setItem('tf.theme', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    initTheme();
    expect(isDark()).toBe(false);
  });

  it('falls back to the OS setting when nothing is stored', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    initTheme();
    expect(isDark()).toBe(true);
  });

  it('toggle flips the class and persists the new value', () => {
    expect(toggleTheme()).toBe(true);
    expect(localStorage.getItem('tf.theme')).toBe('dark');
    expect(toggleTheme()).toBe(false);
    expect(localStorage.getItem('tf.theme')).toBe('light');
    expect(isDark()).toBe(false);
  });
});

describe('StatusChip', () => {
  it('renders OFF when disabled, whatever the rollout is', () => {
    render(<StatusChip enabled={false} rolloutPercent={50} />);
    expect(screen.getByText('OFF')).toBeTruthy();
  });

  it('renders the percentage for a partial rollout', () => {
    render(<StatusChip enabled rolloutPercent={25} />);
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('renders ON for a full rollout', () => {
    render(<StatusChip enabled rolloutPercent={null} />);
    expect(screen.getByText('ON')).toBeTruthy();
  });

  it('renders 0% rather than ON - a zero rollout is not the same as off', () => {
    render(<StatusChip enabled rolloutPercent={0} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });
});

describe('ConfirmButton', () => {
  it('requires a second click, and re-arms rather than firing on the first', () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Disable" confirmLabel="Confirm?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button').textContent).toBe('Confirm?');

    fireEvent.click(screen.getByRole('button'));
    expect(onConfirm).toHaveBeenCalledOnce();
    // Back to the resting label, ready to be armed again.
    expect(screen.getByRole('button').textContent).toBe('Disable');
  });

  it('disarms itself after the 4s window', () => {
    vi.useFakeTimers();
    try {
      const onConfirm = vi.fn();
      render(<ConfirmButton label="Disable" confirmLabel="Confirm?" onConfirm={onConfirm} />);
      fireEvent.click(screen.getByRole('button'));
      // The disarm runs in a setTimeout, so the re-render needs an act scope.
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.getByRole('button').textContent).toBe('Disable');
      // The next click only arms again - it must not execute.
      fireEvent.click(screen.getByRole('button'));
      expect(onConfirm).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires immediately when confirmation is not required', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        label="Enable"
        confirmLabel="Confirm?"
        requireConfirm={false}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('passes the caller class through alongside the armed marker', () => {
    render(
      <ConfirmButton label="Go" confirmLabel="Sure?" className="danger" onConfirm={vi.fn()} />,
    );
    const button = screen.getByRole('button');
    expect(button.className).toContain('danger');
    fireEvent.click(button);
    expect(button.className).toContain('armed');
  });
});

describe('ErrorNote', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorNote error={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders an Error message', () => {
    render(<ErrorNote error={new Error('role too low')} />);
    expect(screen.getByText('role too low')).toBeTruthy();
  });

  it('stringifies a non-Error rejection', () => {
    render(<ErrorNote error="plain string failure" />);
    expect(screen.getByText('plain string failure')).toBeTruthy();
  });
});

describe('Dialog / Modal', () => {
  it('renders the title and children, and closes via the X button', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="New project" onClose={onClose}>
        <p>body content</p>
      </Dialog>,
    );
    expect(screen.getByText('New project')).toBeTruthy();
    expect(screen.getByText('body content')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape - Radix owns the key handling', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Closable" onClose={onClose}>
        <p>x</p>
      </Dialog>,
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Modal delegates to Dialog with the page-facing props', () => {
    render(
      <Modal title="Example dialog" onClose={vi.fn()}>
        <p>fields</p>
      </Modal>,
    );
    expect(screen.getByText('Example dialog')).toBeTruthy();
    expect(screen.getByText('fields')).toBeTruthy();
  });

  /*
   * Focus on open. Radix's focus scope grabs the first tabbable element, which
   * is the header ✕ - so a field's own `autoFocus` loses and the first
   * keystroke in a form dialog went nowhere (Enter closed it instead). These
   * pin the redirect, because the failure is invisible until someone opens a
   * dialog with the keyboard.
   */
  it('focuses the first form field rather than the close button', async () => {
    render(
      <Dialog title="New environment" onClose={vi.fn()}>
        <input id="first" />
        <input id="second" />
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement?.id).toBe('first'));
  });

  it('skips a disabled field', async () => {
    render(
      <Dialog title="Partly locked" onClose={vi.fn()}>
        <input id="locked" disabled />
        <select id="pickable" />
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement?.id).toBe('pickable'));
  });

  it('leaves Radix to it when there is no field', async () => {
    render(
      <Dialog title="Your new key" onClose={vi.fn()}>
        <p>tf_srv_abc…</p>
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Close'));
  });

  it('lets a caller override the target', async () => {
    render(
      <Dialog
        title="Switch organization"
        onClose={vi.fn()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById('second')?.focus();
        }}
      >
        <input id="first" />
        <input id="second" />
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement?.id).toBe('second'));
  });
});

describe('SidePanel', () => {
  it('renders the title, description, body and footer, and closes via the X button', () => {
    const onClose = vi.fn();
    render(
      <SidePanel
        title="flag.updated"
        description="Ada Lovelace · 2 minutes ago"
        onClose={onClose}
        footer={<button type="button">Copy payload</button>}
      >
        <pre>{'{ "enabled": true }'}</pre>
      </SidePanel>,
    );
    expect(screen.getByText('flag.updated')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace · 2 minutes ago')).toBeTruthy();
    expect(screen.getByText('{ "enabled": true }')).toBeTruthy();
    expect(screen.getByText('Copy payload')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape - Radix owns the key handling', async () => {
    const onClose = vi.fn();
    render(
      <SidePanel title="Closable" onClose={onClose}>
        <p>x</p>
      </SidePanel>,
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  /*
   * The deliberate difference from Dialog: this is a reading surface, so focus
   * stays where Radix put it (the ✕) even when the body happens to contain a
   * field. Pinned because the two primitives look identical from a call site and
   * the next person to touch either one will assume they behave the same.
   */
  it('does not redirect focus to a field the way Dialog does', async () => {
    render(
      <SidePanel title="Event detail" onClose={vi.fn()}>
        <input id="filter" />
      </SidePanel>,
    );
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Close'));
  });

  it('points aria-describedby at the description, and omits it when there is none', () => {
    const { unmount } = render(
      <SidePanel title="Described" description="who, what, when" onClose={vi.fn()}>
        <p>x</p>
      </SidePanel>,
    );
    const describedBy = screen.getByRole('dialog').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe('who, what, when');

    unmount();
    render(
      <SidePanel title="Bare" onClose={vi.fn()}>
        <p>x</p>
      </SidePanel>,
    );
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'dev', label: 'Development' },
    { value: 'prod', label: 'Production', tone: 'danger' as const },
  ];

  it('reports a new selection', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        value="dev"
        onValueChange={onValueChange}
        options={options}
        aria-label="Environment"
      />,
    );
    fireEvent.click(screen.getByText('Production'));
    expect(onValueChange).toHaveBeenCalledWith('prod');
  });

  it('ignores a deselect - the selection can never be empty', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        value="dev"
        onValueChange={onValueChange}
        options={options}
        aria-label="Environment"
      />,
    );
    // Clicking the active item is what Radix reports as an empty value.
    fireEvent.click(screen.getByText('Development'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('marks the active option for assistive tech', () => {
    render(
      <SegmentedControl
        value="prod"
        onValueChange={vi.fn()}
        options={options}
        aria-label="Environment"
      />,
    );
    expect(screen.getByText('Production').getAttribute('data-state')).toBe('on');
    expect(screen.getByText('Development').getAttribute('data-state')).toBe('off');
  });
});

describe('toast', () => {
  function Trigger() {
    const toast = useToast();
    const [n, setN] = useState(0);
    return (
      <>
        <button type="button" onClick={() => toast(`saved ${n}`)}>
          save
        </button>
        <button type="button" onClick={() => toast('failed', { variant: 'error' })}>
          fail
        </button>
        <button type="button" onClick={() => setN(n + 1)}>
          bump
        </button>
      </>
    );
  }

  it('queues multiple toasts at once', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('save'));
    fireEvent.click(screen.getByText('bump'));
    fireEvent.click(screen.getByText('save'));

    expect(screen.getByText('saved 0')).toBeTruthy();
    expect(screen.getByText('saved 1')).toBeTruthy();
  });

  it('renders an error variant', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fail'));
    expect(screen.getByText('failed')).toBeTruthy();
  });

  it('useToast outside a provider is a no-op rather than a crash', () => {
    // A page rendered in isolation should not explode on a stray toast call.
    render(<Trigger />);
    expect(() => fireEvent.click(screen.getByText('save'))).not.toThrow();
  });
});
