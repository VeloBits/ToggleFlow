/**
 * @toggleflow/engine — the shared flag/config evaluation engine.
 *
 * Written once, run in three places: the control-plane API, the JS SDK
 * (Node + browser), and the Cloudflare edge worker. Keep this package
 * runtime-agnostic: no Node, DOM, or Workers APIs.
 *
 * Feature work lands here: ruleset types, flag evaluation, % rollouts,
 * targeting rules, config resolution.
 */
export const PACKAGE_NAME = '@toggleflow/engine';
