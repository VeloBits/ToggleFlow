/**
 * Deriving a machine key from a display name.
 *
 * Two variants because the two keys have different grammars on the server, and a
 * shared "slugify" that produced a key one of them rejects would fail at submit
 * time with the user's typing already discarded. Each pattern below is a copy of
 * the API's, and the pairing is the point: the slugifier only ever emits
 * characters its own pattern accepts.
 */

/** Mirrors the API's environment key rule (apps/api/src/routes/projects.ts). */
export const ENVIRONMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Mirrors the API's flag key rule. Dots and underscores are legal here because
 * flag keys are namespaced by convention (`checkout.v2`, `ai.model_name`) and
 * that convention is what makes a few hundred of them navigable.
 */
export const FLAG_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Both variants collapse runs of illegal characters to a single dash rather than
 * dropping them, so "Load  Testing" is `load-testing` and not `loadtesting`, and
 * both trim separators off the ends because neither pattern lets a key start
 * with one. Trimming `._` as well as `-` is a no-op for environment keys, where
 * those characters are illegal in the first place.
 */
const slugifier = (illegal: RegExp) => (value: string) =>
  value
    .toLowerCase()
    .replace(illegal, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 50);

/** "Load Testing" -> "load-testing". Only used until the user edits the key themselves. */
export const slugifyEnvironmentKey = slugifier(/[^a-z0-9]+/g);

/** "Checkout v2" -> "checkout-v2"; "checkout.v2" keeps its dot. */
export const slugifyFlagKey = slugifier(/[^a-z0-9._-]+/g);
