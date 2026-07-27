/**
 * API-key material. The full token is returned exactly once at creation;
 * only `prefix` (for display/lookup) and the SHA-256 `hash` are stored.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface GeneratedApiKey {
  token: string;
  prefix: string;
  hash: string;
}

const KIND_TAG = { server: 'srv', client: 'cli' } as const;

export function generateApiKey(kind: 'server' | 'client'): GeneratedApiKey {
  const secret = randomBytes(24).toString('base64url');
  const token = `tf_${KIND_TAG[kind]}_${secret}`;
  return { token, prefix: token.slice(0, 15), hash: hashApiKey(token) };
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
