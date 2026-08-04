/**
 * The query layer for flags: one place that knows which URL answers a question,
 * what its cache key is, and that the answer arrives in the server's vocabulary
 * (see the boundary rule in api/client.ts).
 *
 * Pages call these factories instead of writing `queryKey` and `queryFn` inline,
 * because four screens read the same flag list and a key that drifts on one of
 * them is a stale row nobody notices - the page still renders, just with data
 * from before the mutation.
 */
import { queryOptions } from '@tanstack/react-query';

import {
  api,
  fetchFlags,
  type ConfigVersion,
  type FlagConfig,
  type FlagDefinition,
  type FlagDefinitionDetail,
} from './client';

/**
 * Cache keys, as one table.
 *
 * `list` MUST stay exactly `['flags', environmentId]`. Two things depend on the
 * literal shape rather than on this function:
 *
 *   - `state/WorkspaceContext.tsx` invalidates the `['flags']` *prefix* after
 *     creating an inherited environment, which arrives with flag state already
 *     copied into it. A key that stopped starting with `'flags'` would leave
 *     every open flag list showing the pre-inheritance snapshot.
 *   - the Flags page, the flag detail page, Home and Search all read this same
 *     entry, which is why a flag flipped on the detail page updates the list
 *     behind it without a refetch.
 *
 * `environmentId` is nullable because the workspace has no environment selected
 * until `/v1/me` and the project list have both answered; the matching
 * `enabled` below keeps the query from firing until then, so `['flags', null]`
 * is never populated - it just has to be a legal key in the meantime.
 *
 * `definitions` and `detail` were `['tools', …]` and `['tool', …]` before the
 * rename. Nothing outside this file reads them, so the change is invisible.
 */
export const flagKeys = {
  /**
   * Every environment's list at once, for a mutation that can have changed any
   * of them (registering a flag, archiving one, inheriting an environment).
   * This is the prefix WorkspaceContext relies on.
   */
  listPrefix: ['flags'] as const,
  list: (environmentId: string | null) => ['flags', environmentId] as const,
  definitionsPrefix: ['flag-definitions'] as const,
  definitions: (projectId: string | null) => ['flag-definitions', projectId] as const,
  detail: (flagId: string | undefined) => ['flag', flagId] as const,
  config: (environmentId: string | null, flagId: string) =>
    ['config', environmentId, flagId] as const,
  configVersions: (environmentId: string | null, flagId: string) =>
    ['config-versions', environmentId, flagId] as const,
};

/** Every flag's state in one environment - the list every flag screen starts from. */
export const flagsQueryOptions = (environmentId: string | null) =>
  queryOptions({
    queryKey: flagKeys.list(environmentId),
    queryFn: () => fetchFlags(environmentId!),
    enabled: environmentId !== null,
  });

/**
 * The project's flag definitions, archived ones included: the list page joins
 * their tags onto the rows, and hiding archived rows is a client-side filter, so
 * fetching only the live ones would make "show archived" fetch again.
 */
export const flagDefinitionsQueryOptions = (projectId: string | null) =>
  queryOptions({
    queryKey: flagKeys.definitions(projectId),
    queryFn: () =>
      api.get<FlagDefinition[]>(`/v1/projects/${projectId}/tools?includeArchived=true`),
    enabled: projectId !== null,
  });

/** One flag definition plus its state in every environment of the project. */
export const flagDetailQueryOptions = (flagId: string | undefined) =>
  queryOptions({
    queryKey: flagKeys.detail(flagId),
    queryFn: () => api.get<FlagDefinitionDetail>(`/v1/tools/${flagId}`),
    enabled: Boolean(flagId),
  });

/** The server path for a flag's config in one environment - GET, PUT and rollback all hang off it. */
export const flagConfigPath = (environmentId: string | null, flagId: string) =>
  `/v1/environments/${environmentId}/tools/${flagId}/config`;

export const flagConfigQueryOptions = (environmentId: string | null, flagId: string) =>
  queryOptions({
    queryKey: flagKeys.config(environmentId, flagId),
    queryFn: () => api.get<FlagConfig>(flagConfigPath(environmentId, flagId)),
    enabled: environmentId !== null,
  });

export const flagConfigVersionsQueryOptions = (environmentId: string | null, flagId: string) =>
  queryOptions({
    queryKey: flagKeys.configVersions(environmentId, flagId),
    queryFn: () => api.get<ConfigVersion[]>(`${flagConfigPath(environmentId, flagId)}/versions`),
    enabled: environmentId !== null,
  });
