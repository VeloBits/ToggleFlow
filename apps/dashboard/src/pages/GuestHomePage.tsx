import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { GuestFooter } from '../components/GuestFooter';
import { GuestNav } from '../components/GuestNav';

/**
 * Public landing page — the default screen for anyone who isn't signed in, and
 * the only crawlable surface of the SPA, so it carries the product's SEO copy
 * (its <head> metadata lives in apps/dashboard/index.html).
 *
 * Sign-up is the page's own CTA; the nav and footer own the rest of the auth
 * entry points. Every one of them carries the path the visitor asked for so a
 * deep link survives the Keycloak round trip.
 */

const FEATURES: { title: string; body: string; glyph: string }[] = [
  {
    glyph: '⏻',
    title: 'Kill switches',
    body: 'Turn any tool off in production instantly — no redeploy. Define the fallback users see: hide it, show a notice, or run an alternate path.',
  },
  {
    glyph: '◐',
    title: 'Progressive rollouts',
    body: 'Ship to 5%, then 25%, then everyone. Bucketing is deterministic per user, so nobody flickers between versions.',
  },
  {
    glyph: '◱',
    title: 'Targeting & segments',
    body: 'Reusable segments by plan, region, or any trait you send. The same rule model everywhere — no invented jargon.',
  },
  {
    glyph: '⚙',
    title: 'Remote configuration',
    body: 'Limits, endpoints, model params, and prompts edited live. Every change is versioned with a diff and one-click rollback.',
  },
  {
    glyph: '⚡',
    title: 'Edge delivery',
    body: 'Reads are served from the edge and keep serving the last published ruleset even if the control plane is down.',
  },
  {
    glyph: '≡',
    title: 'Audit trail',
    body: 'Who flipped what, when, and why — per flag and org-wide, with scoped per-environment API keys and roles.',
  },
];

const STEPS: { step: string; title: string; body: string }[] = [
  {
    step: '1',
    title: 'Register your tools',
    body: 'Create a project and get dev, staging, and production environments, each with its own scoped API keys.',
  },
  {
    step: '2',
    title: 'Guard them in code',
    body: 'The server SDK evaluates locally from an in-memory ruleset, so a flag check costs ~0ms and survives outages.',
  },
  {
    step: '3',
    title: 'Control from the dashboard',
    body: 'Flip a switch or edit config; connected SDKs pick the change up within seconds.',
  },
];

// The use cases people actually arrive searching for — kept to what the
// platform genuinely does (see docs/ToggleFlow/TOGGLEFLOW_PRODUCT_BRIEF.md).
const USE_CASES: { title: string; body: string; glyph: string }[] = [
  {
    glyph: '◐',
    title: 'Progressive rollouts',
    body: 'Move a feature from 5% to 100% in steps you control, and pause or reverse at any point. Deterministic bucketing keeps every user on one side of the line.',
  },
  {
    glyph: '◇',
    title: 'Canary releases',
    body: 'Release to your own team first, then a beta segment, then everyone. Same targeting rules — just a narrower audience while you watch it behave.',
  },
  {
    glyph: '⇄',
    title: 'A/B testing',
    body: 'Split traffic deterministically by percentage or segment, so a user sees one variant consistently across your backend and frontend, and read the outcome in the analytics you already run.',
  },
  {
    glyph: '⏻',
    title: 'Incident response',
    body: 'A misbehaving tool goes off in one click, serving the fallback you defined ahead of time. No hotfix branch, no release window.',
  },
  {
    glyph: '⚙',
    title: 'AI prompts & model config',
    body: 'Prompts, model parameters, and rate limits are configuration, not code: edit them live, diff every change, and roll back the one that made things worse.',
  },
  {
    glyph: '◱',
    title: 'Per-tenant configuration',
    body: 'Values that differ by plan or region live in one versioned ruleset instead of a wall of environment variables nobody dares to touch.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What are feature flags?',
    a: 'A feature flag is a switch around a piece of code, so the decision to run it moves out of your release and into a dashboard. You deploy once, then turn the feature on, off, or on for a subset of users whenever you want.',
  },
  {
    q: 'What is remote configuration?',
    a: 'Remote configuration is the same idea applied to values rather than code paths: limits, endpoints, model parameters, prompts. Every change is versioned with a diff and a one-click rollback, so editing production config is a reversible act.',
  },
  {
    q: 'How do progressive rollouts and canary releases work?',
    a: 'You give a flag a percentage, and ToggleFlow buckets users deterministically — the same user always lands on the same side, so nobody flickers between versions. For a canary release, narrow the audience to a segment first, then widen the percentage as your confidence grows.',
  },
  {
    q: 'Can I run A/B tests with ToggleFlow?',
    a: 'Yes, for the assignment half: percentage splits and segment targeting decide which variant each user gets, consistently everywhere the SDK runs. Measurement stays in your analytics tool — ToggleFlow does not compute statistical significance for you.',
  },
  {
    q: 'What happens if ToggleFlow goes down?',
    a: 'Your app keeps working. The read path is a separate delivery plane on Cloudflare Workers and KV that keeps serving the last published ruleset even when the control plane is unavailable, and the server SDK evaluates from its own in-memory copy — so a flag check never waits on us.',
  },
  {
    q: 'Which languages and frameworks are supported?',
    a: 'There is a typed JavaScript and TypeScript SDK, with a React adapter for the frontend and route middleware for Express and Fastify on the backend. Everything it does also goes over a plain REST API, so any language that can make an HTTP request can read flags today.',
  },
  {
    q: 'Is ToggleFlow free to start?',
    a: 'There is a free tier, and paid pricing is flat and predictable. It is a hosted SaaS, so there is nothing to run yourself: self-serve onboarding is designed to take about 15 minutes from signing up to flipping a real flag.',
  },
];

