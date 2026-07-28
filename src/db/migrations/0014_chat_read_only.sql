-- Per-assignment instructor toggle: when enabled, students can view chat
-- history but cannot send new messages. Enforced client-side (ChatPanel) and
-- server-side (/api/chat) as defense in depth.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "chat_read_only" boolean DEFAULT false;
