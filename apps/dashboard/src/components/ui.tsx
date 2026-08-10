/**
 * Small shared UI atoms that know product concepts.
 *
 * ## What lives here now
 *
 * Only things the design system cannot know about: a flag's ON/OFF/% chip, and a
 * two-step confirm whose arming timer is a product decision. Everything that was
 * generic — the modal, the error note, the chip's own paint — is the system's.
 *
 * `components/ui/` (the directory of vendored shadcn primitives) is **gone**;
 * `Button`, `Input`, `Table` and friends now come straight from
 * `@velobits-dev/ui`. The bare specifier `@/components/ui` still resolves to
 * THIS file, so no call site of these three had to move.
 */
import { AlertTriangleIcon } from '@velobits-dev/icons';
import { Alert, AlertDescription, Button, StatusChip as SystemStatusChip } from '@velobits-dev/ui';
import { useEffect, useRef, useState } from 'react';

/**
 * A flag's state as a chip, for the surfaces that only have `enabled` and
 * `rolloutPercent` to hand (Segments, Search, the guest mock).
 *
 * `features/flags/FlagStatusBadge` is the richer version — it also knows about
 * archived flags — and both now render the system's `StatusChip`, so the two
 * cannot drift in appearance.
 */
export function StatusChip({
  enabled,
  rolloutPercent,
}: {
  enabled: boolean;
  rolloutPercent: number | null;
}) {
  if (!enabled) return <SystemStatusChip status="off" />;
  /*
   * `partial` is the system's name for a rollout. The percentage replaces the
   * word, which is why the rename is invisible here: a chip reading "37%" says
   * more than one reading "PARTIAL".
   */
  if (rolloutPercent !== null)
    return <SystemStatusChip status="partial">{rolloutPercent}%</SystemStatusChip>;
  return <SystemStatusChip status="on" />;
}

/**
 * Two-step confirm: the first click arms it ("Confirm?"), a second click within
 * 4s executes. Used for kill-switch flips on prod environments and for deletes.
 *
 * ## Why this is not just `<Button variant="destructive">`
 *
 * The arming timer, and the disarm-on-disable effect below, are the whole point:
 * they make an irreversible action need two deliberate clicks without opening a
 * dialog for it. The system has no opinion on that, so the behaviour lives here
 * and the paint comes from `Button`.
 *
 * ## The armed state is not signalled by colour alone
 *
 * Arming swaps the variant to `destructive` AND changes the label to
 * `confirmLabel`, so the state is legible without perceiving the colour change
 * (WCAG 1.4.1). `data-armed` is exposed for tests and for callers that need to
 * style around it.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  className,
  onConfirm,
  requireConfirm = true,
  disabled = false,
  variant = 'destructive',
  size = 'sm',
}: {
  label: string;
  confirmLabel: string;
  className?: string;
  onConfirm: () => void;
  requireConfirm?: boolean;
  /**
   * For guards rather than permissions — "you may not delete the environment you
   * are standing in". The button stays on the page (its `title` carries the
   * reason) instead of vanishing and leaving the absence to be decoded.
   */
  disabled?: boolean;
  /**
   * The at-rest variant. Armed always becomes `destructive`.
   *
   * `primary` is in the union because not every two-step action is destructive:
   * turning a kill switch back ON is the page's main action and should look
   * like it. The arming step is what makes it deliberate, not the colour.
   */
  variant?: 'primary' | 'destructive' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
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
    <Button
      type="button"
      disabled={disabled}
      data-armed={armed || undefined}
      variant={armed ? 'destructive' : variant}
      size={size}
      className={className}
      onClick={click}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

/**
 * A failed request, rendered where the user was working.
 *
 * `role="alert"` comes from the system's `Alert` in its `danger` variant, and the
 * icon means the failure is not signalled by colour alone. Renders nothing when
 * there is no error, so it can sit unconditionally above a form.
 */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="danger" className="mb-3">
      <AlertTriangleIcon />
      <AlertDescription>{error instanceof Error ? error.message : String(error)}</AlertDescription>
    </Alert>
  );
}
