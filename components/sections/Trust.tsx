import { Shield, Lock, MapPin, Sparkles } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Reveal } from '@/components/ui/Reveal';

const SIGNALS = [
  {
    icon: Shield,
    title: 'GDPR compliant',
    body: 'UK and EU data residency. Conversation logs encrypted at rest and in transit.',
  },
  {
    icon: MapPin,
    title: 'UK-based delivery',
    body: 'Built and supported in Birmingham. Founder-led, no offshore hand-off.',
  },
  {
    icon: Lock,
    title: 'Bank-grade encryption',
    body: 'Role-restricted access controls and signed DPAs available before any data exchange.',
  },
  {
    icon: Sparkles,
    title: 'No long lock-ins',
    body: 'Transparent pricing. Cancel any time. Results carry the relationship, not contracts.',
  },
];

export function Trust() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container>
        <Reveal>
          <div className="flex flex-col gap-5">
            <Eyebrow>Built For Trust</Eyebrow>
            <h2 className="heading-gradient max-w-3xl text-3xl font-medium tracking-tight text-balance sm:text-4xl md:text-5xl">
              Built in the UK, for ambitious practices.
            </h2>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNALS.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.title} delay={0.05 * i}>
                <div className="glass glass-hover flex h-full flex-col gap-4 rounded-2xl p-6">
                  <div className="grid size-10 place-items-center rounded-lg bg-pulse/10 text-pulse-bright ring-1 ring-pulse/25">
                    <Icon className="size-5" strokeWidth={1.6} aria-hidden />
                  </div>
                  <h3 className="text-base font-medium tracking-tight text-bone">
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-silver">{s.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
