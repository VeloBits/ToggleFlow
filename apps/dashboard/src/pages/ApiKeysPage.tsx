import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type ApiKey } from '../api/client';
import { ConfirmButton, ErrorNote, Modal } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';

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

  if (!isAdmin) {
    return <p className="muted">API keys are managed by org admins.</p>;
  }

  return (
    <>
      <div className="page-head">
        <h2>API keys</h2>
        <span className="muted">scoped to {ws.environment?.name ?? '…'}</span>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          ＋ Create key
        </button>
      </div>
      <ErrorNote error={keysQuery.error ?? revoke.error} />
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Prefix</th>
            <th>Created</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(keysQuery.data ?? []).map((key) => (
            <tr key={key.id}>
              <td>{key.name}</td>
              <td>
                <span className="chip chip-role">{key.kind}</span>
              </td>
              <td className="mono">{key.prefix}…</td>
              <td className="muted">{new Date(key.createdAt).toLocaleString()}</td>
              <td>
                {key.revokedAt ? (
                  <span className="chip chip-off">revoked</span>
                ) : (
                  <span className="chip chip-on">active</span>
                )}
              </td>
              <td>
                {!key.revokedAt && (
                  <ConfirmButton
                    className="danger"
                    label="Revoke"
                    confirmLabel="Revoke permanently?"
                    onConfirm={() => revoke.mutate(key.id)}
                  />
                )}
              </td>
            </tr>
          ))}
          {(keysQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No keys for this environment yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {creating && (
        <Modal title="Create API key" onClose={() => setCreating(false)}>
          <div className="field">
            <label htmlFor="key-name">Name</label>
            <input
              id="key-name"
              placeholder="production backend"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="key-kind">Kind</label>
            <select
              id="key-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as 'server' | 'client' })}
            >
              <option value="server">server - secret, backend only</option>
              <option value="client">client - safe to expose in browsers</option>
            </select>
          </div>
          <ErrorNote error={create.error} />
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={!form.name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {revealed && (
        <Modal title="Copy your key now" onClose={() => setRevealed(null)}>
          <p>
            This is the only time the full key is shown. Store it somewhere safe - only a hash is
            kept.
          </p>
          <p className="reveal-token mono">{revealed.token}</p>
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => void navigator.clipboard.writeText(revealed.token ?? '')}
            >
              Copy
            </button>
            <button type="button" onClick={() => setRevealed(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
