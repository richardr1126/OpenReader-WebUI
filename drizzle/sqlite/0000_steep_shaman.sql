CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audiobook_chapters` (
	`id` text NOT NULL,
	`book_id` text NOT NULL,
	`user_id` text NOT NULL,
	`chapter_index` integer NOT NULL,
	`title` text NOT NULL,
	`duration` real DEFAULT 0,
	`file_path` text NOT NULL,
	`format` text NOT NULL,
	PRIMARY KEY(`id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `audiobooks` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`description` text,
	`cover_path` text,
	`duration` real DEFAULT 0,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	PRIMARY KEY(`id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`last_modified` integer NOT NULL,
	`file_path` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	PRIMARY KEY(`id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_anonymous` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_tts_chars` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`char_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as int) * 1000),
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_tts_chars_date` ON `user_tts_chars` (`date`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
