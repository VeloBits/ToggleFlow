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
  KEYCLOAK_REALM: z.string().default('Velobits-Dev'),
  KEYCLOAK_AUDIENCE: z.string().default('toggleflow-api'),
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
};
