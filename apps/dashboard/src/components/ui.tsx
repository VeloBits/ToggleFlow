/** Small shared UI atoms - functional and clean over pretty (MVP admin surface). */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Dialog } from '../ui/dialog';

export function StatusChip({
  enabled,
  rolloutPercent,
}: {
  enabled: boolean;
  rolloutPercent: number | null;
}) {
  if (!enabled) return <span className="chip chip-off">OFF</span>;
  if (rolloutPercent !== null) return <span className="chip chip-rollout">{rolloutPercent}%</span>;
  return <span className="chip chip-on">ON</span>;
}

/**
 * Two-step confirm: first click arms it ("Confirm?"), second click within 4s
 * executes. Used for kill-switch flips on prod environments.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  className,
  onConfirm,
  requireConfirm = true,
  disabled = false,
}: {
  label: string;
  confirmLabel: string;
  className?: string;
  onConfirm: () => void;
  requireConfirm?: boolean;
  /**
   * For guards rather than permissions - "you may not delete the environment
   * you are standing in". The button stays on the page (its `title` carries
   * the reason) instead of vanishing and leaving the absence to be decoded.
   */
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Disarm if the button is disabled mid-countdown, so it cannot come back
  // already armed and fire on the next single click.
  useEffect(() => {
    if (!disabled) return;
    clearTimeout(timer.current);
    setArmed(false);
  }, [disabled]);

  const click = () => {
    if (!requireConfirm || armed) {
      clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 4000);
  };
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${className ?? ''} ${armed ? 'armed' : ''}`}
      onClick={click}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Kept as the page-facing API; now backed by Radix (focus trap, Esc, aria). */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      {children}
    </Dialog>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="error-note">{error instanceof Error ? error.message : String(error)}</p>;
}
