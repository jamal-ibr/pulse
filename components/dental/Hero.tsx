'use client';

import { siteConfig } from '@/data/config';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white pt-28 pb-16 lg:pt-32 lg:pb-24">
      {/* Subtle background pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #0D9488 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="d-container relative">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Copy */}
          <div className="space-y-7">
            <span className="d-badge">For Cosmetic Dental Practices</span>

            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-textDark sm:text-5xl lg:text-[3.25rem]">
              Never Miss Another{' '}
              <span className="text-primary">£5,000</span>{' '}
              Invisalign Lead
            </h1>

            <p className="text-lg leading-relaxed text-textMuted sm:text-xl">
              AI receptionist answers calls 24/7, qualifies leads, and books
              consultations while you sleep. Stop losing £40k/year to voicemail.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#demo"
                className="d-btn-primary text-base py-4 px-7"
              >
                Watch 2-Min Demo
              </a>
              <a
                href={siteConfig.calendlyUrl}
                target="_blank"
                rel="noreferrer"
                className="d-btn-secondary text-base py-4 px-7"
              >
                Book Demo Call
              </a>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-5 pt-2">
              {[
                '24/7 Coverage',
                'No Long Contracts',
                'GDPR Compliant',
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-sm text-textMuted">
                  <svg className="h-4 w-4 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Phone mockup with conversation */}
          <div className="flex justify-center lg:justify-end">
            <div className="animate-float relative">
              {/* Phone frame */}
              <div className="relative mx-auto w-[260px] rounded-[2.5rem] border-[6px] border-textDark bg-textDark shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
                {/* Notch */}
                <div className="absolute left-1/2 top-3 h-6 w-24 -translate-x-1/2 rounded-full bg-textDark" />

                {/* Screen */}
                <div className="overflow-hidden rounded-[2rem] bg-gray-50">
                  {/* Status bar */}
                  <div className="flex items-center justify-between bg-white px-5 pt-8 pb-2 text-xs font-medium text-textDark">
                    <span>9:14 PM</span>
                    <span className="flex gap-1">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                    </span>
                  </div>

                  {/* App header */}
                  <div className="bg-primary px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                        {/* Live dot */}
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-primary" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-white">Pulse AI Receptionist</p>
                        <p className="text-[9px] text-white/70">Active • Answering calls</p>
                      </div>
                    </div>
                  </div>

                  {/* Chat messages */}
                  <div className="space-y-2.5 bg-gray-50 px-3 py-4 text-[11px]">
                    {/* AI message */}
                    <div className="flex gap-2">
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-[8px] font-bold">P</div>
                      <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm max-w-[80%]">
                        <p className="text-textBody leading-relaxed">Hello, thanks for calling SmileFirst. How can I help you today?</p>
                      </div>
                    </div>

                    {/* Patient */}
                    <div className="flex justify-end">
                      <div className="rounded-2xl rounded-tr-sm bg-primary px-3 py-2 max-w-[80%]">
                        <p className="text-white leading-relaxed">Hi, I&rsquo;m interested in Invisalign. What&rsquo;s the cost?</p>
                      </div>
                    </div>

                    {/* AI */}
                    <div className="flex gap-2">
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-[8px] font-bold">P</div>
                      <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm max-w-[80%]">
                        <p className="text-textBody leading-relaxed">Great choice! Invisalign typically ranges £2,800–£5,500. Can I book you a free consultation?</p>
                      </div>
                    </div>

                    {/* Patient */}
                    <div className="flex justify-end">
                      <div className="rounded-2xl rounded-tr-sm bg-primary px-3 py-2 max-w-[80%]">
                        <p className="text-white leading-relaxed">Yes please!</p>
                      </div>
                    </div>

                    {/* Typing indicator */}
                    <div className="flex gap-2 items-end">
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-[8px] font-bold">P</div>
                      <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                        <div className="flex gap-1">
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-textLight [animation-delay:0ms]" />
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-textLight [animation-delay:150ms]" />
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-textLight [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notification banner */}
                  <div className="bg-green-50 border-t border-green-100 px-3 py-2.5 text-[10px]">
                    <p className="font-semibold text-green-700">Lead captured & sent to your team</p>
                    <p className="text-green-600">Sarah M. • Invisalign • Budget: £3-4k</p>
                  </div>
                </div>
              </div>

              {/* Floating badge: after-hours */}
              <div className="absolute -right-6 top-12 rounded-xl bg-white px-3 py-2 shadow-cardHover text-xs font-semibold text-textDark">
                🕘 9:14 PM
                <p className="text-[10px] font-normal text-textMuted">After hours — covered</p>
              </div>

              {/* Floating badge: revenue */}
              <div className="absolute -left-8 bottom-16 rounded-xl bg-primary px-3 py-2 shadow-cardHover text-white text-xs font-semibold">
                £4,200 lead
                <p className="text-[10px] font-normal text-primaryLight">Invisalign consultation booked</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
