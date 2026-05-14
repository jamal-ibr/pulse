import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LinkedinLink } from '@/components/ui/LinkedinLink';
import { PageHero } from '@/components/ui/PageHero';
import { Reveal } from '@/components/ui/Reveal';
import { FinalCTA } from '@/components/sections/FinalCTA';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Built by an operator, not a vendor. Pulse exists because most AI-for-healthcare is a SaaS dashboard with a chatbot bolted on.',
  alternates: { canonical: '/about' },
};

const VALUES = [
  {
    title: 'Results over hype',
    body: 'Success is recovered enquiries, booked consultations, and reactivated revenue. Not "AI transformation" decks.',
  },
  {
    title: 'Built for outcomes',
    body: 'If a system does not move a number that shows up in your accounts, it does not ship.',
  },
  {
    title: 'Founder-led',
    body: 'You work with me directly. The same person scopes, builds, and stays close once the system is live.',
  },
  {
    title: 'Transparent pricing',
    body: 'Flat fees scoped to your practice. No per-conversation gotchas. No long lock-ins. Cancel any time.',
  },
];

const REASONS = [
  'Direct founder access on every project',
  'Healthcare-specific, not generic SaaS',
  'UK-based delivery, GDPR by default',
  'No long-term lock-in contracts',
  'Operator-built, shaped by enterprise AI rollouts',
  'One person scopes, builds, and supports the system',
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title={
          <>
            Built by an operator,{' '}
            <span className="accent-gradient italic">not a vendor.</span>
          </>
        }
        description="Most AI for healthcare is a SaaS dashboard with a chatbot bolted on. Pulse is built the other way around. Operational discipline first, software second."
      />

      <section className="relative py-24 sm:py-28">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
            <Reveal>
              <div className="flex flex-col gap-5 lg:sticky lg:top-32">
                <Eyebrow>Founder Story</Eyebrow>
                <p className="font-mono text-eyebrow uppercase text-silver/60">
                  Jamal Ibrahim
                </p>
                <p className="text-sm text-silver">
                  Senior Solutions Architect at a Big 4 professional services
                  firm, building automation and analytics systems for enterprise
                  audit engagements. Founder of Pulse, building revenue
                  infrastructure for service practices that take revenue
                  seriously.
                </p>
                <LinkedinLink />
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="flex flex-col gap-7 text-[1.05rem] leading-relaxed text-silver text-pretty">
                <p>
                  I started Pulse because the practice owners I knew kept describing
                  the same problem. Enquiries arriving in the gaps (evenings,
                  weekends, lunch breaks) going unanswered, then quietly costing
                  them thousands in lost bookings every month.
                </p>
                <p>
                  Inside enterprise consulting, I had been designing AI systems
                  for organisations with the budget and patience for a year-long
                  rollout. The pattern was always the same: serious operational
                  discipline up front, software second. The technology was almost
                  never the hard part.
                </p>
                <p>
                  Most of what calls itself "AI for healthcare" is the inverse.
                  A SaaS dashboard with a chatbot stapled on, sold by people who
                  have never run a reception desk. Pulse exists to fix that.
                </p>
                <p className="text-bone">
                  Pulse is built by an operator, for operators. We get the system
                  live, we make it earn, and we stay close enough to the practice
                  that it keeps getting better.
                </p>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="relative border-y border-line/60 bg-mesh-soft py-24 sm:py-28">
        <Container>
          <Reveal>
            <div className="flex flex-col gap-5">
              <Eyebrow>Values</Eyebrow>
              <h2 className="heading-gradient max-w-3xl text-3xl font-medium tracking-tight text-balance sm:text-4xl md:text-5xl">
                What we hold ourselves to.
              </h2>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line/60 bg-line/60 sm:grid-cols-2">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={0.05 * i}>
                <div className="flex h-full flex-col gap-4 bg-ink p-8 sm:p-10">
                  <span className="font-mono text-eyebrow uppercase text-pulse-bright/80">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-xl font-medium tracking-tight text-bone sm:text-2xl">
                    {v.title}
                  </h3>
                  <p className="text-[0.97rem] leading-relaxed text-silver text-pretty">
                    {v.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="relative py-24 sm:py-28">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
            <Reveal>
              <div className="flex flex-col gap-5">
                <Eyebrow>Why Work With Us</Eyebrow>
                <h2 className="heading-gradient text-3xl font-medium tracking-tight text-balance sm:text-4xl md:text-5xl">
                  Six reasons practices choose Pulse.
                </h2>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <ul className="flex flex-col divide-y divide-line/70 border-y border-line/70">
                {REASONS.map((r, i) => (
                  <li key={r} className="flex items-start gap-5 py-5">
                    <span className="font-mono text-xs text-silver/60 pt-1">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pulse/10 text-pulse-bright ring-1 ring-pulse/25 mt-0.5">
                      <Check className="size-3" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-[1rem] leading-relaxed text-bone/90">
                      {r}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Container>
      </section>

      <FinalCTA />
    </>
  );
}
