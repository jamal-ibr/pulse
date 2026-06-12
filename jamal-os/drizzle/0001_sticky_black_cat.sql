CREATE TABLE `health_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`units` text,
	`source` text DEFAULT 'health_auto_export' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_metrics_date_metric` ON `health_metrics` (`date`,`metric`);--> statement-breakpoint
ALTER TABLE `email_messages` ADD `external_id` text;