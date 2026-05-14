'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  label: string;
  className?: string;
  index?: number;
};

export function StatCard({ value, label, className, index = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.6, delay: 0.08 * index, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'gradient-border glass-hover relative overflow-hidden rounded-2xl p-5 sm:p-6',
        className,
      )}
    >
      <div className="relative z-10 flex flex-col gap-2">
        <p className="text-2xl font-medium leading-tight tracking-tight text-bone text-balance sm:text-[1.75rem]">
          {value}
        </p>
        <p className="text-[0.92rem] leading-snug text-silver text-pretty">{label}</p>
      </div>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-pulse/10 blur-3xl" />
    </motion.div>
  );
}
