/**
 * Keycloak OIDC wiring: `toggleflow-dashboard` public client (PKCE) on the
 * shared Velobits-Dev realm.
 *
 * Signup: Keycloak ignores prompt=create, so a second UserManager overrides
 * the authorization endpoint with /registrations (the fixmytext-proven
 * pattern). Both managers share the sessionStorage state store, so the
 * normal callback completes either flow.
 */
import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'Velobits-Dev';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'toggleflow-dashboard';

const authority = `${KEYCLOAK_URL}/realms/${REALM}`;
const oidc = `${authority}/protocol/openid-connect`;

const settings: UserManagerSettings = {
  authority,
  client_id: CLIENT_ID,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
};

export const userManager = new UserManager(settings);

const signupUserManager = new UserManager({
  ...settings,
  metadata: {
    issuer: authority,
    authorization_endpoint: `${oidc}/registrations`,
    token_endpoint: `${oidc}/token`,
    userinfo_endpoint: `${oidc}/userinfo`,
    end_session_endpoint: `${oidc}/logout`,
    jwks_uri: `${oidc}/certs`,
  },
});

/** Keycloak registration page with a full code-flow round trip back to the app. */
export const signupRedirect = (returnTo?: string): Promise<void> =>
  signupUserManager.signinRedirect({ state: { returnTo } });
