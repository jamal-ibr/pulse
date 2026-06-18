// Seed script. Idempotent: wipes and re-seeds all tables with realistic
// data relative to today, so every page renders meaningfully on first run.
// Run with: npm run db:seed

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "../src/db/schema";

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "jamal-os.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

const iso = (daysFromToday: number, time?: string) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const date = d.toISOString().slice(0, 10);
  return time ? `${date}T${time}:00` : date;
};

function wipe() {
  const tables = [
    "user_profile", "settings", "audit_logs", "permission_rules", "ai_interactions",
    "pillars", "pillar_scores", "level_snapshots",
    "habits", "habit_logs", "sleep_logs", "weight_logs", "body_metrics",
    "training_sessions", "injury_notes",
    "projects", "tasks", "task_events", "project_activity",
    "pipeline", "pipeline_events",
    "contacts", "contact_interactions",
    "spending", "finance_goals", "csv_imports",
    "reading_list", "reading_logs", "notes",
    "journal", "memory_items",
    "email_messages", "email_drafts", "calendar_events", "connector_accounts",
    "weekly_reviews", "build_queue",
  ];
  for (const table of tables) {
    sqlite.prepare(`DELETE FROM ${table}`).run();
    sqlite.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
  }
}

async function seed() {
  wipe();

  await db.insert(schema.userProfile).values({
    name: "Jamal",
    location: "Birmingham, UK",
    summary:
      "22. EY Birmingham degree apprentice in assurance data analytics. Founding Pulse AI Technologies (AI enquiry handling for dental and vet practices). Five pillars: spiritual grounding, discipline of body, intellectual depth, building systems for impact, character and leadership.",
  });

  await db.insert(schema.settings).values([
    { key: "data_mode", value: "local_mock" },
    { key: "theme", value: "dark" },
  ]);

  await db.insert(schema.permissionRules).values([
    { scope: "gmail.read", allowed: false, requiresConfirmation: false, note: "Read-only Gmail. Opt-in. Never request send scope." },
    { scope: "calendar.read", allowed: false, requiresConfirmation: false, note: "Google Calendar read. Opt-in." },
    { scope: "calendar.write", allowed: false, requiresConfirmation: true, note: "External calendar writes always require click confirmation." },
    { scope: "ai.anthropic", allowed: true, requiresConfirmation: false, note: "Redaction applied before every call. Sensitive memory never sent unless explicitly included." },
  ]);

  await db.insert(schema.pillars).values([
    { key: "faith", name: "Faith", description: "Spiritual grounding. Five daily salah, fasting, Islamic study.", weight: 1.5, sortOrder: 1 },
    { key: "body", name: "Body", description: "Discipline of body. Cut to 82kg, protein, cardio within injury limits.", weight: 1.2, sortOrder: 2 },
    { key: "mind", name: "Mind", description: "Intellectual depth. AI/ML curriculum, reading, languages.", weight: 1.0, sortOrder: 3 },
    { key: "career", name: "Career", description: "EY performance, BPP degree, visible AI contributions.", weight: 1.0, sortOrder: 4 },
    { key: "wealth", name: "Wealth", description: "Pulse AI revenue, financial discipline, no spending leaks.", weight: 0.8, sortOrder: 5 },
    { key: "character", name: "Character", description: "Calm, disciplined, reliable, honest, useful, hard to shake.", weight: 1.3, sortOrder: 6 },
    { key: "systems", name: "Systems and Legacy", description: "Build institutions and platforms that reduce chaos and increase opportunity.", weight: 1.0, sortOrder: 7 },
  ]);

  await db.insert(schema.habits).values([
    { key: "salah", name: "Salah", pillarKey: "faith", targetDescription: "5 per day" },
    { key: "protein", name: "Protein", pillarKey: "body", targetDescription: "170g+" },
    { key: "kcal", name: "Calories", pillarKey: "body", targetDescription: "1700 to 2000 kcal" },
    { key: "training", name: "Training", pillarKey: "body", targetDescription: "Stairmaster, skipping, upper strength, mobility" },
    { key: "phone", name: "Phone hours", pillarKey: "mind", targetDescription: "Under 4 hours" },
    { key: "deep_work", name: "Deep work", pillarKey: "mind", targetDescription: "2 blocks per day" },
    { key: "reading", name: "Reading", pillarKey: "mind", targetDescription: "10+ pages" },
    { key: "sleep", name: "Sleep", pillarKey: "body", targetDescription: "7+ hours, lights out 23:00" },
    { key: "fast", name: "Mon/Thu fast", pillarKey: "faith", targetDescription: "Voluntary fasts" },
    { key: "water", name: "Water", pillarKey: "body", targetDescription: "2.5L+" },
  ]);

  // Habit logs: last 8 days, honest mixed compliance.
  const habitDays = [
    { d: -8, salah: 5, protein: 142, kcal: 2150, training: "strength", phone: 6.5, deep: 1, pages: 0, sleepH: 6.2, lights: "00:15", wake: "06:45", weight: 92.4 },
    { d: -7, salah: 4, protein: 165, kcal: 1890, training: "stairmaster", phone: 5.1, deep: 2, pages: 12, sleepH: 7.1, lights: "23:20", wake: "06:50", weight: 92.3 },
    { d: -6, salah: 5, protein: 178, kcal: 1820, training: "skipping", phone: 3.8, deep: 2, pages: 8, sleepH: 7.4, lights: "22:55", wake: "06:30", weight: 92.1 },
    { d: -5, salah: 5, protein: 131, kcal: 2240, training: "rest", phone: 7.2, deep: 0, pages: 0, sleepH: 6.0, lights: "00:40", wake: "07:00", weight: 92.2 },
    { d: -4, salah: 5, protein: 172, kcal: 1950, training: "strength", phone: 4.5, deep: 1, pages: 15, sleepH: 6.8, lights: "23:35", wake: "06:40", weight: 92.0 },
    { d: -3, salah: 4, protein: 155, kcal: 1880, training: "stairmaster", phone: 5.8, deep: 2, pages: 0, sleepH: 7.2, lights: "23:10", wake: "06:35", weight: 91.9 },
    { d: -2, salah: 5, protein: 181, kcal: 1790, training: "mobility", phone: 3.2, deep: 2, pages: 20, sleepH: 7.5, lights: "22:50", wake: "06:30", weight: 91.8 },
    { d: -1, salah: 5, protein: 148, kcal: 2080, training: "strength", phone: 5.5, deep: 1, pages: 6, sleepH: 6.5, lights: "23:50", wake: "06:45", weight: 91.9 },
  ];
  for (const day of habitDays) {
    const date = iso(day.d);
    const weekday = new Date(date).getDay();
    await db.insert(schema.habitLogs).values({
      date,
      salahCount: day.salah,
      proteinG: day.protein,
      kcal: day.kcal,
      trainingSession: day.training,
      monThuFast: weekday === 1 || weekday === 4 ? day.salah === 5 : null,
      phoneScreenHours: day.phone,
      deepWorkBlocks: day.deep,
      pagesRead: day.pages,
      waterLitres: 2.0,
    });
    await db.insert(schema.sleepLogs).values({
      date,
      sleepHours: day.sleepH,
      lightsOutTime: day.lights,
      wakeTime: day.wake,
      sleepTime: day.lights,
    });
    await db.insert(schema.weightLogs).values({ date, weightKg: day.weight });
    if (day.training !== "rest") {
      await db.insert(schema.trainingSessions).values({
        date,
        type: day.training,
        durationMin: day.training === "strength" ? 55 : 30,
        intensity: "moderate",
      });
    }
  }

  await db.insert(schema.injuryNotes).values({
    date: iso(-20),
    area: "Lower limb",
    status: "pending_clearance",
    note: "Running gated behind MRI or orthopaedic clearance. Interim cardio: stairmaster and weighted skipping. Strength upper-body only.",
  });

  // Projects. Every project has an explicit next action.
  const projectRows = [
    { name: "Pulse AI outreach", pillarKey: "systems", nextAction: "Send first 5 outreach messages to dental practices from the lead list", lastActivityAt: iso(-4), description: "Sole business focus. AI enquiry handling for dental and vet practices. £2,500 setup plus £500 to £1,200 per month. Voice agent built. First outreach imminent." },
    { name: "EY SSE dashboard P-72933", pillarKey: "career", nextAction: "Confirm data refresh schedule with the engagement team", lastActivityAt: iso(-2), description: "Visible AI contribution at EY. Eliminate rework flags." },
    { name: "BPP degree", pillarKey: "career", nextAction: "Check next assignment deadline and block study time", lastActivityAt: iso(-3), description: "BSc through BPP. Around 16 months to completion." },
    { name: "AI and ML curriculum", pillarKey: "mind", nextAction: "Complete next Python/SQL module and log 1 deep work block", lastActivityAt: iso(-1), description: "17-month curriculum: Python, SQL, ML, agentic AI, AI-900, AI-102, Databricks, MLOps." },
    { name: "Hybrid athlete transformation", pillarKey: "body", nextAction: "Log protein at every meal today, hit 170g", lastActivityAt: iso(-1), description: "Phase 1 cut 92kg to 82kg. Stockholm Half Marathon late August 2026, gated behind clearance." },
    { name: "Financial discipline", pillarKey: "wealth", nextAction: "Import this week's transactions and review takeaway count", lastActivityAt: iso(-6), description: "Kill the takeaway habit. 149 orders in 174 days is the line never to return to." },
    { name: "Reading and intellectual depth", pillarKey: "mind", nextAction: "Read 10 pages of Deep Work tonight before phone", lastActivityAt: iso(-2), description: "Reading list plus synthesis. Rebuild attention." },
    { name: "Jamal OS", pillarKey: "systems", nextAction: "Use the system daily for one week before adding features", lastActivityAt: iso(0), description: "This system. Building it must never displace Pulse outreach." },
  ];
  for (const project of projectRows) {
    await db.insert(schema.projects).values(project);
  }

  // Tasks. Scariness is required, 1 to 5.
  const taskRows = [
    { title: "Send first 5 Pulse AI outreach messages", pillarKey: "systems", projectId: 1, dueDate: iso(0), status: "todo", energy: "deep", scariness: 5, deferCount: 2, nextAction: "Open lead list, pick 5, send before 10:00" },
    { title: "Build Pulse AI lead list of 25 practices", pillarKey: "systems", projectId: 1, dueDate: iso(1), status: "in_progress", energy: "shallow", scariness: 2, deferCount: 0, nextAction: "Add 10 more vet practices with owner names" },
    { title: "Review SSE dashboard next action", pillarKey: "career", projectId: 2, dueDate: iso(0), status: "todo", energy: "deep", scariness: 2, deferCount: 0 },
    { title: "Log protein today", pillarKey: "body", projectId: 5, dueDate: iso(0), status: "todo", energy: "shallow", scariness: 1, deferCount: 0 },
    { title: "Update spending", pillarKey: "wealth", projectId: 6, dueDate: iso(0), status: "todo", energy: "shallow", scariness: 1, deferCount: 1 },
    { title: "Read 10 pages", pillarKey: "mind", projectId: 7, dueDate: iso(0), status: "todo", energy: "shallow", scariness: 1, deferCount: 0 },
    { title: "Complete AI and ML curriculum study block", pillarKey: "mind", projectId: 4, dueDate: iso(1), status: "todo", energy: "deep", scariness: 2, deferCount: 0 },
    { title: "Review BPP deadline", pillarKey: "career", projectId: 3, dueDate: iso(-1), status: "todo", energy: "shallow", scariness: 2, deferCount: 1 },
    { title: "Follow up with Abhi Chatterjee", pillarKey: "character", projectId: null, dueDate: iso(-2), status: "todo", energy: "shallow", scariness: 3, deferCount: 2 },
    { title: "Prepare weekly review", pillarKey: "systems", projectId: 8, dueDate: iso(3), status: "todo", energy: "deep", scariness: 2, deferCount: 0 },
  ];
  for (const task of taskRows) {
    await db.insert(schema.tasks).values(task);
  }
  await db.insert(schema.taskEvents).values([
    { taskId: 1, event: "deferred", detail: "Moved to tomorrow, twice" },
    { taskId: 9, event: "deferred", detail: "Pushed back twice" },
  ]);

  // Pipeline: 8 practices, only 3 contacted so the hard rule triggers.
  const pipelineRows = [
    { practiceName: "Birmingham Smile Dental", vertical: "dental", stage: "contacted", lastTouch: iso(-6), nextFollowUp: iso(-2), notes: "Spoke to reception, owner is Dr Patel. Send voice agent demo link.", source: "Google Maps" },
    { practiceName: "Solihull Dental Care", vertical: "dental", stage: "contacted", lastTouch: iso(-8), nextFollowUp: iso(-3), notes: "Email sent, no reply yet. Follow up by phone.", source: "Lead list" },
    { practiceName: "Harborne Vets", vertical: "vet", stage: "contacted", lastTouch: iso(-4), nextFollowUp: iso(1), notes: "Practice manager interested in out-of-hours handling.", source: "Referral" },
    { practiceName: "Edgbaston Dental Studio", vertical: "dental", stage: "identified", lastTouch: null, nextFollowUp: null, notes: "High review volume, likely busy phones.", source: "Google Maps" },
    { practiceName: "Kings Heath Veterinary Clinic", vertical: "vet", stage: "identified", lastTouch: null, nextFollowUp: null, notes: "Independent, 2 sites.", source: "Lead list" },
    { practiceName: "Moseley Dental Practice", vertical: "dental", stage: "identified", lastTouch: null, nextFollowUp: null, notes: "", source: "Lead list" },
    { practiceName: "Sutton Coldfield Vets4Pets", vertical: "vet", stage: "identified", lastTouch: null, nextFollowUp: null, notes: "Franchise, may need head office sign-off.", source: "Google Maps" },
    { practiceName: "Quinton Family Dental", vertical: "dental", stage: "replied", lastTouch: iso(-3), nextFollowUp: iso(0), notes: "Replied asking for pricing. Send proposal outline today.", source: "Lead list" },
  ];
  for (const row of pipelineRows) {
    await db.insert(schema.pipeline).values(row);
  }
  await db.insert(schema.pipelineEvents).values([
    { pipelineId: 1, event: "outreach_sent", toStage: "contacted", detail: "Intro email", createdAt: iso(-6, "09:30") },
    { pipelineId: 2, event: "outreach_sent", toStage: "contacted", detail: "Intro email", createdAt: iso(-8, "10:15") },
    { pipelineId: 3, event: "outreach_sent", toStage: "contacted", detail: "Phone call", createdAt: iso(-4, "14:00") },
    { pipelineId: 8, event: "stage_change", fromStage: "contacted", toStage: "replied", detail: "Asked for pricing", createdAt: iso(-3, "11:20") },
  ]);

  // Contacts.
  await db.insert(schema.contacts).values([
    { name: "Abhi Chatterjee", relationship: "Mentor", category: "mentor", lastContact: iso(-35), followUpCadenceDays: 30, priority: "high", notes: "Monthly check-in. Prepare one specific question before each call." },
    { name: "EY Manager", relationship: "Line manager", category: "work", lastContact: iso(-5), followUpCadenceDays: 14, priority: "high", notes: "Placeholder. Keep visible on SSE dashboard progress." },
    { name: "Work ally", relationship: "Colleague", category: "work", lastContact: iso(-10), followUpCadenceDays: 21, priority: "normal", notes: "Placeholder. Coffee catch-up." },
    { name: "Family follow-up", relationship: "Family", category: "family", lastContact: iso(-9), followUpCadenceDays: 7, priority: "high", notes: "Placeholder. Weekly call." },
    { name: "Side hustle lead", relationship: "Prospect", category: "business", lastContact: iso(-12), followUpCadenceDays: 7, priority: "high", notes: "Placeholder. Interested in Pulse demo." },
    { name: "Friend follow-up", relationship: "Friend", category: "friend", lastContact: iso(-20), followUpCadenceDays: 21, priority: "normal", notes: "Placeholder." },
  ]);
  await db.insert(schema.contactInteractions).values([
    { contactId: 1, date: iso(-35), channel: "call", note: "Discussed EY progression and Pulse positioning." },
    { contactId: 4, date: iso(-9), channel: "call", note: "Weekly call." },
  ]);

  // Spending: mixed realistic entries over ~3 weeks.
  const spendRows = [
    { date: iso(-1), amount: 14.5, category: "takeaway", merchant: "Deliveroo", note: "Late dinner", isBusiness: false },
    { date: iso(-2), amount: 42.3, category: "groceries", merchant: "Aldi", note: "Weekly shop", isBusiness: false },
    { date: iso(-3), amount: 18.2, category: "takeaway", merchant: "Uber Eats", note: "", isBusiness: false },
    { date: iso(-4), amount: 3.2, category: "transport", merchant: "TfWM", note: "Bus", isBusiness: false },
    { date: iso(-5), amount: 12.99, category: "subscriptions", merchant: "Spotify", note: "", isBusiness: false },
    { date: iso(-6), amount: 25.0, category: "business", merchant: "Twilio", note: "Pulse AI voice agent credits", isBusiness: true },
    { date: iso(-8), amount: 16.8, category: "takeaway", merchant: "Just Eat", note: "", isBusiness: false },
    { date: iso(-10), amount: 38.6, category: "groceries", merchant: "Tesco", note: "", isBusiness: false },
    { date: iso(-12), amount: 9.99, category: "subscriptions", merchant: "iCloud", note: "", isBusiness: false },
    { date: iso(-13), amount: 22.4, category: "takeaway", merchant: "Deliveroo", note: "", isBusiness: false },
    { date: iso(-15), amount: 55.0, category: "business", merchant: "Google Workspace", note: "workwithpulse.ai email", isBusiness: true },
    { date: iso(-17), amount: 11.5, category: "other", merchant: "Waterstones", note: "Book", isBusiness: false },
    { date: iso(-19), amount: 15.7, category: "takeaway", merchant: "Uber Eats", note: "", isBusiness: false },
  ];
  for (const row of spendRows) {
    await db.insert(schema.spending).values(row);
  }
  await db.insert(schema.financeGoals).values({
    name: "Takeaway under 8 orders per rolling 30 days",
    targetAmount: null,
    note: "Baseline was 26 per 30 days (149 in 174). Never return to the line.",
  });

  // Reading list.
  const books: Array<[string, string, string, string, number, number]> = [
    ["Deep Work", "Cal Newport", "mind", "reading", 296, 84],
    ["Atomic Habits", "James Clear", "mind", "reading", 320, 210],
    ["The Psychology of Money", "Morgan Housel", "wealth", "queued", 256, 0],
    ["Rich Dad Poor Dad", "Robert Kiyosaki", "wealth", "queued", 336, 0],
    ["Think and Grow Rich", "Napoleon Hill", "wealth", "queued", 320, 0],
    ["How to Win Friends and Influence People", "Dale Carnegie", "character", "queued", 288, 0],
    ["Never Split the Difference", "Chris Voss", "systems", "queued", 288, 0],
    ["The Laws of Human Nature", "Robert Greene", "character", "queued", 624, 0],
    ["Sapiens", "Yuval Noah Harari", "mind", "queued", 512, 0],
    ["Factfulness", "Hans Rosling", "mind", "queued", 352, 0],
    ["The Power of Habit", "Charles Duhigg", "mind", "queued", 400, 0],
    ["The Subtle Art of Not Giving a F*ck", "Mark Manson", "character", "queued", 224, 0],
  ];
  for (const [title, author, pillarKey, status, pagesTotal, pagesRead] of books) {
    await db.insert(schema.readingList).values({ title, author, pillarKey, status, pagesTotal, pagesRead });
  }
  await db.insert(schema.readingLogs).values([
    { bookId: 1, date: iso(-2), pages: 20, note: "Attention residue chapter" },
    { bookId: 2, date: iso(-4), pages: 15, note: "" },
    { bookId: 1, date: iso(-7), pages: 12, note: "" },
  ]);

  // Memory items.
  await db.insert(schema.memoryItems).values([
    { type: "identity", title: "Who Jamal is", content: "22, Birmingham. EY assurance data analytics apprentice. Founding Pulse AI Technologies. Muslim. Sees life as a long progression system towards a Level 100 standard of human excellence.", tags: "core", confidence: "high", sensitivity: "normal" },
    { type: "goals", title: "Pulse AI commercial model", content: "AI enquiry handling for dental and vet practices. £2,500 setup plus £500 to £1,200 per month. Voice agent built. Outreach is the bottleneck.", tags: "pulse,business", confidence: "high", sensitivity: "normal" },
    { type: "goals", title: "Body composition phases", content: "Around 92kg now. Phase 1 cut to around 82kg. Phase 2 lean build. Stockholm Half Marathon late August 2026 if cleared.", tags: "body", confidence: "high", sensitivity: "normal" },
    { type: "constraints", title: "Running gated behind clearance", content: "No running until MRI or orthopaedic clearance. Interim cardio: stairmaster and weighted skipping. Strength upper-body only.", tags: "body,injury", confidence: "high", sensitivity: "normal" },
    { type: "routines", title: "Non-negotiables", content: "Five daily salah. Monday and Thursday voluntary fasts are target habits. Lights out target 23:00.", tags: "faith,routine", confidence: "high", sensitivity: "normal" },
    { type: "avoidance_patterns", title: "Known failure modes", content: "12h/day phone use. Short-form video spirals. Phone in bedroom. Impulse food ordering (149 takeaways in 174 days). Late-night project starting. Planning as procrastination. Overbuilding tools instead of outreach. Avoiding scary sales action.", tags: "avoidance", confidence: "high", sensitivity: "normal" },
    { type: "people", title: "Abhi Chatterjee", content: "Mentor. Monthly follow-up cadence. Prepare one specific question per call.", tags: "mentor", confidence: "high", sensitivity: "normal" },
    { type: "long_term_vision", title: "Somalia and Somaliland systems building", content: "Long-term aim: build institutions, platforms, companies, and systems that reduce chaos and increase opportunity.", tags: "legacy", confidence: "medium", sensitivity: "normal" },
    { type: "weakness_patterns", title: "Protein is the weakest variable", content: "Nutrition target 1700 to 2000 kcal, 170g+ protein. Protein logging is the most commonly missed habit.", tags: "body,nutrition", confidence: "high", sensitivity: "normal" },
    { type: "private_notes", title: "Private note example", content: "Sensitive example item. Never sent to AI unless explicitly included.", tags: "private", confidence: "medium", sensitivity: "sensitive" },
  ]);

  // Calendar events for today and the week.
  await db.insert(schema.calendarEvents).values([
    { title: "EY office day", start: iso(0, "09:00"), end: iso(0, "17:30"), location: "EY Birmingham", sourceProvider: "mock" },
    { title: "Pulse AI outreach block", start: iso(0, "07:45"), end: iso(0, "08:30"), description: "Send outreach before work. The scary task is the signal.", sourceProvider: "mock" },
    { title: "Deep work block", start: iso(0, "18:30"), end: iso(0, "20:00"), description: "AI and ML curriculum", sourceProvider: "mock" },
    { title: "Upper-body strength session", start: iso(0, "20:15"), end: iso(0, "21:15"), location: "Gym", sourceProvider: "mock" },
    { title: "Stairmaster session", start: iso(1, "07:00"), end: iso(1, "07:40"), location: "Gym", sourceProvider: "mock" },
    { title: "Apprenticeship study block", start: iso(1, "18:30"), end: iso(1, "20:00"), description: "BPP", sourceProvider: "mock" },
    { title: "Side hustle build block", start: iso(2, "19:00"), end: iso(2, "20:30"), description: "Pulse AI demo polish, only if outreach done", sourceProvider: "mock" },
    { title: "Friday prayer", start: iso(((5 - new Date().getDay()) + 7) % 7, "13:00"), end: iso(((5 - new Date().getDay()) + 7) % 7, "14:00"), location: "Mosque", sourceProvider: "mock" },
    { title: "Weekly review", start: iso(((7 - new Date().getDay()) % 7) || 7, "19:00"), end: iso(((7 - new Date().getDay()) % 7) || 7, "20:00"), description: "Sunday review. Plan versus actual.", sourceProvider: "mock" },
  ]);

  // Emails (mock inbox).
  await db.insert(schema.emailMessages).values([
    {
      sender: "BPP Programmes <programmes@bpp.com>",
      subject: "Assignment deadline reminder: submission due in 9 days",
      snippet: "This is a reminder that your next assessment submission is due...",
      body: `Dear Jamal,\n\nThis is a reminder that your next assessment submission is due on ${iso(9)}. Please ensure your draft is uploaded to the portal at least 24 hours in advance.\n\nRegards,\nBPP Programmes Team`,
      receivedAt: iso(-1, "08:12"),
      category: "ey_bpp_deadline",
      detectedDeadline: iso(9),
      sourceProvider: "mock",
    },
    {
      sender: "Dr S. Patel <reception@birminghamsmile.co.uk>",
      subject: "Re: AI enquiry handling for your practice",
      snippet: "Thanks for reaching out. We do miss calls during busy periods...",
      body: "Hi Jamal,\n\nThanks for reaching out. We do miss calls during busy periods, especially Monday mornings. Could you send over some details on pricing and how the setup works?\n\nBest,\nDr Patel",
      receivedAt: iso(0, "07:45"),
      category: "pulse_lead",
      sourceProvider: "mock",
    },
    {
      sender: "TechCrunch Daily <newsletter@techcrunch.com>",
      subject: "The 10 AI startups to watch this quarter",
      snippet: "Your daily dose of startup news...",
      body: "Your daily dose of startup news. Ten AI startups raised this week...",
      receivedAt: iso(0, "06:30"),
      category: "noise",
      sourceProvider: "mock",
    },
    {
      sender: "Abhi Chatterjee <abhi.chatterjee@example.com>",
      subject: "Catch up this month?",
      snippet: "Jamal, it has been a while since our last call...",
      body: "Jamal,\n\nIt has been a while since our last call. Do you have 30 minutes in the next two weeks? I would like to hear how the dashboard work and the business are progressing.\n\nAbhi",
      receivedAt: iso(-2, "17:20"),
      category: "needs_reply",
      sourceProvider: "mock",
    },
    {
      sender: "Gym Admin <admin@pureGym.example.com>",
      subject: "Direct debit update required",
      snippet: "We were unable to process your membership payment...",
      body: `Hi Jamal,\n\nWe were unable to process your membership payment this month. Please update your payment details by ${iso(5)} to avoid cancellation.\n\nPureGym Admin`,
      receivedAt: iso(-1, "12:05"),
      category: "risk",
      detectedDeadline: iso(5),
      sourceProvider: "mock",
    },
  ]);

  // Build queue example.
  await db.insert(schema.buildQueue).values({
    idea: "Lead list scraper for dental practices",
    problemItSolves: "Manually building the 25-practice lead list is slow",
    targetUser: "Jamal",
    scope: "Single script, Google Maps data, CSV output",
    definitionOfDone: "25 practices with name, phone, website in a CSV",
    status: "captured",
  });

  // Connector accounts: everything starts in mock mode.
  await db.insert(schema.connectorAccounts).values([
    { provider: "gmail", mode: "mock" },
    { provider: "google_calendar", mode: "mock" },
  ]);

  // Initial conservative level snapshot.
  const initialScores = { faith: 38, body: 31, mind: 30, career: 36, wealth: 24, character: 33, systems: 22 };
  await db.insert(schema.levelSnapshots).values({
    date: iso(0),
    overallLevel: 27,
    confidence: "medium",
    pillarScoresJson: JSON.stringify(initialScores),
    note: "Initial conservative baseline. Gains require multi-week logged evidence.",
  });

  await db.insert(schema.journal).values({
    date: iso(-1),
    content: "Deferred the outreach task again. Spent the evening adjusting the demo instead. The demo was already good enough. Tomorrow: outreach before work, no exceptions.",
    mood: "frustrated",
  });

  await db.insert(schema.auditLogs).values({
    action: "db_seed",
    target: "all_tables",
    detail: "Database seeded with mock data",
    isExternalWrite: false,
    confirmed: true,
  });

  console.log("Seed complete:", dbPath);
}

seed()
  .then(() => sqlite.close())
  .catch((error) => {
    console.error("Seed failed:", error);
    sqlite.close();
    process.exit(1);
  });
