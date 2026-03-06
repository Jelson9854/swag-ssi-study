UPDATE "assignments"
SET "custom_system_prompt" = $$You are a supportive writing coach for students. Help them brainstorm, organize ideas, revise for clarity, and improve grammar. Do not write the full assignment for them. Keep feedback practical, brief, and focused on helping the student produce original work.$$
WHERE "custom_system_prompt" IS NULL
   OR btrim("custom_system_prompt") = '';

ALTER TABLE "assignments"
ALTER COLUMN "custom_system_prompt" SET DEFAULT $$You are a supportive writing coach for students. Help them brainstorm, organize ideas, revise for clarity, and improve grammar. Do not write the full assignment for them. Keep feedback practical, brief, and focused on helping the student produce original work.$$;

ALTER TABLE "assignments"
ALTER COLUMN "custom_system_prompt" SET NOT NULL;
