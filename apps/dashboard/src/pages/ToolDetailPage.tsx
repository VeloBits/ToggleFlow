import { jsonObjectSchema, targetingRuleSchema } from '@toggleflow/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';

import { api, type ConfigVersion, type FlagRow, type Tool, type ToolConfig } from '../api/client';
import { diffLines, prettyJson } from '../components/diff';
import { ConfirmButton, ErrorNote, StatusChip } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';

const targetingRulesSchema = z.array(targetingRuleSchema);

interface ToolWithStates extends Tool {
  flagStates: {
    environmentId: string;
    environmentKey: string;
    enabled: boolean;
    rolloutPercent: number | null;
    targetingRules: unknown[];
  }[];
}

/** JSON textarea with schema validation on save. */
function JsonField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  error: string | null;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="code"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {error && <p className="error-note">{error}</p>}
    </div>
  );
}

function FlagPanel({ toolId, canEdit }: { toolId: string; canEdit: boolean }) {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const isProd = ws.environment?.key === 'prod';

  const flagsQuery = useQuery({
    queryKey: ['flags', ws.environmentId],
    queryFn: () => api.get<FlagRow[]>(`/v1/environments/${ws.environmentId}/flags`),
    enabled: ws.environmentId !== null,
  });
  const state = flagsQuery.data?.find((row) => row.toolId === toolId);

  const [rollout, setRollout] = useState('');
  const [rules, setRules] = useState('[]');
  const [rulesError, setRulesError] = useState<string | null>(null);
  useEffect(() => {
    if (!state) return;
    setRollout(state.rolloutPercent === null ? '' : String(state.rolloutPercent));
    setRules(prettyJson(state.targetingRules));
  }, [state]);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/v1/environments/${ws.environmentId}/tools/${toolId}/flag`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flags', ws.environmentId] }),
  });

  if (!state) return <div className="panel">Loading flag state…</div>;

  const saveTargeting = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rules);
    } catch {
      setRulesError('Not valid JSON.');
      return;
    }
    const checked = targetingRulesSchema.safeParse(parsed);
    if (!checked.success) {
      setRulesError(
        checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
      return;
    }
    setRulesError(null);
    patch.mutate({
      targetingRules: checked.data,
      rolloutPercent: rollout === '' ? null : Number(rollout),
    });
  };

  return (
    <div className="panel">
      <h3>
        Flag state in {ws.environment?.name}{' '}
        <StatusChip enabled={state.enabled} rolloutPercent={state.rolloutPercent} />
      </h3>
      {canEdit && (
        <div className="row" style={{ marginBottom: 12 }}>
          <ConfirmButton
            className={state.enabled ? 'danger' : 'primary'}
            label={state.enabled ? 'Turn OFF (kill switch)' : 'Turn ON'}
            confirmLabel={`Confirm ${state.enabled ? 'OFF' : 'ON'} in ${ws.environment?.key}?`}
            requireConfirm={isProd}
            onConfirm={() => patch.mutate({ enabled: !state.enabled })}
          />
          {isProd && <span className="muted">production changes ask for confirmation</span>}
        </div>
      )}
      <div className="field" style={{ maxWidth: 240 }}>
        <label htmlFor="rollout">Rollout % (empty = everyone when on)</label>
        <div className="row">
          <input
            id="rollout"
            type="number"
            min={0}
            max={100}
            value={rollout}
            disabled={!canEdit}
            onChange={(e) => setRollout(e.target.value)}
          />
          {canEdit && (
            <button
              type="button"
              onClick={() =>
                patch.mutate({ rolloutPercent: rollout === '' ? null : Number(rollout) })
              }
            >
              Save
            </button>
          )}
        </div>
      </div>
      <JsonField
        id="targeting"
        label="Targeting rules (first match wins; segments by key)"
        value={rules}
        onChange={setRules}
        error={rulesError}
      />
      {canEdit && (
        <button type="button" onClick={saveTargeting} disabled={patch.isPending}>
          Save targeting + rollout
        </button>
      )}
      <ErrorNote error={patch.error} />
    </div>
  );
}

function ConfigPanel({ toolId, canEdit }: { toolId: string; canEdit: boolean }) {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const base = `/v1/environments/${ws.environmentId}/tools/${toolId}/config`;

  const configQuery = useQuery({
    queryKey: ['config', ws.environmentId, toolId],
    queryFn: () => api.get<ToolConfig>(base),
    enabled: ws.environmentId !== null,
  });
  const versionsQuery = useQuery({
    queryKey: ['config-versions', ws.environmentId, toolId],
    queryFn: () => api.get<ConfigVersion[]>(`${base}/versions`),
    enabled: ws.environmentId !== null,
  });

  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  useEffect(() => {
    if (configQuery.data) {
      setDraft(
        prettyJson(configQuery.data.value ?? { fallback: { mode: 'message', message: '' } }),
      );
    }
  }, [configQuery.data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['config', ws.environmentId, toolId] });
    await queryClient.invalidateQueries({
      queryKey: ['config-versions', ws.environmentId, toolId],
    });
  };
  const save = useMutation({
    mutationFn: (value: Record<string, unknown>) => api.put(base, { value }),
    onSuccess: invalidate,
  });
  const rollback = useMutation({
    mutationFn: (toVersion: number) => api.post(`${base}/rollback`, { toVersion }),
    onSuccess: invalidate,
  });

  const saveDraft = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setDraftError('Not valid JSON.');
      return;
    }
    const checked = jsonObjectSchema.safeParse(parsed);
    if (!checked.success) {
      setDraftError('Config must be a JSON object.');
      return;
    }
    setDraftError(null);
    save.mutate(checked.data);
  };

  const current = configQuery.data;
  const versions = versionsQuery.data ?? [];
  const compared = versions.find((v) => v.version === compareVersion);

  return (
    <div className="panel">
      <h3>
        Config <span className="muted">(version {current?.version ?? 0})</span>
      </h3>
      <p className="muted">
        The <code>fallback</code> field is what users see while this tool is off.
      </p>
      <JsonField
        id="config"
        label="Config value"
        value={draft}
        onChange={setDraft}
        error={draftError}
      />
      {canEdit && (
        <button type="button" className="primary" onClick={saveDraft} disabled={save.isPending}>
          Save as version {(current?.version ?? 0) + 1}
        </button>
      )}
      <ErrorNote error={save.error ?? rollback.error} />

      {versions.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>History</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>v{version.version}</td>
                  <td className="muted">{new Date(version.createdAt).toLocaleString()}</td>
                  <td className="muted">
                    {version.restoredFromVersion
                      ? `restored from v${version.restoredFromVersion}`
                      : ''}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setCompareVersion(
                          compareVersion === version.version ? null : version.version,
                        )
                      }
                    >
                      {compareVersion === version.version ? 'hide diff' : 'diff'}
                    </button>
                    {canEdit && version.version !== current?.version && (
                      <ConfirmButton
                        className="ghost"
                        label="restore"
                        confirmLabel="Restore this version?"
                        onConfirm={() => rollback.mutate(version.version)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {compared && (
            <div style={{ marginTop: 12 }}>
              <p className="muted">
                v{compared.version} → current (v{current?.version}); removed lines are v
                {compared.version}, added lines are current
              </p>
              <div className="diff">
                {diffLines(prettyJson(compared.value), prettyJson(current?.value ?? {})).map(
                  (line, i) => (
                    <span key={i} className={line.kind}>
                      {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
                      {line.text}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ToolDetailPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const canEdit = ws.role === 'admin' || ws.role === 'developer';

  const toolQuery = useQuery({
    queryKey: ['tool', toolId],
    queryFn: () => api.get<ToolWithStates>(`/v1/tools/${toolId}`),
    enabled: Boolean(toolId),
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.patch(`/v1/tools/${toolId}`, { archived }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tool', toolId] });
      await queryClient.invalidateQueries({ queryKey: ['flags'] });
      await queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });

  const tool = toolQuery.data;
  if (!toolId) return null;
  if (toolQuery.error) return <ErrorNote error={toolQuery.error} />;
  if (!tool) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h2>
          <Link to="/">Tools</Link> / <span className="mono">{tool.key}</span>
        </h2>
        {tool.archived && <span className="tag">archived</span>}
        {canEdit && (
          <ConfirmButton
            className={tool.archived ? '' : 'danger'}
            label={tool.archived ? 'Unarchive' : 'Archive'}
            confirmLabel={tool.archived ? 'Unarchive?' : 'Archive (drops from snapshots)?'}
            onConfirm={() => archive.mutate(!tool.archived)}
          />
        )}
      </div>
      <p className="muted">
        {tool.name}
        {tool.description ? ` - ${tool.description}` : ''}{' '}
        {tool.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </p>
      <FlagPanel toolId={toolId} canEdit={canEdit && !tool.archived} />
      <ConfigPanel toolId={toolId} canEdit={canEdit} />
    </>
  );
}
