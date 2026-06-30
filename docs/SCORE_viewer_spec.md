# SCORE — Viewer Page Spec (for SWAG implementation)

*Scope: a read-only **viewer** that classifies an assignment's student–chatbot queries by intent (Jelson taxonomy) and browses them in a 3-column layout. Two classifiers are implemented side by side for comparison. No intent creation, rule editing, or deployment yet.*

---

## 0. Terminology note (read first — the two classifiers)

To avoid confusion, this spec uses unambiguous names. Mapping to how they were discussed:

| Spec name | Discussed as | Behavior |
|---|---|---|
| **Classifier A — Hierarchical (single assignment)** | "multi-label / 교수님 안" | Each query → exactly **one Type** (P/T/R/A), then exactly **one Subtype** within that type. (This is Jelson's own coding scheme; the "All" type absorbs multi-activity queries.) |
| **Classifier B — Per-subtype binary (multi-tag)** | "여러 개의 single-label classifier / 내 안" | For **each Subtype**, a binary yes/no. A query receives **all subtype tags that fire** (0, 1, or many). A query can carry tags from multiple types. |

The point of building both is to measure, on real SWAG/NIRVANA data, how often a query is genuinely multi-intent (B gives several tags) vs cleanly single (A and B agree).

---

## 1. Goal

For a given assignment, load its deployed student–chatbot interaction logs, classify each student query with both classifiers (cached), and let the instructor browse: **Intent list → queries under that intent → the chatbot response for a query.**

---

## 2. Entry point / navigation

- On the **instructor Assignments page** (per-assignment row or the assignment detail view), add a **"SCORE"** button.
- Clicking it navigates to the SCORE page for that assignment, e.g. `/instructor/assignments/:assignmentId/score`.
- The SCORE page operates on **that assignment's** logs only.

---

## 3. Data input

Read from SWAG's existing interaction logs for the assignment. Per **query record** the viewer needs:

- `query_text` — the student's message to the chatbot.
- `response_text` — the chatbot's reply to that message (the **most recent** deployed response, not a default).
- `session_id` / `student_id`, `turn_index`, `timestamp` — for grouping/ordering.

A "query" = one student message + its chatbot response (single Q–A). Full multi-turn context is **out of scope** for this viewer (single Q–A only); keep `session_id`/`turn_index` so it can be added later.

---

## 4. Classification (batch, cached)

- Run **once per assignment** (e.g., on first open or as a background job) and **cache** the results per query. Do not re-classify on every page load.
- Classifier = an **LLM call** (model configurable; temperature 0). Provide the Jelson definitions (Appendix A) in the prompt.
- Run **both** classifiers over the same query set and store both results per query.

**Classifier A — Hierarchical (single assignment)**
- Step 1: classify the query into one of `Planning | Translating | Reviewing | All`.
- Step 2: classify into one Subtype within the chosen Type.
- Store: `{ type, subtype }` (exactly one each).

**Classifier B — Per-subtype binary (multi-tag)**
- For each of the 26 subtypes, decide **yes/no** (does this query include this kind of request?).
- Implementation: a single LLM call returning a yes/no (or 0–10 score) for every subtype is fine and cheaper than 26 calls. If using scores, also store the score (useful for later threshold/ambiguity analysis).
- Store: `subtype_tags: [ ... ]` (the set of subtypes that fired; may be empty or several across types).
- *Note for us (not a blocker):* in B, the `All` subtypes (AL01–07) may overlap with simultaneous P/T/R tags. Keep all 26 for now; observing this overlap in real data is part of the point.

---

## 5. UI — 3-column viewer

Top of page: a **classifier toggle**: `[ Classifier A (single) | Classifier B (multi-tag) ]`. The whole view reflects the selected classifier.

**Left column — Intent list**
- *Classifier A:* the **Type → Subtype hierarchy** (4 Types, each expandable to its subtypes). Show a query count next to each node. Selecting a Type shows all its queries; selecting a Subtype narrows to that subtype.
- *Classifier B:* a **flat subtype list** (optionally grouped under their Type headers for readability), each with a query count. Selecting a subtype filters the middle column to queries carrying that tag. (A query may appear under several subtypes here.)

**Middle column — Query list**
- The queries belonging to the selected intent, newest first (or by relevance/count).
- Each row: truncated `query_text` + its tag(s):
  - A: the single Type/Subtype label.
  - B: all subtype tags on the query (chips).
- Selecting a row loads its response into the right column.

**Right column — Response viewer (read-only)**
- Shows the selected query's `response_text` (most recent). Show the `query_text` above it for context.
- Read-only — no editing in this phase.

---

## 6. Out of scope (this phase)

- Adding / editing / deleting intents (the intent set = fixed Jelson taxonomy).
- Editing rules, conflict resolution, simulation, deployment.
- Multi-turn conversation view, search/triage scoring, feedback inputs.

(These are the next phases; the viewer is the foundation.)

---

## Appendix A — Jelson query taxonomy (the intent set)

Four Types (single-label coding in Jelson, κ=.89). Subtype descriptions paraphrased from Jelson et al., Tables 1–4. Counts shown as *(% of participants who used the code)* for reference.

**Planning (P)** — set goals / plan; get information or ideas *before/around* writing.
- PL01 Provide an answer to a question (15.6%)
- PL02 Provide examples (15.6%)
- PL03 Search for factual information (10.4%)
- PL04 Suggest an essay structure (9.1%)
- PL05 Expand on an existing idea (9.1%)
- PL06 Recommend topics to write about (5.2%)
- PL07 Help interpret the writing task/prompt (5.2%)
- PL08 Compare the essay to an alternative (2.6%)

**Translating (T)** — turn the writer's *own* ideas into text.
- TR01 Write a paragraph given an idea (9.1%)
- TR02 Complete an incomplete paragraph (7.8%)
- TR03 Write a sentence given an idea (3.9%)
- TR04 Suggest an expression/word (2.6%)

**Reviewing (R)** — evaluate or revise *existing* text the student supplied (theme unchanged).
- RE01 Proofread (20.8%)
- RE02 Answer a spelling/grammar question (13.0%)
- RE03 Give feedback (9.1%)
- RE04 Shorten text / remove some (9.1%)
- RE05 Rewrite existing text based on feedback (7.8%)
- RE06 Improve the essay (7.8%)
- RE07 Check if the essay meets the given criteria (3.9%)

**All (A)** — request spanning all three processes; ChatGPT generates the essay or a portion. (Jelson's catch-all for multi-activity / delegation.)
- AL01 Generate an essay entirely (26.0%)
- AL02 Write the conclusion (16.9%)
- AL03 Generate an alternative essay / revise based on feedback (15.6%)
- AL04 Generate a portion of an essay given a high-level idea (14.3%)
- AL05 Generate the entire essay given a perspective (10.4%)
- AL06 Shorten/Lengthen the generated text (9.1%)
- AL07 Write the introduction (5.2%)

*(26 subtypes total: P 8 / T 4 / R 7 / A 7.)*
