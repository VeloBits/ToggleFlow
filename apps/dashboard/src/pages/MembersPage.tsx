/**
 * Organization members and their roles.
 *
 * The list is readable by everyone in the org and editable only by an admin -
 * the same table either way, with the role rendered as a select or as a badge.
 * Showing a viewer the list without the controls is deliberate: knowing who can
 * flip a production flag is not privileged information, and hiding the roster
 * is how people end up asking in chat who to request access from.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, UsersIcon } from '@velobits-dev/icons';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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

import { api, type Member, type Role } from '../api/client';
import { DialogActions, DialogForm } from '../components/form';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ConfirmButton, ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { cn } from '../ui/cn';

/** The dense small-caps column header shared with the flags and audit tables. */
const HEAD_CLASS =
  'text-muted-foreground h-9 text-[11.5px] font-semibold tracking-[0.03em] uppercase';

const ROLES: Role[] = ['admin', 'developer', 'viewer'];

export function MembersPage() {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const isAdmin = ws.role === 'admin';
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ email: string; role: Role }>({ email: '', role: 'developer' });

  const membersQuery = useQuery({
    queryKey: ['members', ws.orgId],
    queryFn: () => api.get<Member[]>(`/v1/orgs/${ws.orgId}/members`),
    enabled: ws.orgId !== null,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['members', ws.orgId] });
  const add = useMutation({
    mutationFn: () => api.post(`/v1/orgs/${ws.orgId}/members`, form),
    onSuccess: async () => {
      await invalidate();
      setAdding(false);
      setForm({ email: '', role: 'developer' });
    },
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.patch(`/v1/orgs/${ws.orgId}/members/${userId}`, { role }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/v1/orgs/${ws.orgId}/members/${userId}`),
    onSuccess: invalidate,
  });

  const members = membersQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Members"
        description="admin manages everything · developer flips flags · viewer reads"
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <PlusIcon size={14} /> Add member
            </Button>
          )
        }
      />
      <ErrorNote error={membersQuery.error ?? changeRole.error ?? remove.error} />

      <Panel>
        {members.length === 0 ? (
          /*
           * Practically unreachable - whoever is looking at this page is a
           * member - but a table with a header and no rows reads as broken, and
           * the state costs less than the bug report does.
           */
          <EmptyState
            icon={<UsersIcon />}
            title="No members yet"
            description="Anyone who has signed in to ToggleFlow can be added by email. Invitations to people without an account are not available yet."
          />
        ) : (
          // `surface="none"`: the Panel is already a Card, and a nested glass
          // surface would flatten both.
          <Table aria-label="Organization members" surface="none">
            <TableHeader className="bg-bg2">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>Member</TableHead>
                <TableHead className={HEAD_CLASS}>Email</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-44')}>Role</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-32')}>Since</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'w-32 text-right')}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId} className="[&>td]:py-2.5">
                  <TableCell className="text-fg font-medium">{member.displayName ?? '-'}</TableCell>
                  <TableCell className="text-[12.5px]">{member.email}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <NativeSelect
                        aria-label={`Role for ${member.email}`}
                        className="h-8 w-36 text-xs"
                        value={member.role}
                        onChange={(e) =>
                          changeRole.mutate({ userId: member.userId, role: e.target.value as Role })
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Badge variant="primary">{member.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[12.5px] tabular-nums">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <ConfirmButton
                        variant="destructive"
                        label="Remove"
                        confirmLabel="Remove from org?"
                        onConfirm={() => remove.mutate(member.userId)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {adding && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setAdding(false);
          }}
        >
          <DialogContent focusFirstField>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
              <DialogDescription>
                They need a ToggleFlow account already (one sign-in is enough) - invitations come
                later.
              </DialogDescription>
            </DialogHeader>
            <DialogForm
              onSubmit={() => {
                if (form.email.trim() && !add.isPending) add.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <Field id="member-email" describedBy={false}>
                <FieldLabel>Email</FieldLabel>
                <FieldControl>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </FieldControl>
              </Field>
              <Field id="member-role" describedBy={false}>
                <FieldLabel>Role</FieldLabel>
                <FieldControl>
                  <NativeSelect
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </NativeSelect>
                </FieldControl>
              </Field>
              <ErrorNote error={add.error} />
              <DialogActions
                submitLabel="Add"
                pendingLabel="Adding…"
                disabled={!form.email.trim()}
                pending={add.isPending}
                onClose={() => setAdding(false)}
              />
            </DialogForm>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
