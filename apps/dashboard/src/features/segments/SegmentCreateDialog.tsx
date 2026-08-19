/**
 * Create a segment: name it, and land on its rule builder.
 *
 * ## Why the builder is not in this dialog
 *
 * The brief was fewest steps, and putting the rule builder here looks like it
 * saves one. It does not: a segment created with no conditions matches everyone,
 * so the rules have to be edited before the segment is useful either way - the
 * only question is whether that happens in a cramped dialog or on the page built
 * for it, next to the live preview that says whether the rule works.
 *
 * So this dialog asks for the two things a rule builder cannot infer, creates the
 * segment, and navigates straight to it. One dialog, one page, and the page you
 * land on is the one you needed. The API defaults `rules` to a single empty group,
 * so nothing is half-saved in between.
 *
 * The key is derived from the name until touched, which is the flag form's
 * behaviour and the reason nobody has to think about keys on the way in.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogActions, Form, useSubmit } from '@/components/form';
import { ErrorNote } from '@/components/ui';
import { Dialog } from '@/ui/dialog';
import { SEGMENT_KEY_PATTERN, slugifySegmentKey } from '@/ui/slug';

import { useCreateSegment } from './use-segment-mutations';

export function SegmentCreateDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateSegment();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const effectiveKey = keyEdited ? key : slugifySegmentKey(name);
  const trimmedName = name.trim();

  const keyError =
    effectiveKey === ''
      ? 'A key is required.'
      : !SEGMENT_KEY_PATTERN.test(effectiveKey)
        ? 'Lowercase letters, digits, dots, dashes and underscores only.'
        : null;
  const nameError = trimmedName === '' ? 'A name is required.' : null;

  const { error, pending, submit } = useSubmit(async () => {
    setSubmitted(true);
    /*
     * Rejected rather than returned quietly: `useSubmit` closes the dialog when
     * this promise RESOLVES, so returning would throw away the form and the
     * messages it was about to show.
     */
    if (nameError || keyError) throw new Error('Some fields need attention.');

    const segment = await create.mutateAsync({
      key: effectiveKey,
      name: trimmedName,
      description: description.trim() || null,
    });
    // Straight to the builder - see the docblock.
    navigate(`/segments/${segment.id}`);
  }, onClose);

  return (
    <Dialog title="Create a segment" onClose={onClose}>
      <Form onSubmit={submit}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="segment-name">Name</Label>
            <Input
              id="segment-name"
              value={name}
              placeholder="Beta users"
              aria-invalid={(submitted && Boolean(nameError)) || undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {submitted && nameError && <FieldError>{nameError}</FieldError>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="segment-key">Key</Label>
            <Input
              id="segment-key"
              value={effectiveKey}
              className="font-mono text-[12.5px]"
              aria-invalid={(submitted && Boolean(keyError)) || undefined}
              aria-describedby="segment-key-hint"
              onChange={(event) => {
                setKeyEdited(true);
                setKey(event.target.value);
              }}
            />
            <p id="segment-key-hint" className="text-muted-foreground m-0 text-[12px]">
              {submitted && keyError ? (
                <span className="text-destructive">{keyError}</span>
              ) : (
                'How targeting rules reference this segment. Derived from the name until you edit it.'
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="segment-description">Description</Label>
            <Textarea
              id="segment-description"
              rows={2}
              value={description}
              placeholder="Who is in this group, and why."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <p className="text-muted-foreground m-0 text-[12px]">
            You’ll add conditions on the next screen.
          </p>
        </div>

        <ErrorNote error={error} />
        <DialogActions
          submitLabel="Create segment"
          pendingLabel="Creating…"
          // Never disabled by validity: a disabled submit cannot say WHY, and the
          // messages above only appear once a submit has been attempted.
          disabled={false}
          pending={pending}
          onClose={onClose}
        />
      </Form>
    </Dialog>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-destructive m-0 text-[12px]">{children}</p>;
}
