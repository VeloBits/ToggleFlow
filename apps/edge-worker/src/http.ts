/** Shared response plumbing: CORS for browser callers, JSON errors, ETag matching. */

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, if-none-match',
  'access-control-expose-headers': 'etag, x-ruleset-version',
} as const;

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: code, message }, { status, headers: CORS_HEADERS });
}

/** Handles quoted, weak (`W/`), and comma-separated If-None-Match values. */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((raw) => {
    const candidate = raw.trim().replace(/^W\//i, '');
    return candidate === '*' || candidate === etag;
  });
}
