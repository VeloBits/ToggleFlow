/**
 * Environment access for the control-plane API. Values come from .env
 * (see .env.example at the repo root). Grows a zod-validated schema once
 * real config lands (Keycloak, Stripe, delivery-plane publish credentials).
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://toggleflow:toggleflow@localhost:5434/toggleflow',
};
