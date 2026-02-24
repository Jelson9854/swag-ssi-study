CREATE INDEX IF NOT EXISTS "editor_events_session_seq_idx"
ON "editor_events" USING btree ("session_id", "sequence_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editor_events_session_time_idx"
ON "editor_events" USING btree ("session_id", "timestamp");
