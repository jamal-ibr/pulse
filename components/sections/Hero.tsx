'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { CalendlyTrigger } from '@/components/ui/CalendlyTrigger';
import { Container } from '@/components/ui/Container';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PulseLine } from '@/components/ui/PulseLine';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] } },
};

export function Hero() {
  const reduced = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden bg-mesh-hero pt-36 sm:pt-44 lg:pt-52">
      <div className="absolute inset-0 grid-faint opacity-70" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-pulse/20 blur-[120px]" aria-hidden />

      <Container className="relative">
        <motion.div
          variants={reduced ? undefined : containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 items-end gap-16 lg:grid-cols-[1.55fr_1fr] lg:gap-12"
        >
          <div className="flex flex-col gap-8 lg:gap-10">
            <motion.div variants={itemVariants}>
              <Eyebrow>Pulse · Revenue infrastructure for practices</Eyebrow>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="heading-gradient text-hero font-medium tracking-tight text-balance"
            >
              Revenue infrastructure for practices that take{' '}
              <span className="accent-gradient italic font-medium">growth seriously.</span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="max-w-xl text-lg leading-relaxed text-silver text-pretty sm:text-xl"
            >
              AI-powered systems that capture every enquiry, reactivate dormant leads, and
              generate predictable new business. Built for service practices ready to
              scale.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-4 pt-2">
              <CalendlyTrigger size="lg">Book a discovery call</CalendlyTrigger>
              <Button as="link" href="#how-it-works" size="lg" variant="secondary">
                See how it works
              </Button>
            </motion.div>
          </div>

          <motion.aside
            variants={itemVariants}
            className="relative flex flex-col gap-6 self-stretch lg:self-end"
          >
            <div className="gradient-border relative flex flex-col gap-5 overflow-hidden rounded-2xl p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-eyebrow uppercase text-pulse-bright/80">
                  Example flow
                </span>
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-pulse-bright" />
                  <span className="absolute inset-0 animate-ping rounded-full bg-pulse-bright/60" />
                </span>
              </div>

              <div className="font-mono text-xs leading-relaxed text-silver">
                <p>
                  <span className="text-pulse-bright">→</span> Inbound · 03:14 missed call
                </p>
                <p className="mt-2">
                  <span className="text-pulse-bright">→</span> AI receptionist engaged
                </p>
                <p className="mt-2">
                  <span className="text-pulse-bright">→</span> Caller qualified ·{' '}
                  <span className="text-bone">Invisalign enquiry</span>
                </p>
                <p className="mt-2">
                  <span className="text-pulse-bright">→</span> Consultation booked ·{' '}
                  <span className="text-bone">Tue 11:30</span>
                </p>
                <p className="mt-2 text-bone/90">
                  <span className="text-pulse-bright">✓</span> Confirmed · CRM synced
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-line/60 pt-5">
                <div>
                  <p className="font-mono text-eyebrow uppercase text-silver/60">
                    Response
                  </p>
                  <p className="mt-1.5 text-2xl font-medium tracking-tight text-bone">
                    &lt; 60s
                  </p>
                </div>
                <div>
                  <p className="font-mono text-eyebrow uppercase text-silver/60">
                    Recovered
                  </p>
                  <p className="mt-1.5 text-2xl font-medium tracking-tight text-bone">
                    £4,200
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-pulse/20 blur-3xl" />
            </div>
          </motion.aside>
        </motion.div>
      </Container>

      <div className="mt-24 sm:mt-32">
        <PulseLine variant="bright" className="h-28" />
      </div>
    </section>
  );
}
