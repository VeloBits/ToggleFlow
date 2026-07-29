import type { User } from 'oidc-client-ts';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { signupRedirect, userManager } from './oidc';
import { safeReturnTo } from './return-to';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** `returnTo` is the in-app path to land on after the Keycloak round trip. */
  login: (returnTo?: string) => Promise<void>;
  signup: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void userManager.getUser().then((loaded) => {
      if (!mounted) return;
      setUser(loaded && !loaded.expired ? loaded : null);
      setLoading(false);
    });
    const onLoaded = (loaded: User) => setUser(loaded);
    const onUnloaded = () => setUser(null);
    userManager.events.addUserLoaded(onLoaded);
    userManager.events.addUserUnloaded(onUnloaded);
    return () => {
      mounted = false;
      userManager.events.removeUserLoaded(onLoaded);
      userManager.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: (returnTo) =>
          userManager.signinRedirect({ state: { returnTo: safeReturnTo(returnTo) } }),
        signup: (returnTo) => signupRedirect(safeReturnTo(returnTo)),
        logout: () => userManager.signoutRedirect(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Current access token for API calls (empty string while logged out). */
export async function getAccessToken(): Promise<string> {
  const user = await userManager.getUser();
  return user?.access_token ?? '';
}
