/** Small shared UI atoms — functional and clean over pretty (MVP admin surface). */
import { useEffect, useRef, useState, type ReactNode } from 'react';

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
}: {
  label: string;
  confirmLabel: string;
  className?: string;
  onConfirm: () => void;
  requireConfirm?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

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
    <button type="button" className={`${className ?? ''} ${armed ? 'armed' : ''}`} onClick={click}>
      {armed ? confirmLabel : label}
    </button>
  );
}

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="error-note">{error instanceof Error ? error.message : String(error)}</p>;
}
