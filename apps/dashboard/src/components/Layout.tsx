import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useWorkspace } from '../state/WorkspaceContext';
import { ErrorNote, Modal } from './ui';

function Switchers() {
  const ws = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);

  return (
    <>
      <select
        aria-label="Organization"
        value={ws.orgId ?? ''}
        onChange={(e) => ws.selectOrg(e.target.value)}
      >
        {ws.me?.orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {ws.projects.length === 0 ? (
        ws.role === 'admin' && (
          <button type="button" onClick={() => setCreating(true)}>
            ＋ New project
          </button>
        )
      ) : (
        <select
          aria-label="Project"
          value={ws.projectId ?? ''}
          onChange={(e) =>
            e.target.value === '__new__' ? setCreating(true) : ws.selectProject(e.target.value)
          }
        >
          {ws.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
          {ws.role === 'admin' && <option value="__new__">＋ New project…</option>}
        </select>
      )}
      <select
        aria-label="Environment"
        value={ws.environmentId ?? ''}
        onChange={(e) => ws.selectEnvironment(e.target.value)}
      >
        {ws.environments.map((env) => (
          <option key={env.id} value={env.id}>
            {env.name} ({env.key})
          </option>
        ))}
      </select>
      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <div className="field">
            <label htmlFor="project-name">Name</label>
            <input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <ErrorNote error={error} />
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={!name.trim()}
              onClick={() => {
                ws.createProject(name.trim())
                  .then(() => {
                    setCreating(false);
                    setName('');
                    setError(null);
                  })
                  .catch(setError);
              }}
            >
              Create (with dev/staging/prod)
            </button>
            <button type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const ws = useWorkspace();

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">ToggleFlow</span>
        <Switchers />
        <span className="spacer" />
        <span className="who">
          {ws.me?.user.displayName ?? ws.me?.user.email ?? user?.profile.email}
          {ws.role ? ` · ${ws.role}` : ''}
        </span>
        <button type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </header>
      <div className="body">
        <nav className="sidenav">
          <NavLink to="/" end>
            Tools
          </NavLink>
          <NavLink to="/segments">Segments</NavLink>
          <NavLink to="/keys">API keys</NavLink>
          <NavLink to="/audit">Audit log</NavLink>
          <NavLink to="/members">Members</NavLink>
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
