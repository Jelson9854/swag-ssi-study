-- SCORE viewer: cached intent classifications of student->chatbot queries.
-- One row per query (a single student message + its chatbot response), holding
-- the results of both classifiers (A: hierarchical single-label, B: per-subtype
-- multi-tag). Written with IF NOT EXISTS so it is safe to re-apply and matches
-- the runtime ensureScoreTable() guard used by the classify API.
CREATE TABLE IF NOT EXISTS "score_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"message_id" integer NOT NULL,
	"conversation_id" text NOT NULL,
	"session_id" text NOT NULL,
	"query_text" text NOT NULL,
	"response_text" text,
	"turn_index" integer NOT NULL,
	"query_timestamp" timestamp NOT NULL,
	"type_a" text,
	"subtype_a" text,
	"subtype_tags_b" jsonb,
	"subtype_scores_b" jsonb,
	"raw_response_a" text,
	"raw_response_b" text,
	"model" text,
	"classifier_version" integer DEFAULT 1 NOT NULL,
	"classified_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "score_classifications" ADD CONSTRAINT "score_classifications_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "score_classifications" ADD CONSTRAINT "score_classifications_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "score_classifications" ADD CONSTRAINT "score_classifications_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "score_classifications" ADD CONSTRAINT "score_classifications_session_id_student_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."student_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_classifications_assignment_idx" ON "score_classifications" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "score_classifications_message_unique" ON "score_classifications" USING btree ("message_id");
