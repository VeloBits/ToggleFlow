/**
 * @toggleflow/sdk — the JS/TS client SDK.
 *
 * Two clients will land here:
 *  - server client (secret key): downloads the full ruleset at boot, caches it
 *    in memory, and evaluates locally via @toggleflow/engine — authoritative,
 *    survives platform outages.
 *  - browser client (client key): fetches already-evaluated flags from the
 *    edge endpoint — cosmetic; targeting rules never ship to the browser.
 *
 * Package wiring only for now — no feature code.
 */
export { SCHEMA_VERSION as ENGINE_SCHEMA_VERSION } from '@toggleflow/engine';

export const PACKAGE_NAME = '@toggleflow/sdk';
