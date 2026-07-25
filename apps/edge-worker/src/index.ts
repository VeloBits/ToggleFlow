/**
 * ToggleFlow delivery plane.
 *
 * Serves published, versioned ruleset snapshots from KV at the edge. This
 * path is the product's uptime promise: it must keep serving the last
 * published snapshot even when the control plane is down. Read-only —
 * never touches the origin server or the database.
 */

export interface Env {
  /** KV namespace holding published ruleset snapshots (bound in wrangler.jsonc). */
  RULESETS: KVNamespace;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    return Response.json({ error: 'not_implemented' }, { status: 501 });
  },
} satisfies ExportedHandler<Env>;
