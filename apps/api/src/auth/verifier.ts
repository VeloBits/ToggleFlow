/**
 * Bearer-token verification. Production verifies against the Keycloak
 * realm's JWKS; tests inject a local key set through the same code path.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import { unauthorized } from '../lib/errors';

export interface TokenClaims {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
}

export type TokenVerifier = (token: string) => Promise<TokenClaims>;

export interface VerifierConfig {
  issuer: string;
  audience: string;
  getKey: JWTVerifyGetKey;
}

export function createTokenVerifier(config: VerifierConfig): TokenVerifier {
  return async (token) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, config.getKey, {
        issuer: config.issuer,
        audience: config.audience,
      }));
    } catch {
      throw unauthorized('invalid or expired token');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw unauthorized('token has no subject');
    }
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      preferredUsername:
        typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined,
    };
  };
}

export function createKeycloakVerifier(opts: { issuer: string; audience: string }): TokenVerifier {
  const jwksUrl = new URL(`${opts.issuer}/protocol/openid-connect/certs`);
  return createTokenVerifier({ ...opts, getKey: createRemoteJWKSet(jwksUrl) });
}