// Real `@toggleflow/sdk` API (server client) — keep in step with packages/sdk-js.
const SNIPPET = `import { createServerClient } from '@toggleflow/sdk';

const flags = createServerClient({
  edgeUrl: 'https://edge.toggleflow.dev',
  environmentId: process.env.TF_ENV_ID,
  serverKey: process.env.TF_SERVER_KEY,
});

app.post('/summarize', (req, res) => {
  const flag = 'tool.summarize';
  if (!flags.isEnabled(flag, req.user)) {
    return res.status(503).json(flags.getFallback(flag));
  }
  const { model } = flags.getConfig(flag) ?? {};
  // …run the tool
});`;

function MockRow({
  flagKey,
  name,
  state,
}: {
  flagKey: string;
  name: string;
  state: 'on' | 'off' | 'rollout';
}) {
  const chip =
    state === 'on' ? (
      <span className="chip chip-on">ON</span>
    ) : state === 'off' ? (
      <span className="chip chip-off">OFF</span>
    ) : (
      <span className="chip chip-rollout">25%</span>
    );
  const glyph = state === 'on' ? '●' : state === 'off' ? '○' : '◐';
  const tone = state === 'on' ? 'text-on' : state === 'off' ? 'text-off' : 'text-rollout';
  return (
    <div className="border-border/60 grid grid-cols-[16px_1fr_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0">
      <span className={tone} aria-hidden>
        {glyph}
      </span>
      <span className="min-w-0">
        <code className="font-mono text-[12.5px]">{flagKey}</code>
        <span className="text-muted ml-2 hidden text-[12.5px] sm:inline">{name}</span>
      </span>
      {chip}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-border/60 scroll-mt-24 border-t px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <p className="text-accent mb-2 text-[12.5px] font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
        <h2 className="mb-8 text-[22px]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function GuestHomePage() {
  const { signup } = useAuth();
  const location = useLocation();
  // A visitor who landed on /tools/abc gets sent back there after signing in.
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <div className="bg-bg text-text min-h-screen">
      <a
        href="#main"
        className="border-border bg-panel text-text focus-visible:ring-accent sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-md focus:border focus:px-3 focus:py-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        Skip to content
      </a>
      <GuestNav returnTo={returnTo} />

      {/* The nav is fixed, so the hero owns the clearance under it. */}
      <main id="main" className="scroll-mt-24">
        <section className="px-6 pt-28 pb-16 sm:pt-32">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="border-border bg-bg2 text-muted mb-5 inline-block rounded-full border px-3 py-1 text-[12px]">
                ToggleFlow · feature management platform
              </p>
              <h1 className="mb-4 text-[32px] leading-[1.1] sm:text-[40px]">
                Feature flags and remote configuration from one control plane
              </h1>
              <p className="text-muted mb-8 max-w-xl text-[16px] leading-relaxed">
                ToggleFlow is the feature management layer for your app: kill switches, progressive
                rollouts, targeting, and live configuration — changed from a dashboard and delivered
                in seconds. No redeploy, no waiting on a release.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="primary px-4 py-2.5"
                  onClick={() => void signup(returnTo)}
                >
                  Get started free
                </button>
                <a
                  href="#how"
                  className="border-border bg-panel text-text hover:bg-highlight inline-flex items-center rounded-md border px-4 py-2.5"
                >
                  See how it works
                </a>
              </div>
              <p className="text-muted mt-4 text-[12.5px]">
                Free tier · Set up in about 15 minutes · Flat, predictable pricing
              </p>
            </div>

            <div className="border-border bg-panel overflow-hidden rounded-xl border shadow-sm">
              <div className="border-border/60 text-muted flex items-center gap-2 border-b px-3 py-2 text-[12px]">
                <span className="text-off" aria-hidden>
                  ●
                </span>
                <span>fixmytext · production</span>
                <span className="flex-1" />
                <span className="font-mono">ruleset v418</span>
              </div>
              <MockRow flagKey="tool.summarize" name="Summarize" state="on" />
              <MockRow flagKey="tool.rewrite" name="Rewrite" state="rollout" />
              <MockRow flagKey="tool.ocr" name="OCR" state="off" />
              <MockRow flagKey="tool.translate" name="Translate" state="on" />
              <div className="text-muted px-3 py-2 text-[12px]">
                254 flags · 246 on · 5 off · 3 rolling out
              </div>
            </div>
          </div>
        </section>

        <Section
          id="features"
          eyebrow="Features"
          title="Everything a feature flag platform owes you"
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="border-border bg-panel rounded-lg border p-5 leading-relaxed"
              >
                <span className="text-accent text-[18px]" aria-hidden>
                  {feature.glyph}
                </span>
                <h3 className="mt-2 mb-1">{feature.title}</h3>
                <p className="text-muted text-[13px]">{feature.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="how"
          eyebrow="Developers"
          title="A developer platform: typed SDK, REST API, and route middleware"
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <ol className="grid gap-6">
                {STEPS.map((item) => (
                  <li key={item.step} className="grid grid-cols-[28px_1fr] gap-3">
                    <span className="border-border bg-bg2 text-accent grid h-7 w-7 place-items-center rounded-full border text-[12.5px] font-semibold">
                      {item.step}
                    </span>
                    {/* div, not span: a heading is flow content, not phrasing. */}
                    <div>
                      <h3 className="mb-1">{item.title}</h3>
                      <p className="text-muted text-[13px] leading-relaxed">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-muted mt-6 text-[13px] leading-relaxed">
                One evaluation engine backs the SDK, the REST API, and the edge worker, so a flag
                answers the same way everywhere. The React adapter hides tools in the UI, and the
                Express and Fastify middleware maps routes to flags — guarding a route-shaped tool
                takes no per-tool code at all.
              </p>
            </div>
            <pre className="border-border bg-panel overflow-x-auto rounded-lg border p-4 font-mono text-[12.5px] leading-relaxed">
              {SNIPPET}
            </pre>
          </div>
        </Section>

        <Section
          id="use-cases"
          eyebrow="Use cases"
          title="From progressive rollouts to canary releases, A/B tests, and kill switches"
        >
          <p className="text-muted mb-8 max-w-3xl text-[14px] leading-relaxed">
            One flag model covers all of it, and it is deliberately sharper for tool-heavy and
            AI-heavy apps: a flag carries its tool&apos;s route, owner, and model parameters rather
            than a bare boolean.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((useCase) => (
              <li
                key={useCase.title}
                className="border-border bg-panel rounded-lg border p-5 leading-relaxed"
              >
                <span className="text-accent text-[18px]" aria-hidden>
                  {useCase.glyph}
                </span>
                <h3 className="mt-2 mb-1">{useCase.title}</h3>
                <p className="text-muted text-[13px]">{useCase.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="faq" eyebrow="FAQ" title="Feature flags and remote configuration, explained">
          {/* A divided list rather than a card grid: the answers are long enough
              that one readable column beats three narrow ones. */}
          <ul className="border-border bg-panel divide-border/60 grid max-w-3xl divide-y rounded-lg border">
            {FAQ.map((item) => (
              <li key={item.q} className="px-5 py-4">
                <h3 className="mb-1">{item.q}</h3>
                <p className="text-muted text-[13px] leading-relaxed">{item.a}</p>
              </li>
            ))}
          </ul>
        </Section>

        <section className="border-border/60 border-t px-6 py-16 text-center">
          <h2 className="mb-3 text-[22px]">Ship your next feature behind a flag</h2>
          <p className="text-muted mx-auto mb-7 max-w-lg leading-relaxed">
            Create an organization, add your first project, and flip a real flag in minutes — on the
            free tier.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="primary px-4 py-2.5"
              onClick={() => void signup(returnTo)}
            >
              Get started free
            </button>
            <a
              href="#use-cases"
              className="border-border bg-panel text-text hover:bg-highlight inline-flex items-center rounded-md border px-4 py-2.5"
            >
              Browse use cases
            </a>
          </div>
        </section>
      </main>

      <GuestFooter returnTo={returnTo} />
    </div>
  );
}
