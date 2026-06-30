/**
 * Server-side persistence for the SCORE taxonomy + few-shot config.
 *
 * A single row (id = 'default') holds the whole config as JSON. Falls back to
 * DEFAULT_SCORE_CONFIG when nothing has been saved yet. The table is created
 * defensively at runtime (same pattern as ensureScoreTable) since the migration
 * journal is not used for recent tables.
 */
import { sql, eq } from 'drizzle-orm';
import { db } from '@/db/db';
import { scoreConfig } from '@/db/schema';
import { DEFAULT_SCORE_CONFIG } from './default-config';
import { normalizeConfig, type ScoreConfig } from './config';

const SINGLETON_ID = 'default';

let ensured: Promise<void> | null = null;

async function createConfigTable(): Promise<void> {
  const existing = await db.execute<{ reg: string | null }>(
    sql`SELECT to_regclass('public.score_config') AS reg`
  );
  if (existing[0]?.reg) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "score_config" (
      "id" text PRIMARY KEY NOT NULL,
      "config" jsonb NOT NULL,
      "updated_at" timestamp NOT NULL
    )
  `);
}

export function ensureScoreConfigTable(): Promise<void> {
  if (!ensured) {
    ensured = createConfigTable().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}

/** The saved config, or the built-in default if none has been saved. */
export async function getScoreConfig(): Promise<ScoreConfig> {
  await ensureScoreConfigTable();
  const rows = await db.select().from(scoreConfig).where(eq(scoreConfig.id, SINGLETON_ID));
  if (rows.length === 0) return DEFAULT_SCORE_CONFIG;
  return normalizeConfig(rows[0].config) ?? DEFAULT_SCORE_CONFIG;
}

/** Validate + persist a config. Throws on an unusable config. */
export async function saveScoreConfig(raw: unknown): Promise<ScoreConfig> {
  await ensureScoreConfigTable();
  const normalized = normalizeConfig(raw);
  if (!normalized) {
    throw new Error('Invalid taxonomy config: needs at least one subtype with a code.');
  }
  const now = new Date();
  await db
    .insert(scoreConfig)
    .values({ id: SINGLETON_ID, config: normalized, updatedAt: now })
    .onConflictDoUpdate({ target: scoreConfig.id, set: { config: normalized, updatedAt: now } });
  return normalized;
}
