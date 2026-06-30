import { pgTable, text, timestamp, boolean, serial, jsonb, index, integer } from 'drizzle-orm/pg-core';
import { DEFAULT_ASSIGNMENT_AI_GUIDANCE } from '../lib/assignment-ai';

// Instructor table for Phase 2
export const instructors = pgTable('instructors', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  password: text('password'), // Hashed password (null if not verified yet)
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: text('role').notNull().default('instructor'), // 'instructor' | 'administrator' | 'student'
  isVerified: boolean('is_verified').default(false).notNull(),
  createdAt: timestamp('created_at').notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

// Email verification tokens (for initial registration only)
export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  token: text('token').unique().notNull(),
  type: text('type').notNull().default('verification'), // 'verification' or 'password_reset'
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').notNull(),
}, (table) => ({
  tokenIdx: index('auth_tokens_token_idx').on(table.token),
  emailIdx: index('auth_tokens_email_idx').on(table.email),
}));

export const assignments = pgTable('assignments', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  instructions: text('instructions').notNull(),
  criteria: text('criteria'),
  deadline: timestamp('deadline').notNull(),
  shareToken: text('share_token').unique().notNull(),
  // Phase 2 fields
  instructorId: text('instructor_id'), // nullable for Phase 1
  customSystemPrompt: text('custom_system_prompt').notNull().default(DEFAULT_ASSIGNMENT_AI_GUIDANCE),
  includeInstructionInPrompt: boolean('include_instruction_in_prompt').default(false),
  allowWebSearch: boolean('allow_web_search').default(false),
  strictPasteBlocking: boolean('strict_paste_blocking').default(false),
  createdAt: timestamp('created_at').notNull(),
});

export const studentSessions = pgTable('student_sessions', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().references(() => assignments.id),
  userId: text('user_id').references(() => instructors.id),
  participantToken: text('participant_token').notNull().default(''),
  studentFirstName: text('student_first_name').notNull(),
  studentLastName: text('student_last_name').notNull(),
  studentEmail: text('student_email').notNull(),
  password: text('password'), // Hashed password (null if not verified yet)
  isVerified: boolean('is_verified').default(false).notNull(),
  startedAt: timestamp('started_at').notNull(),
  lastSavedAt: timestamp('last_saved_at'),
  lastLoginAt: timestamp('last_login_at'),
  // Free-form per-session attributes (e.g. imported NIRVANA participant survey
  // scales, writer-profile groupings, readability, and aggregate metrics).
  metadata: jsonb('metadata'),
});

export const editorEvents = pgTable('editor_events', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => studentSessions.id),
  eventType: text('event_type').notNull(),
  // 'paste_internal', 'paste_external', 'snapshot', 'submission', 'typing_op', 'editor_selection', 'chat_input', 'chat_web_search_toggle'
  eventData: jsonb('event_data').notNull(),
  // For snapshot: BlockNote document JSON array
  // For paste: { content: string }
  timestamp: timestamp('timestamp').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
});

export const chatConversations = pgTable('chat_conversations', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => studentSessions.id),
  title: text('title').notNull(), // Auto-generated, editable
  createdAt: timestamp('created_at').notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => chatConversations.id),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // { tokens, model, etc. }
  timestamp: timestamp('timestamp').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
});

// TypeScript types
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;

export type StudentSession = typeof studentSessions.$inferSelect;
export type NewStudentSession = typeof studentSessions.$inferInsert;

export type EditorEvent = typeof editorEvents.$inferSelect;
export type NewEditorEvent = typeof editorEvents.$inferInsert;

export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type Instructor = typeof instructors.$inferSelect;
export type NewInstructor = typeof instructors.$inferInsert;

export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
