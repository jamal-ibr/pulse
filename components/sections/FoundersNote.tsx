import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LinkedinLink } from '@/components/ui/LinkedinLink';
import { Reveal } from '@/components/ui/Reveal';

export function FoundersNote() {
  return (
    <section className="relative border-y border-line/60 py-24 sm:py-32">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <Reveal>
            <div className="flex flex-col gap-5">
              <Eyebrow>Founder Note</Eyebrow>
              <p className="font-mono text-eyebrow uppercase text-silver/60">Jamal Ibrahim</p>
              <p className="text-sm text-silver">
                Senior Solutions Architect at a Big 4 professional services firm,
                building automation and analytics systems for enterprise audit
                engagements. Founder of Pulse, building revenue infrastructure
                for service practices that take revenue seriously.
              </p>
              <LinkedinLink />
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex flex-col gap-7">
              <p className="text-2xl font-medium leading-snug tracking-tight text-bone text-balance sm:text-3xl">
                &ldquo;Most &lsquo;AI for healthcare&rsquo; is a SaaS dashboard with a
                chatbot bolted on. Pulse is built the other way around. By an
                operator, for operators. Outcomes first, software second.&rdquo;
              </p>
              <Link
                href="/about"
                className="group inline-flex items-center gap-2 self-start font-mono text-eyebrow uppercase text-pulse-bright transition-opacity hover:opacity-80"
              >
                Read the full story
                <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
