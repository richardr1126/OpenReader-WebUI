CREATE TABLE `user_document_progress` (
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`reader_type` text NOT NULL,
	`location` text NOT NULL,
	`progress` real,
	`client_updated_at_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	PRIMARY KEY(`user_id`, `document_id`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`client_updated_at_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000)
);
--> statement-breakpoint
CREATE INDEX `idx_user_document_progress_user_id_updated_at` ON `user_document_progress` (`user_id`,`updated_at`);
