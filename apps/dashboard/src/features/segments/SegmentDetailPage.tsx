/**
 * One segment: its identity, its rules, what uses it, and what happened to it.
 *
 * ## Why this is a route rather than a panel under the list
 *
 * The reference design stacked the table and a tabbed editor on one screen. Two
 * things made that worse than it looks: no row reads as "the one being edited", so
 * the editor below is ambiguous the moment there is more than one segment; and the
 * editor sits under a table that grows, so the thing you came to change moves
 * further off-screen the more segments you have. A route fixes both, makes the
 * editor's URL shareable, and matches `FlagsPage`/`FlagDetailPage` - which is the
 * pattern anyone using this product has already learned.
 *
 * ## One save, not per-field
 *
 * Name, description, rules and match all commit together on Save. A rule tree is
 * edited in several gestures that are only meaningful once finished - adding a
 * group leaves it empty, and autosaving that would publish a segment matching
 * everyone to every environment mid-edit, because every segment write republishes
 * the whole project (`publishProjectEnvironments`). So the page holds a draft and
 * the button says when it differs from the server.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { Segment } from '@/api/client';
import { segmentUsageQueryOptions, segmentsQueryOptions } from '@/api/segments';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Panel } from '@/components/page';
import { ConfirmButton, ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cn } from '@/ui/cn';
import { CopyIcon } from '@/ui/icons';
import { relativeTime } from '@/ui/relative-time';
import { useToast } from '@/ui/toast';
import { RuleBuilder } from '@/features/targeting/RuleBuilder';
import {
  convertRuleSets,
  toRuleSetDrafts,
  type RuleSetDraft,
} from '@/features/targeting/condition-draft';
import { projectAttributesQueryOptions } from '@/api/segments';

import { SegmentActivityPanel } from './SegmentActivityPanel';
import { SegmentPreview } from './SegmentPreview';
import { SegmentUsagePanel } from './SegmentUsagePanel';
import { conditionCount, structureLabel } from './segment-summary';
import { useDeleteSegment, useUpdateSegment } from './use-segment-mutations';

export function SegmentDetailPage() {
  const { segmentId } = useParams<{ segmentId: string }>();
  const ws = useWorkspace();

  /*
   * Read from the project's segment list rather than a per-segment GET, because
   * there is no `GET /v1/segments/:id` route and the list is already cached by the
   * page you arrived from. One consequence worth knowing: arriving by deep link
   * fetches the list first, which is why `isPending` below is a real state.
   */
  const segmentsQuery = useQuery(segmentsQueryOptions(ws.projectId));
  const segment = segmentsQuery.data?.find((row) => row.id === segmentId);

  if (segmentsQuery.isPending) {
    return <p className="text-muted-foreground m-0 p-4 text-[13px]">Loading segment…</p>;
  }
  if (!segment) {
    return (
      <Card className="p-6">
        <p className="text-text m-0 text-[14px] font-semibold">Segment not found</p>
        <p className="text-muted-foreground m-0 mt-1 text-[13px]">
          It may have been deleted, or it belongs to another project.
        </p>
        <Link
          to="/segments"
          className="text-primary mt-3 inline-block text-[13px] underline-offset-2 hover:underline"
        >
          Back to segments
        </Link>
      </Card>
    );
  }

  /*
   * Keyed on the segment id so switching segments remounts the editor. Without
   * the key, the draft state below would carry one segment's unsaved rules onto
   * another - which on this screen means saving them to the wrong one.
   */
  return <SegmentEditor key={segment.id} segment={segment} />;
}

const TABS = ['targeting', 'usage', 'history', 'settings'] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab);

