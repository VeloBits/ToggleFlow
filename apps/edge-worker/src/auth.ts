/**
 * API-key auth with ZERO origin/DB calls: the control plane publishes the
 * SHA-256 hashes of active keys to `keys:{environmentId}` (Phase 4); the
 * worker hashes the presented bearer token and checks membership. An unknown
 * environment and a bad key are indistinguishable (both 401) on purpose.
 */

export type KeyKind = 'server' | 'client';

interface PublishedKeyHashes {
  server?: string[];
  client?: string[];
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function authorize(
  request: Request,
  kv: KVNamespace,
  environmentId: string,
  kinds: KeyKind[],
): Promise<boolean> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length);
  if (token.length === 0) return false;

  const published = await kv.get<PublishedKeyHashes>(`keys:${environmentId}`, 'json');
  if (!published) return false;

  const hash = await sha256Hex(token);
  return kinds.some((kind) => published[kind]?.includes(hash));
}
