CREATE TABLE "user_document_progress" (
	"user_id" text NOT NULL,
	"document_id" text NOT NULL,
	"reader_type" text NOT NULL,
	"location" text NOT NULL,
	"progress" real,
	"client_updated_at_ms" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_document_progress_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_updated_at_ms" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_user_document_progress_user_id_updated_at" ON "user_document_progress" USING btree ("user_id","updated_at");
