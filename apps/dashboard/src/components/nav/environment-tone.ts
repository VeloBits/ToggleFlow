/**
 * Environment colour, in one place.
 *
 * "Edited the wrong environment" is the category's defining catastrophic error
 * (TOGGLEFLOW_UX_DESIGN §2.2.4), so the environment is the one piece of scope
 * that gets a colour: red for production, amber for staging-like, blue for
 * development, neutral for anything a team invents. Colour never carries the
 * meaning alone - every surface that uses these also prints the environment's
 * name - it is reinforcement for the people who will scan past the text.
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

const PRODUCTION: EnvironmentTone = { dot: 'bg-off', chip: 'bg-off-soft text-off' };
const STAGING: EnvironmentTone = { dot: 'bg-rollout', chip: 'bg-rollout-soft text-rollout' };
const DEVELOPMENT: EnvironmentTone = { dot: 'bg-primary', chip: 'bg-primary-soft text-primary' };
const NEUTRAL: EnvironmentTone = { dot: 'bg-border-strong', chip: 'bg-bg2 text-muted-foreground' };

/** Prefix rather than exact match, so `prod-eu` and `staging-2` inherit the right colour. */
export function environmentTone(key: string): EnvironmentTone {
  const normalised = key.toLowerCase();
  if (normalised.startsWith('prod')) return PRODUCTION;
  if (normalised.startsWith('stag') || normalised.startsWith('uat')) return STAGING;
  if (normalised.startsWith('dev') || normalised.startsWith('local')) return DEVELOPMENT;
  return NEUTRAL;
}
