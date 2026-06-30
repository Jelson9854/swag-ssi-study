/**
 * Selectable classifier models for SCORE.
 *
 * Kept in its own module (no `openai` import) so it is safe to import from both
 * the server (classifier / route / page) and the client viewer without pulling
 * the OpenAI SDK into the browser bundle.
 */
export const SCORE_MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano'] as const;
export type ScoreModel = (typeof SCORE_MODELS)[number];

/** Friendly labels for the model picker. */
export const SCORE_MODEL_LABELS: Record<string, string> = {
  'gpt-5.4-mini': '5.4-mini · accurate',
  'gpt-5.4-nano': '5.4-nano · fast',
};

export function isValidScoreModel(model: string | null | undefined): model is ScoreModel {
  return !!model && (SCORE_MODELS as readonly string[]).includes(model);
}

/**
 * Default selection: env OPENAI_MODEL when it is one of the selectable SCORE
 * models, otherwise the first listed model. (Server-side only — reads env.)
 */
export function getDefaultScoreModel(): string {
  const env = process.env.OPENAI_MODEL;
  return isValidScoreModel(env) ? env : SCORE_MODELS[0];
}

/** Resolve a (possibly untrusted) requested model to an allowed one. */
export function resolveScoreModel(requested?: string | null): string {
  return isValidScoreModel(requested) ? requested : getDefaultScoreModel();
}
