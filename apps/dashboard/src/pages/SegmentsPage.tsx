import { conditionSchema } from '@toggleflow/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { api, type Segment } from '../api/client';
import { prettyJson } from '../components/diff';
import { ConfirmButton, ErrorNote, Modal } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';

const conditionsSchema = z.array(conditionSchema);

function SegmentModal({
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

  return (
    <Modal title={segment ? `Edit ${segment.key}` : 'New segment'} onClose={onClose}>
      {!segment && (
        <div className="field">
          <label htmlFor="segment-key">Key</label>
          <input
            id="segment-key"
            placeholder="beta-users"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="segment-name">Name</label>
        <input
          id="segment-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="segment-desc">Description</label>
        <input
          id="segment-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="segment-rules">Conditions (ALL must match)</label>
        <textarea
          id="segment-rules"
          className="code"
          value={form.rules}
          onChange={(e) => setForm({ ...form, rules: e.target.value })}
          spellCheck={false}
        />
        {rulesError && <p className="error-note">{rulesError}</p>}
      </div>
      <ErrorNote error={save.error} />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={save.isPending || !form.name.trim() || (!segment && !form.key.trim())}
          onClick={submit}
        >
          Save
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
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

  return (
    <>
      <div className="page-head">
        <h2>Segments</h2>
        <span className="muted">reusable targeting groups for this project</span>
        {canEdit && (
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            ＋ New segment
          </button>
        )}
      </div>
      <ErrorNote error={segmentsQuery.error ?? remove.error} />
      <table className="data">
        <thead>
          <tr>
            <th>Key</th>
            <th>Name</th>
            <th>Conditions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(segmentsQuery.data ?? []).map((segment) => (
            <tr key={segment.id}>
              <td className="mono">{segment.key}</td>
              <td>
                {segment.name}
                {segment.description && <span className="muted"> — {segment.description}</span>}
              </td>
              <td className="mono">{JSON.stringify(segment.rules)}</td>
              <td>
                {canEdit && (
                  <>
                    <button type="button" className="ghost" onClick={() => setEditing(segment)}>
                      edit
                    </button>
                    <ConfirmButton
                      className="ghost"
                      label="delete"
                      confirmLabel="Delete segment?"
                      onConfirm={() => remove.mutate(segment.id)}
                    />
                  </>
                )}
              </td>
            </tr>
          ))}
          {(segmentsQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No segments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editing !== null && ws.projectId && (
        <SegmentModal
          projectId={ws.projectId}
          segment={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
