/**
 * The flags feature's public surface.
 *
 * Everything else in here (the filter, the value controls, the row components)
 * is internal to the feature - the router only ever needs the two screens, and
 * routing through this barrel is what keeps that true.
 */
export { FlagDetailPage } from './FlagDetailPage';
export { FlagsPage } from './FlagsPage';
