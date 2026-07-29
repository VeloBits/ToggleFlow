import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { GuestNav } from '../components/GuestNav';

/**
 * Public landing page — the default screen for anyone who isn't signed in.
 * Sign-in lives in the topbar (right side) rather than on a dedicated login
 * screen; both auth entry points carry the path the visitor asked for so a deep
 * link survives the Keycloak round trip.
 */

const FEATURES: { title: string; body: string; glyph: string }[] = [
  {
    glyph: '⏻',
    title: 'Kill switch',
    body: 'Turn any tool off in production instantly — no redeploy. Define the fallback users see: hide it, show a notice, or run an alternate path.',
  },
  {
    glyph: '◐',
    title: 'Gradual rollouts',
    body: 'Ship to 5%, then 25%, then everyone. Bucketing is deterministic per user, so nobody flickers between versions.',
  },
  {
    glyph: '◱',
    title: 'Targeting & segments',
    body: 'Reusable segments by plan, region, or any trait you send. The same rule model everywhere — no invented jargon.',
  },
  {
    glyph: '⚙',
    title: 'Remote config & prompts',
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
    body: 'Create a project and get dev, staging, and production environments with their own keys.',
  },
  {
    step: '2',
    title: 'Guard them in code',
    body: 'The backend SDK evaluates locally from an in-memory ruleset, so a flag check costs ~0ms and survives outages.',
  },
  {
    step: '3',
    title: 'Control from the dashboard',
    body: 'Flip a switch or edit config; connected SDKs pick the change up within seconds.',
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
  const { login, signup } = useAuth();
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
                VeloBits Control Plane
              </p>
              <h1 className="mb-4 text-[32px] leading-[1.1] sm:text-[40px]">
                A remote control plane for every tool in your app
              </h1>
              <p className="text-muted mb-8 max-w-xl text-[16px] leading-relaxed">
                Kill switches, gradual rollouts, targeting, and live configuration — changed from a
                dashboard and delivered in seconds. No redeploy, no waiting on a release.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="primary px-4 py-2.5"
                  onClick={() => void signup(returnTo)}
                >
                  Get started free
                </button>
                <button type="button" className="px-4 py-2.5" onClick={() => void login(returnTo)}>
                  Sign in
                </button>
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

        <Section id="features" eyebrow="What you get" title="Everything a flag platform owes you">
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

        <Section id="how" eyebrow="How it works" title="Three steps to your first flag">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <ol className="grid gap-6">
              {STEPS.map((item) => (
                <li key={item.step} className="grid grid-cols-[28px_1fr] gap-3">
                  <span className="border-border bg-bg2 text-accent grid h-7 w-7 place-items-center rounded-full border text-[12.5px] font-semibold">
                    {item.step}
                  </span>
                  <span>
                    <h3 className="mb-1">{item.title}</h3>
                    <p className="text-muted text-[13px] leading-relaxed">{item.body}</p>
                  </span>
                </li>
              ))}
            </ol>
            <pre className="border-border bg-panel overflow-x-auto rounded-lg border p-4 font-mono text-[12.5px] leading-relaxed">
              {SNIPPET}
            </pre>
          </div>
        </Section>

        <Section id="why" eyebrow="Why ToggleFlow" title="Built for tool-heavy and AI-heavy apps">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-border bg-panel rounded-lg border p-5">
              <h3 className="mb-1">Flags that know what they control</h3>
              <p className="text-muted text-[13px] leading-relaxed">
                A flag can carry its tool&apos;s route, owner, and model parameters — not just a
                bare boolean.
              </p>
            </div>
            <div className="border-border bg-panel rounded-lg border p-5">
              <h3 className="mb-1">Config and prompts, versioned</h3>
              <p className="text-muted text-[13px] leading-relaxed">
                Prompts and model params are configuration: edit, diff, and roll back without a
                deploy.
              </p>
            </div>
            <div className="border-border bg-panel rounded-lg border p-5">
              <h3 className="mb-1">The read path is the promise</h3>
              <p className="text-muted text-[13px] leading-relaxed">
                Evaluation runs at the edge or in your process, so your app keeps working even when
                ours doesn&apos;t.
              </p>
            </div>
          </div>
        </Section>

        <section className="border-border/60 border-t px-6 py-16 text-center">
          <h2 className="mb-3 text-[22px]">Take back control of production</h2>
          <p className="text-muted mx-auto mb-7 max-w-lg leading-relaxed">
            Create an organization, add your first application, and flip a real flag in minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="primary px-4 py-2.5"
              onClick={() => void signup(returnTo)}
            >
              Get started free
            </button>
            <button type="button" className="px-4 py-2.5" onClick={() => void login(returnTo)}>
              Sign in
            </button>
          </div>
        </section>
      </main>

      <footer className="border-border/60 text-muted border-t px-6 py-8 text-[12.5px]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span>ToggleFlow — a VeloBits product</span>
          <span className="flex-1" />
          <button type="button" className="ghost" onClick={() => void login(returnTo)}>
            Sign in
          </button>
        </div>
      </footer>
    </div>
  );
}
