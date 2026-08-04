/**
 * The Config tab: the flag's per-environment JSON blob, versioned server-side,
 * with history, a diff against the current value, and rollback.
 *
 * ## Why `config.fallback` gets its own paragraph
 *
 * By convention since wire-format v1 (`snapshotToolSchema`'s docblock), a flag's
 * `config.fallback` is what an *off* flag serves. That used to be advice about a
 * payload; with typed flags it is load-bearing arithmetic: for a `string` or
 * `string_enum` flag, `resolveValue` returns `fallback` verbatim the moment the
 * kill switch goes off, so this field is literally the off-state value your users
 * receive. Someone editing this JSON is editing what a switched-off flag says,
 * and the copy has to make that impossible to miss.
 *
 * ## Why the config stays editable on an archived flag
 *
 * Archiving drops the flag from published snapshots, so nothing here is being
 * served; the state controls are locked because flipping a switch nobody reads is
 * meaningless, but preparing the payload for a flag you intend to restore is not.
 * That asymmetry predates this redesign and is preserved deliberately.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { jsonObjectSchema } from '@toggleflow/engine';

import { api } from '@/api/client';
import {
  flagConfigPath,
  flagConfigQueryOptions,
  flagConfigVersionsQueryOptions,
  flagKeys,
} from '@/api/flags';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { diffLines, prettyJson } from '@/components/diff';
import { JsonField } from '@/components/JsonField';
import { Panel } from '@/components/page';
import { ConfirmButton, ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';

/** The skeleton offered when an environment has no config yet. */
const EMPTY_CONFIG = { fallback: { mode: 'message', message: '' } };

export function FlagConfigPanel({ flagId, canEdit }: { flagId: string; canEdit: boolean }) {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const base = flagConfigPath(ws.environmentId, flagId);

  const configQuery = useQuery(flagConfigQueryOptions(ws.environmentId, flagId));
  const versionsQuery = useQuery(flagConfigVersionsQueryOptions(ws.environmentId, flagId));

  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  useEffect(() => {
    if (configQuery.data) {
      setDraft(prettyJson(configQuery.data.value ?? EMPTY_CONFIG));
    }
  }, [configQuery.data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: flagKeys.config(ws.environmentId, flagId) });
    await queryClient.invalidateQueries({
      queryKey: flagKeys.configVersions(ws.environmentId, flagId),
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
  const compared = versions.find((version) => version.version === compareVersion);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Config"
        actions={
          <Badge variant="outline" className="text-muted-foreground font-normal tabular-nums">
            (version {current?.version ?? 0})
          </Badge>
        }
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-muted-foreground m-0 text-[13px]">
            A JSON payload this flag carries in this environment. By convention its{' '}
            <code className="font-mono">fallback</code> field is what users get while the flag is
            OFF - for a string or choice flag that is not a decoration, it is the value the SDK
            returns the moment the kill switch is pulled.
          </p>
          <JsonField
            id="config"
            label="Config value"
            value={draft}
            onChange={setDraft}
            error={draftError}
            hint="Any JSON object. Saving writes a new version; nothing is overwritten."
          />
          {canEdit && (
            <Button className="self-start" onClick={saveDraft} disabled={save.isPending}>
              Save as version {(current?.version ?? 0) + 1}
            </Button>
          )}
          <ErrorNote error={save.error ?? rollback.error} />
        </div>
      </Panel>

      {versions.length > 0 && (
        <Panel title="History">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Version</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell className="font-mono text-[12.5px]">v{version.version}</TableCell>
                  <TableCell className="text-muted-foreground text-[12.5px]">
                    {new Date(version.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[12.5px]">
                    {version.restoredFromVersion
                      ? `restored from v${version.restoredFromVersion}`
                      : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setCompareVersion(
                          compareVersion === version.version ? null : version.version,
                        )
                      }
                    >
                      {compareVersion === version.version ? 'hide diff' : 'diff'}
                    </Button>
                    {canEdit && version.version !== current?.version && (
                      <ConfirmButton
                        className={buttonVariants({ variant: 'ghost', size: 'xs' })}
                        label="restore"
                        confirmLabel="Restore this version?"
                        onConfirm={() => rollback.mutate(version.version)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {compared && (
            <div className="border-border border-t p-4">
              <p className="text-muted-foreground m-0 mb-2 text-[12.5px]">
                v{compared.version} → current (v{current?.version}); removed lines are v
                {compared.version}, added lines are current
              </p>
              {/* `.diff` and its `.added` / `.removed` / `.same` children are the
                  legacy stylesheet's rules, kept: they already encode the one
                  thing this view needs (line-through on removals) and reproducing
                  them in utilities would be a rename, not an improvement. */}
              <div className="diff">
                {diffLines(prettyJson(compared.value), prettyJson(current?.value ?? {})).map(
                  (line, index) => (
                    <span key={index} className={line.kind}>
                      {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
                      {line.text}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
