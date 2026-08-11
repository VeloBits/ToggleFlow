// @vitest-environment happy-dom
/**
 * The shared UI layer this app still owns after the design-system migration:
 * the flag-state chip, the two-step confirm, the error note, the theme wiring
 * and the toast queue.
 *
 * What used to be here and is not any more: the Dialog, SidePanel and
 * SegmentedControl wrappers, and `initTheme`/`isDark`/`toggleTheme`. Those files
 * are deleted — the primitives come from `@velobits-dev/ui` now and are tested
 * in that package. Re-asserting a dependency's behaviour here would only test
 * that the import statement is spelled correctly.
 *
 * What IS still tested about the theme is the app's own configuration of it:
 * that the storage key is `tf.theme`, that a stored preference beats the OS,
 * and that the class lands on `<body>` — which is what the token stylesheet
 * keys its dark palette on.
 */
import { Button, THEME_STORAGE_KEYS, VelobitsProvider, useTheme } from '@velobits-dev/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmButton, ErrorNote, StatusChip } from '../src/components/ui';
import { cn } from '../src/ui/cn';
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
    document.documentElement.className = '';
  });

  /** Mirrors main.tsx: the provider, configured with this app's storage key. */
  function renderTheme() {
    function Probe() {
      const { theme, toggle } = useTheme();
      return (
        <button type="button" onClick={toggle}>
          {theme}
        </button>
      );
    }
    return render(
      <VelobitsProvider storageKey={THEME_STORAGE_KEYS.dashboard}>
        <Probe />
      </VelobitsProvider>,
    );
  }

  it('uses `tf.theme` as its storage key', () => {
    expect(THEME_STORAGE_KEYS.dashboard).toBe('tf.theme');
  });

  it('follows the stored preference over the OS setting', () => {
    localStorage.setItem('tf.theme', 'dark');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    renderTheme();
    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(document.body.classList.contains('dark')).toBe(true);
  });

  it('honours a stored light preference even when the OS prefers dark', () => {
    localStorage.setItem('tf.theme', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    renderTheme();
    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.body.classList.contains('dark')).toBe(false);
  });

  it('falls back to the OS setting when nothing is stored', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    renderTheme();
    expect(screen.getByRole('button').textContent).toBe('dark');
  });

  it('toggle flips the class and persists the new value', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    renderTheme();
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(localStorage.getItem('tf.theme')).toBe('dark');
    expect(document.body.classList.contains('dark')).toBe(true);

    fireEvent.click(button);
    expect(localStorage.getItem('tf.theme')).toBe('light');
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});

describe('StatusChip', () => {
  it('renders OFF when disabled, whatever the rollout is', () => {
    render(<StatusChip enabled={false} rolloutPercent={50} />);
    expect(screen.getByText(/^off$/i)).toBeTruthy();
  });

  it('renders the percentage for a partial rollout', () => {
    render(<StatusChip enabled rolloutPercent={25} />);
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('renders ON for a full rollout', () => {
    render(<StatusChip enabled rolloutPercent={null} />);
    expect(screen.getByText(/^on$/i)).toBeTruthy();
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

  it('marks itself armed, and says so in words rather than only in colour', () => {
    render(<ConfirmButton label="Go" confirmLabel="Sure?" onConfirm={vi.fn()} />);
    const button = screen.getByRole('button');

    expect(button.dataset.armed).toBeUndefined();

    fireEvent.click(button);

    // The label changing is the accessible half of the signal; `data-armed` is
    // for tests and for callers that need to style around the state.
    expect(button.dataset.armed).toBe('true');
    expect(button.textContent).toBe('Sure?');
  });

  it('escalates a quiet resting variant to destructive once armed', () => {
    /*
     * Compared against a reference `Button` of each variant rather than against
     * a colour class.
     *
     * The claim under test is "the resting variant escalates to `destructive`",
     * and asserting `bg-danger` tested that only by proxy — it pinned the paint
     * the destructive variant happens to use today, so any re-tune of the
     * variant broke this test without anything actually regressing. (0.2.0
     * changed exactly that: destructive now pairs its fill with `--on-danger`.)
     * ConfirmButton renders a bare `Button` with no extra classes, so the two
     * class lists are directly comparable.
     */
    const reference = (variant: 'ghost' | 'destructive') => {
      const { unmount } = render(
        <Button variant={variant} size="sm">
          Go
        </Button>,
      );
      const className = screen.getByRole('button').className;
      unmount();
      return className;
    };
    const ghost = reference('ghost');
    const destructive = reference('destructive');
    expect(ghost).not.toBe(destructive);

    render(<ConfirmButton label="Go" confirmLabel="Sure?" variant="ghost" onConfirm={vi.fn()} />);
    const button = screen.getByRole('button');

    expect(button.className).toBe(ghost);

    fireEvent.click(button);

    expect(button.className).toBe(destructive);
    expect(button.dataset.armed).toBe('true');
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
