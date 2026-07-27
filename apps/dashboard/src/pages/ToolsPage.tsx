import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, type FlagRow, type Tool } from '../api/client';
import { ErrorNote, Modal, StatusChip } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { EMPTY_FILTER, filterRows, type ToolFilter } from './tools-filter';

function NewToolModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ key: '', name: '', description: '', tags: '' });
  const create = useMutation({
    mutationFn: () =>
      api.post<Tool>(`/v1/projects/${projectId}/tools`, {
        key: form.key.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['flags'] });
      await queryClient.invalidateQueries({ queryKey: ['tools'] });
      onClose();
    },
  });

  return (
    <Modal title="Register a tool" onClose={onClose}>
      <div className="field">
        <label htmlFor="tool-key">Key (lowercase, dots/dashes)</label>
        <input
          id="tool-key"
          placeholder="tool.summarize"
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="tool-name">Name</label>
        <input
          id="tool-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="tool-desc">Description</label>
        <input
          id="tool-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="tool-tags">Tags (comma-separated)</label>
        <input
          id="tool-tags"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
        />
      </div>
      <ErrorNote error={create.error} />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!form.key.trim() || !form.name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Register
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function ToolsPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ToolFilter>(EMPTY_FILTER);
  const [creating, setCreating] = useState(false);

  const flagsQuery = useQuery({
    queryKey: ['flags', ws.environmentId],
    queryFn: () => api.get<FlagRow[]>(`/v1/environments/${ws.environmentId}/flags`),
    enabled: ws.environmentId !== null,
    refetchInterval: 15_000,
  });
  const toolsQuery = useQuery({
    queryKey: ['tools', ws.projectId],
    queryFn: () => api.get<Tool[]>(`/v1/projects/${ws.projectId}/tools?includeArchived=true`),
    enabled: ws.projectId !== null,
  });

  const rows = useMemo(() => {
    const tagsByTool = new Map((toolsQuery.data ?? []).map((t) => [t.id, t.tags]));
    return (flagsQuery.data ?? []).map((row) => ({
      ...row,
      tags: tagsByTool.get(row.toolId) ?? [],
    }));
  }, [flagsQuery.data, toolsQuery.data]);
  const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const allTags = useMemo(
    () => [...new Set((toolsQuery.data ?? []).flatMap((t) => t.tags))].sort(),
    [toolsQuery.data],
  );
  const canEdit = ws.role === 'admin' || ws.role === 'developer';

  return (
    <>
      <div className="page-head">
        <h2>Tools</h2>
        <span className="muted">
          {visible.length} of {rows.length} in {ws.environment?.name ?? '…'}
        </span>
        {canEdit && (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            ＋ Register tool
          </button>
        )}
      </div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search key or name…"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <select
          aria-label="Tag filter"
          value={filter.tag}
          onChange={(e) => setFilter({ ...filter, tag: e.target.value })}
        >
          <option value="">All tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select
          aria-label="Status filter"
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value as ToolFilter['status'] })}
        >
          <option value="all">All statuses</option>
          <option value="on">On</option>
          <option value="off">Off</option>
          <option value="rollout">% rollout</option>
        </select>
        <label className="row">
          <input
            type="checkbox"
            checked={filter.includeArchived}
            onChange={(e) => setFilter({ ...filter, includeArchived: e.target.checked })}
          />
          show archived
        </label>
      </div>
      <ErrorNote error={flagsQuery.error} />
      <table className="data">
        <thead>
          <tr>
            <th>Status</th>
            <th>Key</th>
            <th>Name</th>
            <th>Tags</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={row.toolId}
              className="clickable"
              onClick={() => navigate(`/tools/${row.toolId}`)}
            >
              <td>
                <StatusChip enabled={row.enabled} rolloutPercent={row.rolloutPercent} />
                {row.archived && <span className="tag">archived</span>}
              </td>
              <td className="mono">{row.toolKey}</td>
              <td>{row.toolName}</td>
              <td>
                {row.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </td>
              <td className="muted">{new Date(row.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                {rows.length === 0 ? 'No tools registered yet.' : 'Nothing matches the filters.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {creating && ws.projectId && (
        <NewToolModal projectId={ws.projectId} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
