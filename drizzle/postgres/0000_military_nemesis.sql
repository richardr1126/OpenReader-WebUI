CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audiobook_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"user_id" text,
	"chapter_index" integer NOT NULL,
	"title" text NOT NULL,
	"duration" real DEFAULT 0,
	"file_path" text NOT NULL,
	"format" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audiobooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"author" text,
	"description" text,
	"cover_path" text,
	"duration" real DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"size" bigint NOT NULL,
	"last_modified" bigint NOT NULL,
	"file_path" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "documents_id_user_id_pk" PRIMARY KEY("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"is_anonymous" boolean,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_tts_chars" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"char_count" bigint DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_tts_chars_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_chapters" ADD CONSTRAINT "audiobook_chapters_book_id_audiobooks_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_tts_chars_date" ON "user_tts_chars" USING btree ("date");
