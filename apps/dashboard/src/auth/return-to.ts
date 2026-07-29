/**
 * Where to land after a Keycloak round trip. The guest home sends the path the
 * visitor was trying to reach through the OIDC `state`, so a deep link survives
 * signing in. Anything that isn't an in-app path falls back to `/`.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  // `//host` and `/\host` are protocol-relative — they leave the app.
  if (/^\/[/\\]/.test(value)) return '/';
  // Returning to the callback would re-run a spent auth code.
  if (value.startsWith('/auth/')) return '/';
  return value;
}

/** Read the return path out of the `state` oidc-client-ts hands back on callback. */
export function returnToFromState(state: unknown): string {
  const raw =
    typeof state === 'object' && state !== null
      ? (state as { returnTo?: unknown }).returnTo
      : state;
  return safeReturnTo(raw);
}
