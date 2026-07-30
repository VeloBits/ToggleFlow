/**
 * Environment access for the control-plane API. Values come from .env
 * (see .env.example at the repo root).
 */
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://toggleflow:toggleflow@localhost:5434/toggleflow'),
  KEYCLOAK_URL: z.string().default('http://localhost:8080'),
  // Container-only override for the JWKS *network fetch*. The `iss` claim
  // Keycloak mints is pinned by KC_HOSTNAME=localhost in the velobits-infra
  // stack, so KEYCLOAK_URL (and therefore keycloakIssuer) must stay
  // http://localhost:8080 to match it - but that address is unreachable from
  // inside a container. Set this to http://keycloak-dev:8080 there, and leave it
  // unset on bare metal.
  KEYCLOAK_INTERNAL_URL: z.string().optional(),
  KEYCLOAK_REALM: z.string().default('Velobits'),
  KEYCLOAK_AUDIENCE: z.string().default('toggleflow-api'),
  // Delivery-plane publish target. `miniflare` = workerd's local KV persisted
  // into the edge worker's .wrangler state so `wrangler dev` reads it.
  KV_MODE: z.enum(['memory', 'miniflare', 'cloudflare']).default('miniflare'),
  KV_NAMESPACE_ID: z.string().default('toggleflow-rulesets-dev'),
  KV_PERSIST_PATH: z.string().default('../edge-worker/.wrangler/state/v3/kv'),
  PUBLISH_DEBOUNCE_MS: z.coerce.number().int().min(0).default(500),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export const env = {
  port: parsed.PORT,
  host: parsed.HOST,
  databaseUrl: parsed.DATABASE_URL,
  keycloakUrl: parsed.KEYCLOAK_URL,
  keycloakRealm: parsed.KEYCLOAK_REALM,
  keycloakAudience: parsed.KEYCLOAK_AUDIENCE,
  keycloakIssuer: `${parsed.KEYCLOAK_URL}/realms/${parsed.KEYCLOAK_REALM}`,
  /** Same shape as keycloakIssuer, but used only to build the JWKS fetch URL. */
  keycloakJwksIssuer: `${parsed.KEYCLOAK_INTERNAL_URL ?? parsed.KEYCLOAK_URL}/realms/${parsed.KEYCLOAK_REALM}`,
  kvMode: parsed.KV_MODE,
  kvNamespaceId: parsed.KV_NAMESPACE_ID,
  kvPersistPath: parsed.KV_PERSIST_PATH,
  publishDebounceMs: parsed.PUBLISH_DEBOUNCE_MS,
  cloudflareAccountId: parsed.CLOUDFLARE_ACCOUNT_ID,
  cloudflareApiToken: parsed.CLOUDFLARE_API_TOKEN,
};
