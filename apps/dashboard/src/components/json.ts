/**
 * How this app formats JSON for display.
 *
 * This file used to be `diff.ts` and also carried an LCS line-diff. That diff is
 * now `diffLines` from `@velobits-dev/ui`, which computes the same
 * `{ kind: 'same' | 'added' | 'removed'; text }` shape and additionally caps its
 * output — so the three surfaces that render a diff (the audit payload viewer,
 * the flag config history, the state panel) get one implementation and one look
 * via `DiffViewer`, instead of two renderers over a shared algorithm.
 *
 * What is left is genuinely app-specific: two spaces of indentation, everywhere a
 * payload is shown or edited. It matters that it is one function — the config
 * editor round-trips through it, so a difference between how a payload is
 * displayed and how it is re-serialised would show up as a spurious diff.
 */
export const prettyJson = (value: unknown): string => JSON.stringify(value, null, 2);
