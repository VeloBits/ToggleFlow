import type { ComponentType, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { GuestFooter } from '../components/GuestFooter';
import { GuestNav } from '../components/GuestNav';
import { Accordion, type AccordionItem } from '../ui/accordion';
import type { IconProps } from '../ui/icons';
import {
  AlertTriangleIcon,
  CircleCheckIcon,
  CircleHalfIcon,
  CircleSlashIcon,
  DotIcon,
  GlobeIcon,
  HistoryIcon,
  LayersIcon,
  PowerIcon,
  SlidersIcon,
  SparklesIcon,
  SplitIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from '../ui/icons';

/**
 * Public landing page — the default screen for anyone who isn't signed in, and
 * the only crawlable surface of the SPA, so it carries the product's SEO copy
 * (its <head> metadata lives in apps/dashboard/index.html).
 *
 * Sign-up is the page's own CTA; the nav and footer own the rest of the auth
 * entry points. Every one of them carries the path the visitor asked for so a
 * deep link survives the Keycloak round trip.
 *
 * Every section pairs GUTTER with CONTAINER (see both constants): one width and
 * one gutter for the whole page, shared with the nav island and the footer, so
 * this reads as a single column of content rather than five differently-inset
 * ones. Icons all come from ../ui/icons — no Unicode glyphs stand in for one,
 * since those inherit the font's metrics instead of the design system's.
 */

/**
 * The page's content box, and the reason every section starts and ends on the
 * same two vertical lines. `max-w-page` (72rem/1152px, theme.css) is shared with
 * the nav island and the footer; the sections used to sit at max-w-5xl, which
 * inset the whole middle of the page by 64px a side under a full-bleed hairline.
 *
 * The `px-6` gutter belongs on the SECTION, outside this cap, never on the box
 * itself: sizing is border-box (styles.css), so `max-w-page px-6` on one element
 * spends the gutter out of the 1152px and lands 24px inside the nav island's
 * edges. Gutter outside, and the cap resolves to the full 1152 at every width
 * wide enough to reach it — below that the box shrinks and the gutter holds.
 */
const CONTAINER = 'mx-auto w-full max-w-page';

/** The gutter that pairs with CONTAINER. On the section, so hairlines stay full-bleed. */
const GUTTER = 'px-6';

/**
 * Card icon plate. A 36px accent-soft tile rather than a bare icon: at 18px on
 * the page background the stroke read as a stray mark, and colouring it up to
 * full accent competed with the CTA. The tile gives it presence at low contrast,
 * and `accent-soft` is a token, so it follows the theme without a `dark:` rule.
 */
const ICON_PLATE =
  'border-accent-soft bg-accent-soft text-accent mb-3 grid h-9 w-9 place-items-center rounded-lg border';

/** Feature and use-case cards share a box, so they share the class string. */
const CARD = 'border-border bg-panel rounded-lg border p-5 leading-relaxed';

interface Highlight {
  title: string;
  body: string;
  /** Stroke icon from ../ui/icons — sized at the call site, never inline-styled. */
  icon: ComponentType<IconProps>;
}

const FEATURES: Highlight[] = [
  {
    icon: PowerIcon,
    title: 'Kill switches',
    body: 'Turn any tool off in production instantly — no redeploy. Define the fallback users see: hide it, show a notice, or run an alternate path.',
  },
  {
    icon: TrendingUpIcon,
    title: 'Progressive rollouts',
    body: 'Ship to 5%, then 25%, then everyone. Bucketing is deterministic per user, so nobody flickers between versions.',
  },
  {
    icon: TargetIcon,
    title: 'Targeting & segments',
    body: 'Reusable segments by plan, region, or any trait you send. The same rule model everywhere — no invented jargon.',
  },
  {
    icon: SlidersIcon,
    title: 'Remote configuration',
    body: 'Limits, endpoints, model params, and prompts edited live. Every change is versioned with a diff and one-click rollback.',
  },
  {
    icon: GlobeIcon,
    title: 'Edge delivery',
    body: 'Reads are served from the edge and keep serving the last published ruleset even if the control plane is down.',
  },
  {
    icon: HistoryIcon,
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
const USE_CASES: Highlight[] = [
  {
    icon: TrendingUpIcon,
    title: 'Progressive rollouts',
    body: 'Move a feature from 5% to 100% in steps you control, and pause or reverse at any point. Deterministic bucketing keeps every user on one side of the line.',
  },
  {
    // An audience, not a rocket: at 18px every rocket silhouette read as a
    // letter A, and who receives the release is what a canary actually is.
    icon: UsersIcon,
    title: 'Canary releases',
    body: 'Release to your own team first, then a beta segment, then everyone. Same targeting rules — just a narrower audience while you watch it behave.',
  },
  {
    icon: SplitIcon,
    title: 'A/B testing',
    body: 'Split traffic deterministically by percentage or segment, so a user sees one variant consistently across your backend and frontend, and read the outcome in the analytics you already run.',
  },
  {
    icon: AlertTriangleIcon,
    title: 'Incident response',
    body: 'A misbehaving tool goes off in one click, serving the fallback you defined ahead of time. No hotfix branch, no release window.',
  },
  {
    icon: SparklesIcon,
    title: 'AI prompts & model config',
    body: 'Prompts, model parameters, and rate limits are configuration, not code: edit them live, diff every change, and roll back the one that made things worse.',
  },
  {
    icon: LayersIcon,
    title: 'Per-tenant configuration',
    body: 'Values that differ by plan or region live in one versioned ruleset instead of a wall of environment variables nobody dares to touch.',
  },
];

/**
 * Typed as the accordion's own item shape, so the FAQ is data the component can
 * take directly. The ids are explicit rather than slugified from the question:
 * they seed the trigger/panel element ids, and rewording a question should not
 * silently change the DOM contract or which item opens by default.
 */
const FAQ: AccordionItem[] = [
  {
    id: 'faq-feature-flags',
    title: 'What are feature flags?',
    content:
      'A feature flag is a switch around a piece of code, so the decision to run it moves out of your release and into a dashboard. You deploy once, then turn the feature on, off, or on for a subset of users whenever you want.',
  },
  {
    id: 'faq-remote-config',
    title: 'What is remote configuration?',
    content:
      'Remote configuration is the same idea applied to values rather than code paths: limits, endpoints, model parameters, prompts. Every change is versioned with a diff and a one-click rollback, so editing production config is a reversible act.',
  },
  {
    id: 'faq-rollouts',
    title: 'How do progressive rollouts and canary releases work?',
    content:
      'You give a flag a percentage, and ToggleFlow buckets users deterministically — the same user always lands on the same side, so nobody flickers between versions. For a canary release, narrow the audience to a segment first, then widen the percentage as your confidence grows.',
  },
  {
    id: 'faq-ab-testing',
    title: 'Can I run A/B tests with ToggleFlow?',
    content:
      'Yes, for the assignment half: percentage splits and segment targeting decide which variant each user gets, consistently everywhere the SDK runs. Measurement stays in your analytics tool — ToggleFlow does not compute statistical significance for you.',
  },
  {
    id: 'faq-availability',
    title: 'What happens if ToggleFlow goes down?',
    content:
      'Your app keeps working. The read path is a separate delivery plane on Cloudflare Workers and KV that keeps serving the last published ruleset even when the control plane is unavailable, and the server SDK evaluates from its own in-memory copy — so a flag check never waits on us.',
  },
  {
    id: 'faq-languages',
    title: 'Which languages and frameworks are supported?',
    content:
      'There is a typed JavaScript and TypeScript SDK, with a React adapter for the frontend and route middleware for Express and Fastify on the backend. Everything it does also goes over a plain REST API, so any language that can make an HTTP request can read flags today.',
  },
  {
    id: 'faq-pricing',
    title: 'Is ToggleFlow free to start?',
    content:
      'There is a free tier, and paid pricing is flat and predictable. It is a hosted SaaS, so there is nothing to run yourself: self-serve onboarding is designed to take about 15 minutes from signing up to flipping a real flag.',
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
  // The chip already names the state; the icon is the colour cue that lets the
  // eye scan the column, which is why it stays decorative.
  const StateIcon =
    state === 'on' ? CircleCheckIcon : state === 'off' ? CircleSlashIcon : CircleHalfIcon;
  const tone = state === 'on' ? 'text-on' : state === 'off' ? 'text-off' : 'text-rollout';
  return (
    <div className="border-border/60 grid grid-cols-[16px_1fr_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0">
      <StateIcon size={15} className={tone} />
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
    // The hairline is full-bleed on purpose — it is the page's section rule, not
    // part of the content box, so it runs edge to edge behind the container.
    <section id={id} className={`border-border/60 scroll-mt-24 border-t py-16 sm:py-20 ${GUTTER}`}>
      <div className={CONTAINER}>
        <p className="text-accent mb-2 text-[12.5px] font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
        <h2 className="mb-8 max-w-3xl text-[22px]">{title}</h2>
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

      <main id="main" className="scroll-mt-24">
        {/*
          The nav is fixed, so the hero owns the clearance under it: pt here is
          that clearance, not section rhythm. The island is ~64px tall
          below `sm` (44px touch controls) and ~52px from `sm` up (32px ones),
          both offset 16px from the top. 128/144px therefore leaves ~48px of air
          on a phone and ~76px on a desktop — it used to be 32px on the phone,
          i.e. the tighter gap sat under the *taller* bar.
        */}
        <section className={`pt-32 pb-16 sm:pt-36 sm:pb-20 ${GUTTER}`}>
          <div className={`${CONTAINER} grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]`}>
            <div>
              <p className="border-border bg-bg2 text-muted mb-5 inline-block rounded-full border px-3 py-1 text-[12px]">
                ToggleFlow · feature management platform
              </p>
              {/*
                Two beats, each on its own line at every width: the promise and
                the safety net. `block` spans rather than a <br> so the break is
                layout, not punctuation, and screen readers read one sentence at
                a time. The keyword phrase moved into the paragraph below — this
                page is the SPA's only crawlable surface, so it still has to say
                "feature flag and remote configuration" in prose.
              */}
              <h1 className="mb-4 text-[34px] leading-[1.06] tracking-[-0.02em] sm:text-[46px]">
                <span className="block">Ship faster.</span>
                <span className="block">Roll back instantly.</span>
              </h1>
              <p className="text-muted mb-8 max-w-xl text-[16px] leading-relaxed">
                ToggleFlow is the feature flag and remote configuration platform for your app: kill
                switches, progressive rollouts, targeting, and live config — changed from a
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
                {/* A live-environment dot: `text-on`, because a red one beside the
                    word "production" reads as an outage, which is not the story. */}
                <DotIcon size={13} className="text-on" />
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
            {FEATURES.map(({ icon: Icon, ...feature }) => (
              <li key={feature.title} className={CARD}>
                <span className={ICON_PLATE}>
                  <Icon size={18} />
                </span>
                <h3 className="mb-1">{feature.title}</h3>
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
              {/* ch-capped, not container-capped: the wider content box would run
                  this past 74 characters a line. Same trick as the footer blurb. */}
              <p className="text-muted mt-6 max-w-[68ch] text-[13px] leading-relaxed">
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
          <p className="text-muted mb-8 max-w-[68ch] text-[14px] leading-relaxed">
            One flag model covers all of it, and it is deliberately sharper for tool-heavy and
            AI-heavy apps: a flag carries its tool&apos;s route, owner, and model parameters rather
            than a bare boolean.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map(({ icon: Icon, ...useCase }) => (
              <li key={useCase.title} className={CARD}>
                <span className={ICON_PLATE}>
                  <Icon size={18} />
                </span>
                <h3 className="mb-1">{useCase.title}</h3>
                <p className="text-muted text-[13px]">{useCase.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="faq" eyebrow="FAQ" title="Feature flags and remote configuration, explained">
          {/* One accordion spanning the content box, rather than the old 3xl list
              that stopped 384px short of every other section's right edge. The
              answers stay readable because the panel caps its own measure. */}
          <Accordion items={FAQ} defaultOpenId="faq-feature-flags" />
        </Section>

        <section className={`border-border/60 border-t py-16 text-center sm:py-20 ${GUTTER}`}>
          <div className={CONTAINER}>
            <h2 className="mb-3 text-[22px]">Ship your next feature behind a flag</h2>
            <p className="text-muted mx-auto mb-7 max-w-lg leading-relaxed">
              Create an organization, add your first project, and flip a real flag in minutes — on
              the free tier.
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
          </div>
        </section>
      </main>

      <GuestFooter returnTo={returnTo} />
    </div>
  );
}
