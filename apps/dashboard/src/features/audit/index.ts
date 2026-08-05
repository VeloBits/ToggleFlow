/**
 * The audit feature's public surface.
 *
 * Everything else in here - the event catalog, the summary builder, the row and
 * detail components - is internal. The router only needs the screen, and routing
 * through this barrel is what keeps the rest free to change.
 */
export { AuditLogPage } from './AuditLogPage';
