/**
 * Current org / project / environment selection, persisted per user in
 * localStorage. Every data page hangs off this.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { api, type Environment, type Me, type Project, type Role } from '../api/client';

interface WorkspaceState {
  me: Me | null;
  orgId: string | null;
  role: Role | null;
  projectId: string | null;
  environmentId: string | null;
  projects: Project[];
  environments: Environment[];
  environment: Environment | null;
  loading: boolean;
  selectOrg: (orgId: string) => void;
  selectProject: (projectId: string) => void;
  selectEnvironment: (environmentId: string) => void;
  createProject: (name: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

const remembered = (key: string) => localStorage.getItem(`tf.${key}`);
const remember = (key: string, value: string | null) => {
  if (value === null) localStorage.removeItem(`tf.${key}`);
  else localStorage.setItem(`tf.${key}`, value);
};

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
  const role = me?.orgs.find((o) => o.id === orgId)?.role ?? null;

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

  const environmentsQuery = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => api.get<Environment[]>(`/v1/projects/${projectId}/environments`),
    enabled: projectId !== null,
  });
  const environments = useMemo(() => environmentsQuery.data ?? [], [environmentsQuery.data]);
  const environmentId = useMemo(() => {
    if (envOverride && environments.some((e) => e.id === envOverride)) return envOverride;
    return environments[0]?.id ?? null;
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

  const createProject = useCallback(
    async (name: string) => {
      const project = await api.post<Project>(`/v1/orgs/${orgId}/projects`, { name });
      await queryClient.invalidateQueries({ queryKey: ['projects', orgId] });
      selectProject(project.id);
    },
    [orgId, queryClient, selectProject],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        orgId,
        role,
        projectId,
        environmentId,
        projects,
        environments,
        environment,
        loading: meQuery.isLoading || projectsQuery.isLoading || environmentsQuery.isLoading,
        selectOrg,
        selectProject,
        selectEnvironment,
        createProject,
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
