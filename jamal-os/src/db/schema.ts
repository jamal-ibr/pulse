import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = () => sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const userProfile = sqliteTable("user_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  location: text("location").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  target: text("target"),
  detail: text("detail"),
  isExternalWrite: integer("is_external_write", { mode: "boolean" })
    .notNull()
    .default(false),
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
});

export const permissionRules = sqliteTable("permission_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull(), // e.g. gmail.read, calendar.write
  allowed: integer("allowed", { mode: "boolean" }).notNull().default(false),
  requiresConfirmation: integer("requires_confirmation", { mode: "boolean" })
    .notNull()
    .default(true),
  note: text("note"),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const aiInteractions = sqliteTable("ai_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promptName: text("prompt_name").notNull(),
  provider: text("provider").notNull(), // anthropic | mock
  inputSummary: text("input_summary").notNull(),
  output: text("output").notNull(),
  redactionApplied: integer("redaction_applied", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Pillars and level
// ---------------------------------------------------------------------------

export const pillars = sqliteTable("pillars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // faith | body | mind | career | wealth | character | systems
  name: text("name").notNull(),
  description: text("description").notNull(),
  weight: real("weight").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const pillarScores = sqliteTable("pillar_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pillarKey: text("pillar_key").notNull(),
  date: text("date").notNull(), // ISO date
  score: integer("score").notNull(), // 1-100
  evidence: text("evidence").notNull(),
  missingDataPenalty: integer("missing_data_penalty").notNull().default(0),
  raisedBy: text("raised_by"),
  loweredBy: text("lowered_by"),
  nextAction: text("next_action"),
  createdAt: text("created_at").notNull().default(now()),
});

export const levelSnapshots = sqliteTable("level_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  overallLevel: integer("overall_level").notNull(),
  confidence: text("confidence").notNull(), // low | medium | high
  pillarScoresJson: text("pillar_scores_json").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Habits and health
// ---------------------------------------------------------------------------

export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  pillarKey: text("pillar_key").notNull(),
  targetDescription: text("target_description").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// One row per day. Built for sub-30-second full-day logging.
export const habitLogs = sqliteTable("habit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // ISO date
  salahCount: integer("salah_count"), // target 5
  proteinG: integer("protein_g"), // target 170
  kcal: integer("kcal"), // target band 1700-2000
  trainingSession: text("training_session"), // stairmaster|skipping|strength|football|muay_thai|mobility|rest
  monThuFast: integer("mon_thu_fast", { mode: "boolean" }),
  phoneScreenHours: real("phone_screen_hours"), // target < 4
  deepWorkBlocks: integer("deep_work_blocks"), // target 2
  pagesRead: integer("pages_read"),
  waterLitres: real("water_litres"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const sleepLogs = sqliteTable("sleep_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  sleepHours: real("sleep_hours"),
  sleepTime: text("sleep_time"), // HH:MM
  wakeTime: text("wake_time"), // HH:MM
  lightsOutTime: text("lights_out_time"), // HH:MM, target 23:00, late after 23:30
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now()),
});

export const weightLogs = sqliteTable("weight_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  weightKg: real("weight_kg").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now()),
});

export const bodyMetrics = sqliteTable("body_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  metric: text("metric").notNull(), // waist_cm, bodyfat_pct, etc.
  value: real("value").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

export const trainingSessions = sqliteTable("training_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  type: text("type").notNull(), // stairmaster|skipping|strength|football|muay_thai|mobility|rest
  durationMin: integer("duration_min"),
  intensity: text("intensity"), // easy | moderate | hard
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now()),
});

export const injuryNotes = sqliteTable("injury_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  area: text("area").notNull(),
  status: text("status").notNull(), // pending_clearance | improving | cleared | flare_up
  note: text("note").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Projects and tasks
// ---------------------------------------------------------------------------

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pillarKey: text("pillar_key").notNull(),
  status: text("status").notNull().default("active"), // active | paused | done
  nextAction: text("next_action").notNull(),
  description: text("description"),
  lastActivityAt: text("last_activity_at"),
  createdAt: text("created_at").notNull().default(now()),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  pillarKey: text("pillar_key").notNull(),
  projectId: integer("project_id"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("todo"), // todo | in_progress | done | blocked
  energy: text("energy").notNull().default("shallow"), // deep | shallow
  scariness: integer("scariness").notNull(), // 1-5, required
  deferCount: integer("defer_count").notNull().default(0),
  nextAction: text("next_action"),
  blockedReason: text("blocked_reason"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const taskEvents = sqliteTable("task_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull(),
  event: text("event").notNull(), // created | deferred | completed | status_change
  detail: text("detail"),
  createdAt: text("created_at").notNull().default(now()),
});

export const projectActivity = sqliteTable("project_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  activity: text("activity").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Pulse AI pipeline
// ---------------------------------------------------------------------------

export const pipeline = sqliteTable("pipeline", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  practiceName: text("practice_name").notNull(),
  vertical: text("vertical").notNull(), // dental | vet
  stage: text("stage").notNull().default("identified"), // identified|contacted|replied|demo|proposal|won|lost
  lastTouch: text("last_touch"),
  nextFollowUp: text("next_follow_up"),
  notes: text("notes"),
  source: text("source"),
  owner: text("owner").notNull().default("Jamal"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const pipelineEvents = sqliteTable("pipeline_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pipelineId: integer("pipeline_id").notNull(),
  event: text("event").notNull(), // created | stage_change | outreach_sent | note
  fromStage: text("from_stage"),
  toStage: text("to_stage"),
  detail: text("detail"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Personal CRM
// ---------------------------------------------------------------------------

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  category: text("category").notNull(), // mentor | work | family | friend | business
  lastContact: text("last_contact"),
  followUpCadenceDays: integer("follow_up_cadence_days").notNull().default(30),
  notes: text("notes"),
  priority: text("priority").notNull().default("normal"), // high | normal | low
  boundaryNote: text("boundary_note"),
  createdAt: text("created_at").notNull().default(now()),
});

export const contactInteractions = sqliteTable("contact_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id").notNull(),
  date: text("date").notNull(),
  channel: text("channel"), // call | message | in_person | email
  note: text("note"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

export const spending = sqliteTable("spending", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  amount: real("amount").notNull(),
  category: text("category").notNull(), // groceries|takeaway|transport|subscriptions|business|other
  merchant: text("merchant"),
  note: text("note"),
  isBusiness: integer("is_business", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("manual"), // manual | csv
  createdAt: text("created_at").notNull().default(now()),
});

export const financeGoals = sqliteTable("finance_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetAmount: real("target_amount"),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now()),
});

export const csvImports = sqliteTable("csv_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  rowsImported: integer("rows_imported").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Reading and knowledge
// ---------------------------------------------------------------------------

export const readingList = sqliteTable("reading_list", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  pillarKey: text("pillar_key").notNull(),
  status: text("status").notNull().default("queued"), // queued | reading | done
  pagesTotal: integer("pages_total"),
  pagesRead: integer("pages_read").notNull().default(0),
  keyLessons: text("key_lessons"),
  actionTaken: text("action_taken"),
  createdAt: text("created_at").notNull().default(now()),
});

export const readingLogs = sqliteTable("reading_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull(),
  date: text("date").notNull(),
  pages: integer("pages").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now()),
});

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Journal and memory
// ---------------------------------------------------------------------------

export const journal = sqliteTable("journal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  content: text("content").notNull(),
  mood: text("mood"),
  createdAt: text("created_at").notNull().default(now()),
});

export const memoryItems = sqliteTable("memory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // identity|goals|preferences|constraints|current_projects|people|routines|lessons_learned|wins|weakness_patterns|avoidance_patterns|long_term_vision|private_notes
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags"),
  source: text("source").notNull().default("manual"),
  confidence: text("confidence").notNull().default("medium"), // low | medium | high
  sensitivity: text("sensitivity").notNull().default("normal"), // normal | sensitive
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
  lastReviewedAt: text("last_reviewed_at"),
});

// ---------------------------------------------------------------------------
// Email and calendar
// ---------------------------------------------------------------------------

export const emailMessages = sqliteTable("email_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sender: text("sender").notNull(),
  subject: text("subject").notNull(),
  snippet: text("snippet").notNull(),
  body: text("body").notNull(),
  receivedAt: text("received_at").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  category: text("category"), // needs_reply|pulse_lead|ey_bpp_deadline|noise|opportunity|risk
  detectedDeadline: text("detected_deadline"),
  sourceProvider: text("source_provider").notNull().default("mock"),
  externalId: text("external_id"),
  createdAt: text("created_at").notNull().default(now()),
});

export const emailDrafts = sqliteTable("email_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailId: integer("email_id").notNull(),
  draftBody: text("draft_body").notNull(),
  status: text("status").notNull().default("draft"), // draft | copied | discarded
  createdAt: text("created_at").notNull().default(now()),
});

export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  start: text("start").notNull(), // ISO datetime
  end: text("end").notNull(),
  location: text("location"),
  description: text("description"),
  sourceProvider: text("source_provider").notNull().default("local"), // local | mock | google
  externalId: text("external_id"),
  writeStatus: text("write_status").notNull().default("local_only"), // local_only | synced
  createdAt: text("created_at").notNull().default(now()),
});

