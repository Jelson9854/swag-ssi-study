-- SCORE editable taxonomy + few-shot config (singleton row, id = 'default').
-- Created with IF NOT EXISTS to match the runtime ensureScoreConfigTable() guard.
CREATE TABLE IF NOT EXISTS "score_config" (
	"id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp NOT NULL
);
