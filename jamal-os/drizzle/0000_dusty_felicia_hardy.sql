CREATE TABLE `ai_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prompt_name` text NOT NULL,
	`provider` text NOT NULL,
	`input_summary` text NOT NULL,
	`output` text NOT NULL,
	`redaction_applied` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`detail` text,
	`is_external_write` integer DEFAULT false NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `build_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea` text NOT NULL,
	`problem_it_solves` text NOT NULL,
	`target_user` text,
	`scope` text,
	`definition_of_done` text,
	`status` text DEFAULT 'captured' NOT NULL,
	`generated_prompt` text,
	`is_after_2230_warning_shown` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`location` text,
	`description` text,
	`source_provider` text DEFAULT 'local' NOT NULL,
	`external_id` text,
	`write_status` text DEFAULT 'local_only' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`mode` text DEFAULT 'mock' NOT NULL,
	`encrypted_token` text,
	`connected_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contact_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`date` text NOT NULL,
	`channel` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`category` text NOT NULL,
	`last_contact` text,
	`follow_up_cadence_days` integer DEFAULT 30 NOT NULL,
	`notes` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`boundary_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `csv_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`rows_imported` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_id` integer NOT NULL,
	`draft_body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender` text NOT NULL,
	`subject` text NOT NULL,
	`snippet` text NOT NULL,
	`body` text NOT NULL,
	`received_at` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`category` text,
	`detected_deadline` text,
	`source_provider` text DEFAULT 'mock' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_amount` real,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`salah_count` integer,
	`protein_g` integer,
	`kcal` integer,
	`training_session` text,
	`mon_thu_fast` integer,
	`phone_screen_hours` real,
	`deep_work_blocks` integer,
	`pages_read` integer,
	`water_litres` real,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_logs_date_unique` ON `habit_logs` (`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`pillar_key` text NOT NULL,
	`target_description` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habits_key_unique` ON `habits` (`key`);--> statement-breakpoint
CREATE TABLE `injury_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`area` text NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`mood` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `level_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`overall_level` integer NOT NULL,
	`confidence` text NOT NULL,
	`pillar_scores_json` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`sensitivity` text DEFAULT 'normal' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_reviewed_at` text
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permission_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`allowed` integer DEFAULT false NOT NULL,
	`requires_confirmation` integer DEFAULT true NOT NULL,
	`note` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pillar_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pillar_key` text NOT NULL,
	`date` text NOT NULL,
	`score` integer NOT NULL,
	`evidence` text NOT NULL,
	`missing_data_penalty` integer DEFAULT 0 NOT NULL,
	`raised_by` text,
	`lowered_by` text,
	`next_action` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pillars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pillars_key_unique` ON `pillars` (`key`);--> statement-breakpoint
CREATE TABLE `pipeline` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`practice_name` text NOT NULL,
	`vertical` text NOT NULL,
	`stage` text DEFAULT 'identified' NOT NULL,
	`last_touch` text,
	`next_follow_up` text,
	`notes` text,
	`source` text,
	`owner` text DEFAULT 'Jamal' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pipeline_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pipeline_id` integer NOT NULL,
	`event` text NOT NULL,
	`from_stage` text,
	`to_stage` text,
	`detail` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`activity` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`pillar_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_action` text NOT NULL,
	`description` text,
	`last_activity_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_list` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`pillar_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`pages_total` integer,
	`pages_read` integer DEFAULT 0 NOT NULL,
	`key_lessons` text,
	`action_taken` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`date` text NOT NULL,
	`pages` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sleep_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`sleep_hours` real,
	`sleep_time` text,
	`wake_time` text,
	`lights_out_time` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_logs_date_unique` ON `sleep_logs` (`date`);--> statement-breakpoint
CREATE TABLE `spending` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`category` text NOT NULL,
	`merchant` text,
	`note` text,
	`is_business` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`pillar_key` text NOT NULL,
	`project_id` integer,
	`due_date` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`energy` text DEFAULT 'shallow' NOT NULL,
	`scariness` integer NOT NULL,
	`defer_count` integer DEFAULT 0 NOT NULL,
	`next_action` text,
	`blocked_reason` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`duration_min` integer,
	`intensity` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`ai_summary` text NOT NULL,
	`avoidance_flags_json` text NOT NULL,
	`pillar_scores_json` text NOT NULL,
	`commitment` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_logs_date_unique` ON `weight_logs` (`date`);