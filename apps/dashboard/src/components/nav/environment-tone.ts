/**
 * Environment colour, in one place.
 *
 * "Edited the wrong environment" is the category's defining catastrophic error
 * (TOGGLEFLOW_UX_DESIGN §2.2.4), so the environment is the one piece of scope
 * that gets a colour: red for production, amber for staging-like, teal for
 * development, neutral for anything a team invents. Colour never carries the
 * meaning alone - every surface that uses these also prints the environment's
 * name - it is reinforcement for the people who will scan past the text.
 *
 * Development is `info`, not `primary`. The scope chain sits in the app bar
 * surrounded by chrome that is already blue - the nav's active row, the focus
 * ring, every primary Button - so a blue environment chip was the one tone here
 * that did not stand out from its own surroundings, which is the entire job. It
 * also had to be tellable apart from red and amber at a glance, and `--info` is
 * teal as of tokens 0.2.0 (it used to be byte-identical to the link colour,
 * which is why this could not have been the answer before).
 *
 * Keyed on the environment `key`, not the display name: the key is the
 * immutable identifier the SDKs use, so a project that renames "Production" to
 * "Live" keeps its red.
 */
export interface EnvironmentTone {
  /** Background utility for the leading dot in pickers and tables. */
  dot: string;
  /** Text + background pair for a chip. */
  chip: string;
}

const PRODUCTION: EnvironmentTone = { dot: 'bg-danger', chip: 'bg-danger-soft text-danger' };
const STAGING: EnvironmentTone = { dot: 'bg-warning', chip: 'bg-warning-soft text-warning' };
const DEVELOPMENT: EnvironmentTone = { dot: 'bg-info', chip: 'bg-info-soft text-info' };
const NEUTRAL: EnvironmentTone = { dot: 'bg-field-border', chip: 'bg-bg2 text-muted-foreground' };

/** Prefix rather than exact match, so `prod-eu` and `staging-2` inherit the right colour. */
export function environmentTone(key: string): EnvironmentTone {
  const normalised = key.toLowerCase();
  if (normalised.startsWith('prod')) return PRODUCTION;
  if (normalised.startsWith('stag') || normalised.startsWith('uat')) return STAGING;
  if (normalised.startsWith('dev') || normalised.startsWith('local')) return DEVELOPMENT;
  return NEUTRAL;
}
