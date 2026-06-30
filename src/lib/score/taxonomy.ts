/**
 * Jelson query taxonomy — the fixed intent set for the SCORE viewer.
 *
 * Four Types, 26 Subtypes total (P 8 / T 4 / R 7 / A 7). Descriptions are
 * paraphrased from Jelson et al. (Tables 1-4). Used in two places that must
 * stay in sync:
 *   1. the classifier prompts (src/lib/score/classifier.ts), and
 *   2. the viewer UI (src/app/instructor/assignments/[id]/score/ScoreViewer.tsx).
 *
 * See docs/SCORE_viewer_spec.md, Appendix A.
 */

export type ScoreTypeKey = 'Planning' | 'Translating' | 'Reviewing' | 'All';

export interface ScoreSubtype {
  /** Stable code, e.g. "PL01". This is what classifiers emit and rows store. */
  code: string;
  /** Short human label. */
  label: string;
  /** Paraphrased definition used in the classifier prompt. */
  description: string;
}

export interface ScoreType {
  key: ScoreTypeKey;
  /** Single-letter code used in Jelson's scheme (P/T/R/A). */
  letter: 'P' | 'T' | 'R' | 'A';
  label: string;
  description: string;
  subtypes: ScoreSubtype[];
}

export const SCORE_TAXONOMY: ScoreType[] = [
  {
    key: 'Planning',
    letter: 'P',
    label: 'Planning',
    description: 'Set goals / plan; get information or ideas before or around writing.',
    subtypes: [
      { code: 'PL01', label: 'Provide an answer to a question', description: 'Ask the chatbot to directly answer a question.' },
      { code: 'PL02', label: 'Provide examples', description: 'Ask for examples (of arguments, evidence, phrasings, etc.).' },
      { code: 'PL03', label: 'Search for factual information', description: 'Ask for facts, data, definitions, or background information.' },
      { code: 'PL04', label: 'Suggest an essay structure', description: 'Ask for an outline or how to organize/structure the essay.' },
      { code: 'PL05', label: 'Expand on an existing idea', description: 'Ask the chatbot to develop or elaborate the student’s own idea.' },
      { code: 'PL06', label: 'Recommend topics to write about', description: 'Ask for topic or thesis suggestions to write about.' },
      { code: 'PL07', label: 'Help interpret the writing task/prompt', description: 'Ask the chatbot to clarify or interpret the assignment prompt.' },
      { code: 'PL08', label: 'Compare the essay to an alternative', description: 'Ask the chatbot to compare the essay (or idea) against an alternative.' },
    ],
  },
  {
    key: 'Translating',
    letter: 'T',
    label: 'Translating',
    description: "Turn the writer's own ideas into text.",
    subtypes: [
      { code: 'TR01', label: 'Write a paragraph given an idea', description: 'Ask the chatbot to write a paragraph from an idea the student supplies.' },
      { code: 'TR02', label: 'Complete an incomplete paragraph', description: 'Ask the chatbot to finish a partially written paragraph.' },
      { code: 'TR03', label: 'Write a sentence given an idea', description: 'Ask the chatbot to write a sentence from an idea the student supplies.' },
      { code: 'TR04', label: 'Suggest an expression/word', description: 'Ask for a word, phrase, or expression (word choice).' },
    ],
  },
  {
    key: 'Reviewing',
    letter: 'R',
    label: 'Reviewing',
    description: 'Evaluate or revise existing text the student supplied (theme unchanged).',
    subtypes: [
      { code: 'RE01', label: 'Proofread', description: 'Ask the chatbot to proofread the supplied text.' },
      { code: 'RE02', label: 'Answer a spelling/grammar question', description: 'Ask a specific spelling or grammar question.' },
      { code: 'RE03', label: 'Give feedback', description: 'Ask for feedback or evaluation of the supplied text.' },
      { code: 'RE04', label: 'Shorten text / remove some', description: 'Ask the chatbot to shorten or cut down the supplied text.' },
      { code: 'RE05', label: 'Rewrite existing text based on feedback', description: 'Ask the chatbot to rewrite supplied text per feedback (theme unchanged).' },
      { code: 'RE06', label: 'Improve the essay', description: 'Ask the chatbot to improve/polish the supplied essay generally.' },
      { code: 'RE07', label: 'Check if the essay meets the given criteria', description: 'Ask the chatbot to check the essay against given criteria/requirements.' },
    ],
  },
  {
    key: 'All',
    letter: 'A',
    label: 'All',
    description: 'A request spanning all three processes; the chatbot generates the essay or a portion of it (delegation / multi-activity).',
    subtypes: [
      { code: 'AL01', label: 'Generate an essay entirely', description: 'Ask the chatbot to generate the entire essay.' },
      { code: 'AL02', label: 'Write the conclusion', description: 'Ask the chatbot to write the conclusion.' },
      { code: 'AL03', label: 'Generate an alternative essay / revise based on feedback', description: 'Ask the chatbot to generate an alternative whole essay or regenerate based on feedback.' },
      { code: 'AL04', label: 'Generate a portion of an essay given a high-level idea', description: 'Ask the chatbot to generate a section/portion from a high-level idea.' },
      { code: 'AL05', label: 'Generate the entire essay given a perspective', description: 'Ask the chatbot to generate the whole essay given a stance/perspective.' },
      { code: 'AL06', label: 'Shorten/Lengthen the generated text', description: 'Ask the chatbot to shorten or lengthen text the chatbot generated.' },
      { code: 'AL07', label: 'Write the introduction', description: 'Ask the chatbot to write the introduction.' },
    ],
  },
];

export const SCORE_TYPE_KEYS: ScoreTypeKey[] = SCORE_TAXONOMY.map((t) => t.key);

export const SCORE_SUBTYPES: ScoreSubtype[] = SCORE_TAXONOMY.flatMap((t) => t.subtypes);

export const SCORE_SUBTYPE_CODES: string[] = SCORE_SUBTYPES.map((s) => s.code);

const SUBTYPE_BY_CODE = new Map<string, ScoreSubtype>(SCORE_SUBTYPES.map((s) => [s.code, s]));
const TYPE_BY_SUBTYPE = new Map<string, ScoreTypeKey>(
  SCORE_TAXONOMY.flatMap((t) => t.subtypes.map((s) => [s.code, t.key] as const))
);
const TYPE_BY_KEY = new Map<ScoreTypeKey, ScoreType>(SCORE_TAXONOMY.map((t) => [t.key, t]));

export function getSubtype(code: string | null | undefined): ScoreSubtype | undefined {
  if (!code) return undefined;
  return SUBTYPE_BY_CODE.get(code);
}

export function getTypeOfSubtype(code: string | null | undefined): ScoreTypeKey | undefined {
  if (!code) return undefined;
  return TYPE_BY_SUBTYPE.get(code);
}

export function getType(key: ScoreTypeKey): ScoreType | undefined {
  return TYPE_BY_KEY.get(key);
}

export function isValidSubtypeCode(code: string | null | undefined): boolean {
  return !!code && SUBTYPE_BY_CODE.has(code);
}

export function isValidTypeKey(key: string | null | undefined): key is ScoreTypeKey {
  return key === 'Planning' || key === 'Translating' || key === 'Reviewing' || key === 'All';
}

/** Short label for a subtype, e.g. "PL01 · Provide an answer to a question". */
export function subtypeLabel(code: string): string {
  const s = SUBTYPE_BY_CODE.get(code);
  return s ? `${s.code} · ${s.label}` : code;
}
