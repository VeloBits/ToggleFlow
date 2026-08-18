/**
 * API keys for the current environment.
 *
 * Two dialogs, and the order between them is the whole feature: creating a key
 * closes the form and opens a reveal that shows the token once. The server keeps
 * only a hash, so there is no second chance and no "show it again" affordance to
 * offer - which is why the reveal is a `CodeBlock variant="terminal"`, the one
 * surface in the system whose colours do not flip between light and dark. A
 * string that has to be transcribed exactly should look the same to everyone.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyIcon, LockIcon, PlusIcon } from '@velobits-dev/icons';
import {
  Badge,
  Button,
  CodeBlock,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@velobits-dev/ui';
import { useState } from 'react';

import { api, type ApiKey } from '../api/client';
import { DialogActions, DialogForm } from '../components/form';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ConfirmButton, ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { cn } from '../ui/cn';

/**
 * The dense small-caps column header shared with the flags and audit tables.
 * Inlined rather than imported: `flag-columns.ts` owns it for a registry this
 * page does not have, and a three-column table does not justify a dependency on
 * the flags feature.
 */
const HEAD_CLASS =
  'text-muted-foreground h-9 text-[11.5px] font-semibold tracking-[0.03em] uppercase';

export function ApiKeysPage() {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; kind: 'server' | 'client' }>({
    name: '',
    kind: 'server',
  });
  const [revealed, setRevealed] = useState<ApiKey | null>(null);
  const isAdmin = ws.role === 'admin';

  const keysQuery = useQuery({
    queryKey: ['keys', ws.environmentId],
    queryFn: () => api.get<ApiKey[]>(`/v1/environments/${ws.environmentId}/keys`),
    enabled: ws.environmentId !== null && isAdmin,
  });
  const create = useMutation({
    mutationFn: () => api.post<ApiKey>(`/v1/environments/${ws.environmentId}/keys`, form),
    onSuccess: async (key) => {
      await queryClient.invalidateQueries({ queryKey: ['keys', ws.environmentId] });
      setCreating(false);
      setForm({ name: '', kind: 'server' });
      setRevealed(key);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keys', ws.environmentId] }),
  });

  /*
   * A permission, not a guard: there is nothing a non-admin could do here, so
   * the surface says why rather than rendering an empty table. The query is
   * disabled for them too, so no key is ever fetched into a browser that may
   * not see one.
   */
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="API keys" />
        <Panel>
          <EmptyState
            icon={<LockIcon />}
            title="Admins only"
            description="API keys are managed by org admins."
          />
        </Panel>
      </>
    );
  }

  const keys = keysQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="API keys"
        description={`scoped to ${ws.environment?.name ?? '…'}`}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> Create key
          </Button>
        }
      />
      <ErrorNote error={keysQuery.error ?? revoke.error} />

      <Panel>
        {keys.length === 0 ? (
          <EmptyState
            icon={<KeyIcon />}
            title="No keys for this environment yet."
            description="An SDK authenticates with a key scoped to one environment, so a key issued here can never read another environment's flags."
          />
        ) : (
          // `surface="none"`: the Panel above is the glass surface. A second one
          // here would be glass inside glass — the two composite ~2/255 apart,
          // both layers vanish, and it reads as a rendering bug.
          <Table aria-label="API keys" surface="none">
            <TableHeader className="bg-bg2">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>Name</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-24')}>Kind</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-40')}>Prefix</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-44')}>Created</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-24')}>Status</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-32 text-right')}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id} className="[&>td]:py-2.5">
                  <TableCell className="text-fg font-medium">{key.name}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">{key.kind}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px]">{key.prefix}…</TableCell>
                  <TableCell className="text-muted-foreground text-[12.5px] tabular-nums">
                    {new Date(key.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {/*
                      Not a `StatusChip`: that component's vocabulary is a flag's
                      ON/OFF/rollout, and a revoked key is neither. The semantic
                      Badge variants carry the same success/danger tone without
                      borrowing a label that means something else in this product.
                    */}
                    {key.revokedAt ? (
                      <Badge variant="danger">revoked</Badge>
                    ) : (
                      <Badge variant="success">active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!key.revokedAt && (
                      <ConfirmButton
                        variant="destructive"
                        label="Revoke"
                        confirmLabel="Revoke permanently?"
                        onConfirm={() => revoke.mutate(key.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {creating && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setCreating(false);
          }}
        >
          <DialogContent focusFirstField aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
            </DialogHeader>
            <DialogForm
              onSubmit={() => {
                if (form.name.trim() && !create.isPending) create.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <Field id="key-name" describedBy={false}>
                <FieldLabel>Name</FieldLabel>
                <FieldControl>
                  <Input
                    placeholder="production backend"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </FieldControl>
              </Field>
              <Field id="key-kind" describedBy={false}>
                <FieldLabel>Kind</FieldLabel>
                <FieldControl>
                  <NativeSelect
                    value={form.kind}
                    onChange={(e) =>
                      setForm({ ...form, kind: e.target.value as 'server' | 'client' })
                    }
                  >
                    <option value="server">server - secret, backend only</option>
                    <option value="client">client - safe to expose in browsers</option>
                  </NativeSelect>
                </FieldControl>
              </Field>
              <ErrorNote error={create.error} />
              <DialogActions
                submitLabel="Create"
                disabled={!form.name.trim()}
                pending={create.isPending}
                onClose={() => setCreating(false)}
              />
            </DialogForm>
          </DialogContent>
        </Dialog>
      )}

      {revealed && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setRevealed(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Copy your key now</DialogTitle>
              <DialogDescription>
                This is the only time the full key is shown. Store it somewhere safe - only a hash
                is kept.
              </DialogDescription>
            </DialogHeader>
            {/*
              `copyable` rather than a Copy button in the footer: the control
              belongs next to the value it copies, and it reports success through
              a live region, which the hand-rolled button never did. `wrap` is
              what stops a 64-character key overflowing the dialog.
            */}
            <CodeBlock variant="terminal" wrap copyable label="API key">
              {revealed.token ?? ''}
            </CodeBlock>
            <DialogFooter className="mt-5">
              <Button variant="primary" onClick={() => setRevealed(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
