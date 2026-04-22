ALTER TABLE "student_sessions" ADD COLUMN "participant_token" text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "student_sessions_assignment_token_uq"
  ON "student_sessions"("assignment_id", "participant_token")
  WHERE "participant_token" <> '';
