/**
 * Segments: named, reusable targeting groups scoped to a project.
 *
 * A segment is a list of conditions that must all match, authored as raw JSON
 * and validated against the engine's own `conditionSchema` before it is sent -
 * so the dashboard can never store a rule the evaluator would refuse. The
 * validation runs on save rather than on every keystroke: a half-typed object is
 * invalid for as long as it takes to type one, and a field that flashes red
 * mid-word teaches people to stop reading it.
 */
import { conditionSchema } from '@toggleflow/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, TargetIcon } from '@velobits-dev/icons';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@velobits-dev/ui';
import { useState } from 'react';
import { z } from 'zod';

import { api, type Segment } from '../api/client';
import { DialogActions, DialogForm } from '../components/form';
import { JsonField } from '../components/JsonField';
import { prettyJson } from '../components/json';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ConfirmButton, ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { cn } from '../ui/cn';

const conditionsSchema = z.array(conditionSchema);

/** The dense small-caps column header shared with the flags and audit tables. */
const HEAD_CLASS =
  'text-muted-foreground h-9 text-[11.5px] font-semibold tracking-[0.03em] uppercase';

function SegmentDialog({
  projectId,
  segment,
  onClose,
}: {
  projectId: string;
  segment: Segment | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    key: segment?.key ?? '',
    name: segment?.name ?? '',
    description: segment?.description ?? '',
    rules: prettyJson(segment?.rules ?? [{ attribute: 'plan', operator: 'in', values: ['pro'] }]),
  });
  const [rulesError, setRulesError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (rules: unknown[]) =>
      segment
        ? api.patch(`/v1/segments/${segment.id}`, {
            name: form.name.trim(),
            description: form.description.trim() || null,
            rules,
          })
        : api.post(`/v1/projects/${projectId}/segments`, {
            key: form.key.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            rules,
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['segments', projectId] });
      onClose();
    },
  });

  const submit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.rules);
    } catch {
      setRulesError('Not valid JSON.');
      return;
    }
    const checked = conditionsSchema.safeParse(parsed);
    if (!checked.success) {
      setRulesError(
        checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
      return;
    }
    setRulesError(null);
    save.mutate(checked.data);
  };

  const incomplete = !form.name.trim() || (!segment && !form.key.trim());

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent size="lg" focusFirstField aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{segment ? `Edit ${segment.key}` : 'New segment'}</DialogTitle>
        </DialogHeader>
        <DialogForm
          onSubmit={() => {
            if (!incomplete && !save.isPending) submit();
          }}
          className="flex flex-col gap-4"
        >
          {/* The key is immutable once assigned - SDKs address segments by it -
              so an edit is not offered the field at all. */}
          {!segment && (
            <Field id="segment-key" describedBy={false}>
              <FieldLabel>Key</FieldLabel>
              <FieldControl>
                <Input
                  className="font-mono"
                  placeholder="beta-users"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                />
              </FieldControl>
            </Field>
          )}
          <Field id="segment-name" describedBy={false}>
            <FieldLabel>Name</FieldLabel>
            <FieldControl>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FieldControl>
          </Field>
          <Field id="segment-desc" describedBy={false}>
            <FieldLabel>Description</FieldLabel>
            <FieldControl>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FieldControl>
          </Field>
          {/*
            `JsonField` rather than a hand-rolled textarea: it is the same
            control the flag detail page uses for targeting rules and config
            payloads, and it owns the `aria-describedby` wiring that keeps the
            format hint and the parse error both announced instead of swapping
            one for the other.
          */}
          <JsonField
            id="segment-rules"
            label="Conditions (ALL must match)"
            value={form.rules}
            onChange={(rules) => setForm({ ...form, rules })}
            error={rulesError}
            hint="A JSON array of conditions, each an attribute, an operator and a value."
          />
          <ErrorNote error={save.error} />
          <DialogActions
            submitLabel="Save"
            pendingLabel="Saving…"
            disabled={incomplete}
            pending={save.isPending}
            onClose={onClose}
          />
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

export function SegmentsPage() {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Segment | null | 'new'>(null);
  const canEdit = ws.role === 'admin' || ws.role === 'developer';

  const segmentsQuery = useQuery({
    queryKey: ['segments', ws.projectId],
    queryFn: () => api.get<Segment[]>(`/v1/projects/${ws.projectId}/segments`),
    enabled: ws.projectId !== null,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/segments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['segments', ws.projectId] }),
  });

  const segments = segmentsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Segments"
        description="reusable targeting groups for this project"
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <PlusIcon size={14} /> New segment
            </Button>
          )
        }
      />
      <ErrorNote error={segmentsQuery.error ?? remove.error} />

      <Panel>
        {segments.length === 0 ? (
          <EmptyState
            icon={<TargetIcon />}
            title="No segments yet."
            // No `action` here: the page header's own create button is visible
            // in exactly the same circumstances, and two buttons for one job is
            // a choice the user has to think about.
            description="A segment names a group once - beta users, internal staff, one paying account - so every flag that targets it stays in step when the definition changes."
          />
        ) : (
          // `surface="none"`: the Panel is the glass surface.
          <Table aria-label="Segments" surface="none">
            <TableHeader className="bg-bg2">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD_CLASS, 'w-44')}>Key</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-64')}>Name</TableHead>
                <TableHead className={HEAD_CLASS}>Conditions</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-40 text-right')}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => (
                <TableRow key={segment.id} className="[&>td]:py-2.5">
                  <TableCell className="text-fg font-mono text-[12.5px]">{segment.key}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <span className="text-fg block truncate text-[13px]">{segment.name}</span>
                    {segment.description && (
                      <span className="text-muted-foreground block truncate text-[12px]">
                        {segment.description}
                      </span>
                    )}
                  </TableCell>
                  {/*
                    The raw rule, truncated with the whole of it in `title`. A
                    segment is edited as JSON, so the JSON is what identifies it
                    at a glance - a prose summary here would be a second
                    rendering of the schema to keep in step with the engine's.
                  */}
                  <TableCell className="max-w-0">
                    <span
                      className="text-muted-foreground block truncate font-mono text-[12px]"
                      title={JSON.stringify(segment.rules)}
                    >
                      {JSON.stringify(segment.rules)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <span className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(segment)}>
                          edit
                        </Button>
                        <ConfirmButton
                          variant="ghost"
                          label="delete"
                          confirmLabel="Delete segment?"
                          onConfirm={() => remove.mutate(segment.id)}
                        />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {editing !== null && ws.projectId && (
        <SegmentDialog
          projectId={ws.projectId}
          segment={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
