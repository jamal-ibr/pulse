export const SITE = {
  name: 'Pulse',
  legalName: 'Pulse AI Technologies Ltd',
  domain: 'workwithpulse.ai',
  tagline: "Your practice's new heartbeat",
  email: 'hello@workwithpulse.ai',
  bookingUrl: '/contact',
  calendlyUrl: 'https://calendly.com/jamal-ibrx/30min',
  description:
    'AI-powered systems that capture every enquiry, reactivate dormant leads, and generate predictable new business. Built for service-based practices.',
  url: 'https://workwithpulse.ai',
} as const;

export const NAV = [
  { href: '/services', label: 'Services' },
  { href: '/industries', label: 'Industries' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export type Pillar = {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  bestFor: string;
  icon: 'phone' | 'database' | 'trending';
};

export const PILLARS: Pillar[] = [
  {
    id: 'never-miss-a-lead',
    number: '01',
    eyebrow: 'AI Receptionist',
    title: 'Never miss a lead',
    description:
      'A trained AI receptionist answers every call and every enquiry, 24/7, including evenings and weekends. It qualifies, books, and routes intelligently. Your team only handles what matters.',
    bullets: [
      'Handles inbound calls and web enquiries 24/7',
      'Books appointments directly into your CRM or calendar',
      'Qualifies callers and escalates urgent cases instantly',
      'Recovers £2–5k+ per month in bookings that would have been missed',
    ],
    bestFor: 'Practices losing enquiries to voicemail, queues, or after-hours silence.',
    icon: 'phone',
  },
  {
    id: 'reactivate-your-database',
    number: '02',
    eyebrow: 'Lead Reactivation',
    title: 'Reactivate your database',
    description:
      'Your most valuable customers are already in your database. Pulse runs intelligent re-engagement campaigns across email and SMS, turning dormant lists into recurring revenue without you lifting a finger.',
    bullets: [
      'Segmented sequences for cold, lapsed and high-value leads',
      'AI-written copy tailored to your practice voice',
      'Live nurture flows that respond to replies in real time',
      'Maximum lifetime value from customers you already paid to acquire',
    ],
    bestFor: 'Practices sitting on hundreds or thousands of leads they have never followed up properly.',
    icon: 'database',
  },
  {
    id: 'generate-new-leads',
    number: '03',
    eyebrow: 'Acquisition Engine',
    title: 'Generate new leads consistently',
    description:
      'AI-optimised Meta and Google ads, high-converting landing pages, and instant chat. Engineered as one acquisition system, not a stack of disconnected tools.',
    bullets: [
      'Daily-optimised paid campaigns on Meta and Google',
      'Conversion-tuned landing pages with embedded AI chat',
      'Automated funnels that capture, qualify and convert',
      'A predictable pipeline of new appointments each month',
    ],
    bestFor: 'Practices ready to scale beyond word-of-mouth without hiring an in-house marketing team.',
    icon: 'trending',
  },
];

export const STATS = [
  {
    value: 'Thousands lost monthly',
    label: 'Estimated revenue leak from missed enquiries at a typical practice',
  },
  {
    value: 'Most arrive after hours',
    label: 'Enquiries routinely land outside reception hours',
  },
  {
    value: 'Minutes, not hours',
    label: 'Industry research shows leads cool fast without rapid response',
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Discovery call',
    description: 'A 30-minute call to map your practice, your team, and the gaps where revenue is leaking out.',
  },
  {
    step: '02',
    title: 'Custom system design',
    description: 'A system tailored to your workflow, your integrations, and your tone of voice. Not a template.',
  },
  {
    step: '03',
    title: 'Implementation in 2 weeks',
    description: 'Built, tested, and live with minimal disruption. Your team learns exactly what to monitor.',
  },
  {
    step: '04',
    title: 'Ongoing optimisation',
    description: 'Monthly reviews, prompt tuning, and campaign optimisation. The system gets sharper every week.',
  },
] as const;

export type Industry = {
  slug: string;
  name: string;
  shortLabel: string;
  blurb: string;
  pains: string[];
  wins: string[];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: 'dental-practices',
    name: 'Dental practices',
    shortLabel: 'Dental',
    blurb:
      'High-value cosmetic and Invisalign enquiries are the easiest to lose and the most expensive to miss. Pulse captures and qualifies every one of them.',
    pains: [
      'Invisalign and cosmetic enquiries lost to voicemail',
      'After-hours emergency callers ringing competitors instead',
      'Consultation slots sitting empty while leads sit unfollowed',
      'Reception teams swamped during morning rush',
    ],
    wins: [
      'Instant qualification of cosmetic vs NHS enquiries',
      '24/7 emergency triage routed to the right on-call',
      'Automated consultation booking with deposit links',
      'Recall and reactivation flows for lapsed patients',
    ],
  },
  {
    slug: 'veterinary-clinics',
    name: 'Veterinary clinics',
    shortLabel: 'Veterinary',
    blurb:
      'Out-of-hours emergencies and routine bookings shouldn\'t compete for the same phone line. Pulse separates urgent from routine, instantly.',
    pains: [
      'Out-of-hours emergency calls going unanswered',
      'Routine bookings clogging the line during surgery hours',
      'Vaccination and dental reminders never going out',
      'Lost revenue from unbooked follow-ups',
    ],
    wins: [
      'Triage logic that escalates emergencies to on-call vets',
      'Self-serve booking for routine appointments',
      'Automated reminder sequences for recall patients',
      'Faster check-in with pre-collected case context',
    ],
  },
  {
    slug: 'aesthetics-clinics',
    name: 'Aesthetics & cosmetic clinics',
    shortLabel: 'Aesthetics',
    blurb:
      'High-intent treatment enquiries cool fast. Pulse responds in under a minute and qualifies before your team gets involved.',
    pains: [
      'Botox and filler enquiries lost to slow follow-up',
      'Consultation no-shows from weak booking flows',
      'High ad spend with low conversion to consultation',
      'No re-engagement of past treatment clients',
    ],
    wins: [
      'Instant response to high-intent treatment enquiries',
      'Deposit-secured consultation booking',
      'Automated post-treatment follow-up and rebooking',
      'Lookalike audience generation from your best clients',
    ],
  },
  {
    slug: 'service-practices',
    name: 'Other service-based practices',
    shortLabel: 'Service-based',
    blurb:
      'High-volume inbound services share the same enquiry economics. Physio, legal, bespoke trades, more. Get in touch about your specific industry.',
    pains: [
      'Phone-led businesses losing revenue to missed calls',
      'No system for warm follow-up across channels',
      'Marketing spend that does not translate into bookings',
      'Owner stuck inside reception logistics',
    ],
    wins: [
      'Bespoke AI receptionist tuned to your services',
      'Cross-channel nurture flows in your tone of voice',
      'A unified pipeline for all inbound enquiries',
      'Owner-time freed for higher-leverage work',
    ],
  },
];

export const TRUST_SIGNALS = [
  { label: 'GDPR compliant', icon: 'shield' as const },
  { label: 'UK-based support', icon: 'flag' as const },
  { label: 'Bank-grade encryption', icon: 'lock' as const },
  { label: 'Founder-led delivery', icon: 'sparkles' as const },
] as const;

export const FAQS = [
  {
    q: 'Will AI replace my reception team?',
    a: 'No. Pulse removes the repetitive load: routine enquiries, standard appointments, after-hours volume. Your reception team can then focus on the conversations that genuinely need a human. Most practices keep their team and grow capacity instead of cutting headcount.',
  },
  {
    q: 'How does the AI handle complex patient questions?',
    a: 'It is trained on your specific services, FAQs, pricing structure, and tone of voice. For anything outside its scope (clinical advice, treatment plans, sensitive escalations), it routes the conversation to a human on your team with full context attached. It never invents an answer.',
  },
  {
    q: 'What is the implementation process?',
    a: 'A discovery call, a written system design, then a two-week build window. We integrate with your existing CRM, calendar, and phone system, train the AI on your practice, and run a quiet phase before going fully live. Founder-led from start to finish.',
  },
  {
    q: 'How long until I see ROI?',
    a: 'Most practices recover the cost of the system within the first 30 days from missed-enquiry recovery alone. Reactivation revenue and new lead generation compound from month two onwards.',
  },
  {
    q: 'What happens if a patient prefers to speak to a human?',
    a: 'They always can. The AI offers a human handover at any point. Certain conversation types (emergencies, complex cases, complaints) are routed to a human by default. Patient choice is never overridden.',
  },
  {
    q: 'Is patient data secure?',
    a: 'Yes. We operate to GDPR standards with bank-grade encryption in transit and at rest. Conversation logs are stored in UK or EU regions, and access is role-restricted. We can sign a DPA before any data exchange.',
  },
  {
    q: 'What is included in pricing?',
    a: 'Implementation is a one-off fee scoped to your practice size. Ongoing support is a flat monthly retainer covering hosting, optimisation, prompt tuning and reporting. No per-conversation or per-lead fees.',
  },
  {
    q: 'Can I customise how the AI responds?',
    a: 'Yes. Voice, vocabulary, pricing rules, escalation paths, even objection handling. The AI is a reflection of your practice, not a generic bot. You approve every response template before it goes live.',
  },
];
