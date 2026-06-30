/**
 * SCORE classifier prompt construction.
 *
 * Kept separate from classifier.ts (which imports the OpenAI SDK) so the viewer
 * can rebuild the exact prompt that was sent — for the prompt/result preview
 * modal — without bundling `openai` into the client. Imports only the
 * client-safe taxonomy module.
 */
import { SCORE_TAXONOMY, SCORE_SUBTYPE_CODES } from './taxonomy';

export const MAX_QUERY_CHARS = 4000;
export const MAX_RESPONSE_CONTEXT_CHARS = 1200;

function buildTaxonomyText(): string {
  return SCORE_TAXONOMY.map((t) => {
    const header = `${t.label} (${t.letter}) — ${t.description}`;
    const lines = t.subtypes.map((s) => `  - ${s.code} ${s.label}: ${s.description}`);
    return [header, ...lines].join('\n');
  }).join('\n\n');
}

export const TAXONOMY_TEXT = buildTaxonomyText();

/** Build the user message (query + optional response context) for a classifier call. */
export function buildQueryContent(queryText: string, responseText: string | null): string {
  const query = queryText.slice(0, MAX_QUERY_CHARS);
  let content = `STUDENT QUERY (the message to classify):\n"""\n${query}\n"""`;
  if (responseText && responseText.trim()) {
    const response = responseText.slice(0, MAX_RESPONSE_CONTEXT_CHARS);
    content += `\n\nCHATBOT RESPONSE (context only — do NOT classify this, only the query):\n"""\n${response}\n"""`;
  }
  return content;
}

// --------------------------------------------------------------------------
// Classifier A — hierarchical single-label
// --------------------------------------------------------------------------
export const SYSTEM_A = `You are an expert annotator classifying student-to-chatbot writing queries by intent.

Classify the STUDENT QUERY into exactly ONE Type and exactly ONE Subtype within that Type. Pick the single best fit; if the query spans several writing activities or delegates whole-essay generation to the chatbot, use the "All" type.

Taxonomy:
${TAXONOMY_TEXT}

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"type": "Planning|Translating|Reviewing|All", "subtype": "<one subtype code such as PL01>"}
The subtype MUST belong to the chosen type.`;

// --------------------------------------------------------------------------
// Classifier B — per-subtype binary multi-tag (0-10 scores)
// --------------------------------------------------------------------------
export const SYSTEM_B = `You are an expert annotator classifying student-to-chatbot writing queries by intent.

For the STUDENT QUERY, independently rate EACH of the 26 subtypes from 0 to 10 for how strongly the query includes that kind of request (0 = clearly absent, 10 = clearly the main request). A single query may genuinely include several kinds of requests — score each one on its own merits; do not force them to sum to anything.

Taxonomy:
${TAXONOMY_TEXT}

Respond with ONLY a JSON object, no prose: keys are ALL 26 subtype codes, values are integers 0-10. Example shape (values illustrative):
{"PL01": 0, "PL02": 8, "PL03": 0, "TR01": 0, "RE03": 6, "AL01": 0}
Include every one of these codes: ${SCORE_SUBTYPE_CODES.join(', ')}.`;