function SegmentEditor({ segment }: { segment: Segment }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'targeting';

  const canEdit = ws.role === 'admin' || ws.role === 'developer';
  const canDelete = ws.role === 'admin';

  const [name, setName] = useState(segment.name);
  const [description, setDescription] = useState(segment.description ?? '');
  const [match, setMatch] = useState(segment.match);
  const [sets, setSets] = useState<RuleSetDraft[]>(() => toRuleSetDrafts(segment.rules));

  const attributesQuery = useQuery(projectAttributesQueryOptions(ws.projectId));
  const usageQuery = useQuery(segmentUsageQueryOptions(ws.projectId));
  const usage = usageQuery.data?.[segment.key];

  const update = useUpdateSegment(segment.id);
  const remove = useDeleteSegment();

  /* Converted on every render so the preview and the save button read the same
     rules the builder is showing, without a second source of truth. */
  const { rules, errors } = useMemo(() => convertRuleSets(sets), [sets]);

  /*
   * The server's rules put through the SAME conversion the draft goes through, so
   * the comparison below is canonical-form to canonical-form.
   *
   * Comparing against `segment.rules` directly does not work: it is a jsonb column,
   * and Postgres does not preserve object key order - it hands back
   * `{values, operator, attribute}` where `convertCondition` builds
   * `{attribute, operator, values}`. `JSON.stringify` is order-sensitive, so every
   * freshly-loaded segment reported itself as edited, the Save button was live
   * before anyone touched anything, and "Unsaved changes" meant nothing. Round-
   * tripping normalises key order and empty groups in one step.
   */
  const savedRules = useMemo(
    () => convertRuleSets(toRuleSetDrafts(segment.rules)).rules,
    [segment.rules],
  );

  const trimmedName = name.trim();
  const nextDescription = description.trim() || null;
  const dirty =
    trimmedName !== segment.name ||
    nextDescription !== segment.description ||
    match !== segment.match ||
    JSON.stringify(rules) !== JSON.stringify(savedRules);

  const hasErrors = Object.keys(errors).length > 0;

  const save = () => {
    if (!trimmedName) {
      toast('A segment needs a name.', { variant: 'error' });
      return;
    }
    if (hasErrors) {
      toast('Some conditions need attention.', { variant: 'error' });
      return;
    }
    update.mutate({
      name: trimmedName,
      description: nextDescription,
      match,
      /*
       * The API requires at least one group, and `convertRuleSets` drops empty
       * ones - so a segment cleared to nothing sends one empty group, which is
       * the stored form of "matches everyone". The builder warns before this
       * point; it is not blocked, because "everyone" is occasionally the point.
       */
      rules: rules.length > 0 ? rules : [[]],
    });
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <Link to="/segments" className="hover:text-text underline-offset-2 hover:underline">
              Segments
            </Link>
            <span aria-hidden>/</span>
            {/* The key is the breadcrumb leaf and is copyable, because it is the
                string that goes into a flag's targeting rule. */}
            <button
              type="button"
              aria-label={`Copy key ${segment.key}`}
              className="text-muted-foreground hover:text-text flex items-center gap-1 border-0 bg-transparent p-0 font-mono text-[12px]"
              onClick={() => {
                void navigator.clipboard?.writeText(segment.key);
                toast(`Copied ${segment.key}`);
              }}
            >
              {segment.key}
              <CopyIcon size={11} />
            </button>
          </div>
          <h1 className="text-text m-0 mt-1 text-[20px] leading-tight font-bold">{segment.name}</h1>
        </div>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            {dirty && <span className="text-muted-foreground text-[12px]">Unsaved changes</span>}
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}
      </div>

      <ErrorNote error={update.error ?? remove.error} />

      {/*
        The tab lives in the URL, as it does on the flag detail page: "look at the
        Usage tab" is then a link someone can send, and a refresh does not throw
        you back to Targeting. `replace` so tabbing around does not fill the back
        button with steps nobody wants to retrace.
      */}
      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next }, { replace: true })}>
        <TabsList variant="line" className="mb-1">
          <TabsTrigger value="targeting">Targeting</TabsTrigger>
          <TabsTrigger value="usage">
            Usage
            {usage && usage.flagCount > 0 && (
              <span className="text-muted-foreground ml-1 tabular-nums">{usage.flagCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="targeting">
          {/*
            Three columns at xl, stacking to one below it. The rule builder gets
            the middle and the most room because it is what the page is for; the
            identity fields and the read-only panels are reference material.
          */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,17rem)]">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="segment-name">Name</Label>
                <Input
                  id="segment-name"
                  value={name}
                  disabled={!canEdit}
                  onChange={(event) => setName(event.target.value)}
                />
                <p className="text-muted-foreground m-0 font-mono text-[11.5px]">
                  Key: {segment.key}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="segment-description">Description</Label>
                <Textarea
                  id="segment-description"
                  rows={4}
                  value={description}
                  disabled={!canEdit}
                  placeholder="Who is in this group, and why."
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>

            <RuleBuilder
              sets={sets}
              match={match}
              attributes={attributesQuery.data ?? []}
              errors={errors}
              disabled={!canEdit}
              onSetsChange={setSets}
              onMatchChange={setMatch}
            />

            <div className="flex flex-col gap-3">
              <Panel title="Segment overview">
                <dl className="m-0 grid grid-cols-2 gap-2 p-3 text-[12px]">
                  <Stat label="Structure" value={structureLabel(rules, match)} />
                  <Stat label="Conditions" value={String(conditionCount(rules))} />
                  <Stat
                    label="Used by"
                    value={
                      usageQuery.isPending
                        ? '…'
                        : usage
                          ? `${usage.flagCount} ${usage.flagCount === 1 ? 'flag' : 'flags'}`
                          : 'Nothing'
                    }
                  />
                  <Stat label="Created" value={relativeTime(segment.createdAt)} />
                </dl>
              </Panel>

              {/* Evaluates the DRAFT, so the question is "will this rule work"
                  rather than "did the last one". */}
              <SegmentPreview rules={rules} match={match} />

              <SegmentActivityPanel segmentId={segment.id} limit={4} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <Card className="overflow-hidden p-0">
            <SegmentUsagePanel usage={usage} loading={usageQuery.isPending} />
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <div className="max-w-2xl">
            <SegmentActivityPanel segmentId={segment.id} limit={50} />
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="max-w-2xl p-4">
            <h2 className="text-text m-0 text-[13px] font-semibold">Delete this segment</h2>
            {/*
              The delete guard. A segment still referenced by a targeting rule
              cannot be deleted quietly: the engine treats an unknown segment key
              as never matching, so removing this one silently narrows every rule
              that names it - a flag that was reaching users stops, with nothing on
              screen to explain why.
            */}
            {usage && usage.flagCount > 0 ? (
              <p className="text-muted-foreground m-0 mt-1 text-[12.5px]">
                {usage.flagCount} targeting {usage.flagCount === 1 ? 'rule' : 'rules'} still
                reference <span className="font-mono">{segment.key}</span>. Deleting it makes those
                rules match nobody. Review them on the Usage tab first.
              </p>
            ) : (
              <p className="text-muted-foreground m-0 mt-1 text-[12.5px]">
                Nothing references this segment, so deleting it changes no flag’s behaviour.
              </p>
            )}
            <div className="mt-3">
              {canDelete ? (
                <ConfirmButton
                  className="destructive"
                  label="Delete segment"
                  confirmLabel={
                    usage && usage.flagCount > 0
                      ? `Delete anyway — ${usage.flagCount} references`
                      : 'Confirm delete'
                  }
                  onConfirm={() =>
                    remove.mutate(segment, { onSuccess: () => navigate('/segments') })
                  }
                />
              ) : (
                <p className="text-muted-foreground m-0 text-[12.5px]">
                  Only an admin can delete a segment.
                </p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className={cn('text-text m-0 truncate text-[12.5px] font-medium')}>{value}</dd>
    </div>
  );
}