export const healthMetrics = sqliteTable(
  "health_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    metric: text("metric").notNull(), // e.g. step_count, heart_rate, active_energy
    value: real("value").notNull(),
    units: text("units"),
    source: text("source").notNull().default("health_auto_export"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (table) => [uniqueIndex("health_metrics_date_metric").on(table.date, table.metric)],
);

export const connectorAccounts = sqliteTable("connector_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(), // gmail | google_calendar
  mode: text("mode").notNull().default("mock"), // mock | read_only | write_enabled
  encryptedToken: text("encrypted_token"),
  connectedAt: text("connected_at"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Weekly review
// ---------------------------------------------------------------------------

export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  aiSummary: text("ai_summary").notNull(),
  avoidanceFlagsJson: text("avoidance_flags_json").notNull(),
  pillarScoresJson: text("pillar_scores_json").notNull(),
  commitment: text("commitment").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// Build queue
// ---------------------------------------------------------------------------

export const buildQueue = sqliteTable("build_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  idea: text("idea").notNull(),
  problemItSolves: text("problem_it_solves").notNull(),
  targetUser: text("target_user"),
  scope: text("scope"),
  definitionOfDone: text("definition_of_done"),
  status: text("status").notNull().default("captured"), // captured | scoped | building | done | dropped
  generatedPrompt: text("generated_prompt"),
  isAfter2230WarningShown: integer("is_after_2230_warning_shown", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
