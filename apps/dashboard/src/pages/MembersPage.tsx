import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type Member, type Role } from '../api/client';
import { ConfirmButton, ErrorNote, Modal } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';

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

  return (
    <>
      <div className="page-head">
        <h2>Members</h2>
        <span className="muted">
          admin manages everything · developer flips flags · viewer reads
        </span>
        {isAdmin && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            ＋ Add member
          </button>
        )}
      </div>
      <ErrorNote error={membersQuery.error ?? changeRole.error ?? remove.error} />
      <table className="data">
        <thead>
          <tr>
            <th>Member</th>
            <th>Email</th>
            <th>Role</th>
            <th>Since</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(membersQuery.data ?? []).map((member) => (
            <tr key={member.userId}>
              <td>{member.displayName ?? '—'}</td>
              <td>{member.email}</td>
              <td>
                {isAdmin ? (
                  <select
                    aria-label={`Role for ${member.email}`}
                    value={member.role}
                    onChange={(e) =>
                      changeRole.mutate({ userId: member.userId, role: e.target.value as Role })
                    }
                  >
                    <option value="admin">admin</option>
                    <option value="developer">developer</option>
                    <option value="viewer">viewer</option>
                  </select>
                ) : (
                  <span className="chip chip-role">{member.role}</span>
                )}
              </td>
              <td className="muted">{new Date(member.createdAt).toLocaleDateString()}</td>
              <td>
                {isAdmin && (
                  <ConfirmButton
                    className="danger"
                    label="Remove"
                    confirmLabel="Remove from org?"
                    onConfirm={() => remove.mutate(member.userId)}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding && (
        <Modal title="Add member" onClose={() => setAdding(false)}>
          <p className="muted">
            They need a ToggleFlow account already (one sign-in is enough) — invitations come later.
          </p>
          <div className="field">
            <label htmlFor="member-email">Email</label>
            <input
              id="member-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="member-role">Role</label>
            <select
              id="member-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              <option value="admin">admin</option>
              <option value="developer">developer</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <ErrorNote error={add.error} />
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={!form.email.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
