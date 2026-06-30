-- Free-form per-session attributes (e.g. imported NIRVANA participant survey
-- scales, writer-profile groupings, readability, and aggregate metrics).
ALTER TABLE "student_sessions" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
