/**
 * SCORE classifier prompt construction (config-driven, with few-shot examples).
 *
 * Kept separate from classifier.ts (which imports the OpenAI SDK) so the viewer
 * can rebuild the exact prompt that was sent — for the prompt/result preview
 * modal — without bundling `openai` into the client. Client-safe.
 *
 * Few-shot examples come from the (editable) config and are placed in the SYSTEM
 * prompt, which is identical across queries → OpenAI prompt caching applies, so
 * the extra tokens are largely free after the first call.
 */
import type { ScoreConfig } from './config';
import { allCodes } from './config';

export const MAX_QUERY_CHARS = 4000;
export const MAX_RESPONSE_CONTEXT_CHARS = 1200;

export function buildTaxonomyText(config: ScoreConfig): string {
  return config.types
    .map((t) => {
      const header = `${t.label} (${t.letter}) — ${t.description}`;
      const lines = t.subtypes.map((s) => `  - ${s.code} ${s.label}: ${s.description}`);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}

function fewShotA(config: ScoreConfig): string {
  const lines: string[] = [];
  for (const t of config.types) {
    for (const s of t.subtypes) {
      for (const ex of s.examples) {
        lines.push(`Q: ${JSON.stringify(ex)}\nA: {"type":"${t.key}","subtype":"${s.code}"}`);
      }
    }
  }
  return lines.length
    ? `\n\nLABELED EXAMPLES (each query and its single correct classification):\n${lines.join('\n')}`
    : '';
}

function fewShotB(config: ScoreConfig): string {
  const lines: string[] = [];
  for (const t of config.types) {
    for (const s of t.subtypes) {
      for (const ex of s.examples) {
        lines.push(
          `Q: ${JSON.stringify(ex)}\nA: subtype ${s.code} clearly applies (score it high, ~9; unrelated subtypes near 0).`
        );
      }
    }
  }
  return lines.length
    ? `\n\nLABELED EXAMPLES (each query and the subtype that best applies):\n${lines.join('\n')}`
    : '';
}

/** System prompt for Classifier A — hierarchical single-label. */
export function buildSystemA(config: ScoreConfig): string {
  return `You are an expert annotator classifying student-to-chatbot writing queries by intent.

Classify the STUDENT QUERY into exactly ONE Type and exactly ONE Subtype within that Type. Pick the single best fit; if the query spans several writing activities or delegates whole-essay generation to the chatbot, use the "All" type.

Taxonomy:
${buildTaxonomyText(config)}${fewShotA(config)}

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"type": "Planning|Translating|Reviewing|All", "subtype": "<one subtype code>"}
The subtype MUST belong to the chosen type.`;
}

/** System prompt for Classifier B — per-subtype multi-tag (0-10 scores). */
export function buildSystemB(config: ScoreConfig): string {
  const codes = allCodes(config);
  const exampleShape = `{${codes.slice(0, 3).map((c) => `"${c}": 0`).join(', ')}}`;
  return `You are an expert annotator classifying student-to-chatbot writing queries by intent.

For the STUDENT QUERY, independently rate EACH subtype below from 0 to 10 for how strongly the query includes that kind of request (0 = clearly absent, 10 = clearly the main request). A single query may genuinely include several kinds of requests — score each one on its own merits; do not force them to sum to anything.

Taxonomy:
${buildTaxonomyText(config)}${fewShotB(config)}

Respond with ONLY a JSON object, no prose: keys are ALL of these subtype codes, values are integers 0-10. Example shape (values illustrative):
${exampleShape}
Include every one of these codes: ${codes.join(', ')}.`;
}

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
