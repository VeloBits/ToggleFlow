/**
 * The three navigation slots whose backend does not exist yet. One file: they
 * are each a title and a list, and three near-identical modules would just be
 * three places to forget when one of them becomes real.
 *
 * When a surface is built it moves out of here into its own page and drops the
 * `soon` flag in nav-items.ts.
 */
import { ComingSoon } from '../components/page';
import { CreditCardIcon, PlugIcon, WebhookIcon } from '../ui/icons';

export function WebhooksPage() {
  return (
    <ComingSoon
      icon={WebhookIcon}
      title="Webhooks"
      description="Push flag and config changes to your own systems as they happen."
      planned={[
        'Per-environment endpoints with a signing secret and replay protection',
        'Subscribe by event: flag flipped, rollout changed, config published, key revoked',
        'Delivery log with response codes, and one-click redelivery of a failed call',
        'Automatic backoff, with the endpoint paused after repeated failures',
      ]}
    />
  );
}

export function IntegrationsPage() {
  return (
    <ComingSoon
      icon={PlugIcon}
      title="Integrations"
      description="Connect ToggleFlow to the tools your team already runs incidents from."
      planned={[
        'Slack: change notifications, and kill-switch flips from a slash command',
        'GitHub: manifest sync status on the pull request that changed it',
        'PagerDuty / Opsgenie: attach a flag change to an open incident',
        'OpenTelemetry: emit evaluation spans to your existing collector',
      ]}
    />
  );
}

export function BillingPage() {
  return (
    <ComingSoon
      icon={CreditCardIcon}
      title="Billing"
      description="Plan, usage and invoices for this organization."
      planned={[
        'Flat, public pricing — no per-seat or monthly-active-user arithmetic',
        'Current usage against plan limits: projects, environments, evaluations',
        'Invoice history and payment method, through the Stripe customer portal',
        'Organization owner and billing contact, managed separately from roles',
      ]}
    />
  );
}
