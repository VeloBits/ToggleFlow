/**
 * Current org / project / environment selection, persisted per user in
 * localStorage. Every data page hangs off this.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { api, type Environment, type Me, type Org, type Project, type Role } from '../api/client';

interface WorkspaceState {
  me: Me | null;
  orgId: string | null;
  org: Org | null;
  role: Role | null;
  projectId: string | null;
  project: Project | null;
  environmentId: string | null;
  projects: Project[];
  environments: Environment[];
  environment: Environment | null;
  loading: boolean;
  /** True once /v1/me has answered - the shell renders skeletons until then. */
  ready: boolean;
  selectOrg: (orgId: string) => void;
  selectProject: (projectId: string) => void;
  selectEnvironment: (environmentId: string) => void;
  createOrg: (name: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  createEnvironment: (input: { key: string; name: string }) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

const remembered = (key: string) => localStorage.getItem(`tf.${key}`);
const remember = (key: string, value: string | null) => {
  if (value === null) localStorage.removeItem(`tf.${key}`);
  else localStorage.setItem(`tf.${key}`, value);
};

/**
 * Which environment a project opens on when the user has never picked one.
 *
 * Production, if it exists. Every project is created with exactly one
 * environment and that environment is Production, so for most projects this is
 * the only candidate; for a project that has since grown a `dev` and a
 * `staging`, opening on whichever happened to be created first is arbitrary,
 * and arbitrary is the failure mode this product cares most about ("which
 * environment am I editing?"). Production is the one every project shares, so
 * it is the one the shell defaults to - loudly labelled, never silent.
 */
const preferredEnvironment = (list: Environment[]): Environment | undefined =>
  list.find((e) => e.key === 'prod') ?? list[0];

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [orgOverride, setOrgOverride] = useState<string | null>(remembered('org'));
  const [projectOverride, setProjectOverride] = useState<string | null>(remembered('project'));
  const [envOverride, setEnvOverride] = useState<string | null>(remembered('environment'));

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/v1/me') });
  const me = meQuery.data ?? null;
  const orgId = useMemo(() => {
    if (orgOverride && me?.orgs.some((o) => o.id === orgOverride)) return orgOverride;
    return me?.orgs[0]?.id ?? null;
  }, [me, orgOverride]);
  const org = me?.orgs.find((o) => o.id === orgId) ?? null;
  const role = org?.role ?? null;

  const projectsQuery = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.get<Project[]>(`/v1/orgs/${orgId}/projects`),
    enabled: orgId !== null,
  });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const projectId = useMemo(() => {
    if (projectOverride && projects.some((p) => p.id === projectOverride)) return projectOverride;
    return projects[0]?.id ?? null;
  }, [projects, projectOverride]);
  const project = projects.find((p) => p.id === projectId) ?? null;

  const environmentsQuery = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => api.get<Environment[]>(`/v1/projects/${projectId}/environments`),
    enabled: projectId !== null,
  });
  const environments = useMemo(() => environmentsQuery.data ?? [], [environmentsQuery.data]);
  const environmentId = useMemo(() => {
    if (envOverride && environments.some((e) => e.id === envOverride)) return envOverride;
    return preferredEnvironment(environments)?.id ?? null;
  }, [environments, envOverride]);
  const environment = environments.find((e) => e.id === environmentId) ?? null;

  const selectOrg = useCallback((id: string) => {
    remember('org', id);
    setOrgOverride(id);
    remember('project', null);
    setProjectOverride(null);
    remember('environment', null);
    setEnvOverride(null);
  }, []);
  const selectProject = useCallback((id: string) => {
    remember('project', id);
    setProjectOverride(id);
    remember('environment', null);
    setEnvOverride(null);
  }, []);
  const selectEnvironment = useCallback((id: string) => {
    remember('environment', id);
    setEnvOverride(id);
  }, []);

  const createOrg = useCallback(
    async (name: string) => {
      const created = await api.post<Org>('/v1/orgs', { name });
      // /v1/me is the only list of orgs, so it has to be refetched before the
      // new id can be selected - selectOrg against an org `me` has not seen
      // yet would be discarded by the `orgId` memo above.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      selectOrg(created.id);
    },
    [queryClient, selectOrg],
  );

  const createProject = useCallback(
    async (name: string) => {
      const project = await api.post<Project>(`/v1/orgs/${orgId}/projects`, { name });
      await queryClient.invalidateQueries({ queryKey: ['projects', orgId] });
      selectProject(project.id);
    },
    [orgId, queryClient, selectProject],
  );

  const createEnvironment = useCallback(
    async (input: { key: string; name: string }) => {
      const created = await api.post<Environment>(`/v1/projects/${projectId}/environments`, input);
      await queryClient.invalidateQueries({ queryKey: ['environments', projectId] });
      selectEnvironment(created.id);
    },
    [projectId, queryClient, selectEnvironment],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        orgId,
        org,
        role,
        projectId,
        project,
        environmentId,
        projects,
        environments,
        environment,
        loading: meQuery.isLoading || projectsQuery.isLoading || environmentsQuery.isLoading,
        ready: !meQuery.isLoading,
        selectOrg,
        selectProject,
        selectEnvironment,
        createOrg,
        createProject,
        createEnvironment,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace outside WorkspaceProvider');
  return ctx;
}
