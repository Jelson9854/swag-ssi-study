'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  SCORE_TAXONOMY,
  type ScoreTypeKey,
  getSubtype,
  subtypeLabel,
} from '@/lib/score/taxonomy';
import { SCORE_MODELS, SCORE_MODEL_LABELS } from '@/lib/score/models';
import { SYSTEM_A, SYSTEM_B, buildQueryContent } from '@/lib/score/prompts';
import { Tooltip } from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
  Sparkles,
  Code2,
  X,
} from 'lucide-react';

export interface ScoreQueryRow {
  messageId: number;
  sessionId: string;
  participantToken: string;
  queryText: string;
  responseText: string | null;
  turnIndex: number;
  queryTimestamp: string;
  typeA: ScoreTypeKey | null;
  subtypeA: string | null;
  tagsB: string[];
  scoresB: Record<string, number>;
  model: string | null;
  rawA: string | null;
  rawB: string | null;
}

interface ScoreViewerProps {
  assignmentId: string;
  rows: ScoreQueryRow[];
  total: number;
  classified: number;
  defaultModel: string;
  openaiConfigured: boolean;
}

type Classifier = 'A' | 'B';

type Selection =
  | { kind: 'all' }
  | { kind: 'type'; key: ScoreTypeKey }
  | { kind: 'subtype'; code: string }
  | { kind: 'combo'; key: string } // B: an exact 2+ tag combination
  | { kind: 'unclassified' } // A: rows with no type (parse failure)
  | { kind: 'untagged' }; // B: rows with zero fired tags

const TYPE_STYLES: Record<ScoreTypeKey, { chip: string; dot: string }> = {
  Planning: { chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  Translating: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  Reviewing: { chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  All: { chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
};
const NEUTRAL_CHIP = 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]';

function chipForSubtype(code: string): string {
  const sub = getSubtype(code);
  const type = SCORE_TAXONOMY.find((t) => t.subtypes.some((s) => s.code === code))?.key;
  return sub && type ? TYPE_STYLES[type].chip : NEUTRAL_CHIP;
}

function truncate(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function comboKey(tags: string[]): string {
  return [...tags].sort().join('+');
}

export default function ScoreViewer({
  assignmentId,
  rows,
  total,
  classified,
  defaultModel,
  openaiConfigured,
}: ScoreViewerProps) {
  const router = useRouter();
  const [classifier, setClassifier] = useState<Classifier>('A');
  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<ScoreTypeKey>>(
    () => new Set(SCORE_TAXONOMY.map((t) => t.key))
  );
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sortMode, setSortMode] = useState<
    'recent' | 'oldest' | 'score-desc' | 'score-asc' | 'participant-asc' | 'participant-desc'
  >('recent');

  const remaining = Math.max(0, total - classified);

  // Run state
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ classified: number; total: number; failed: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Guard against state updates / refresh after the component unmounts mid-run.
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // ---- Counts -----------------------------------------------------------
  const counts = useMemo(() => {
    const typeA = new Map<ScoreTypeKey, number>();
    const subA = new Map<string, number>();
    const subB = new Map<string, number>();
    let unclassifiedA = 0;
    let untaggedB = 0;
    for (const r of rows) {
      if (r.typeA) typeA.set(r.typeA, (typeA.get(r.typeA) ?? 0) + 1);
      else unclassifiedA += 1;
      if (r.subtypeA) subA.set(r.subtypeA, (subA.get(r.subtypeA) ?? 0) + 1);
      if (r.tagsB.length === 0) untaggedB += 1;
      for (const code of r.tagsB) subB.set(code, (subB.get(code) ?? 0) + 1);
    }
    return { typeA, subA, subB, unclassifiedA, untaggedB };
  }, [rows]);

  // Multi-tag combinations (2+ tags), only those that actually occur. The point
  // of Classifier B is to surface genuinely multi-intent queries.
  const combos = useMemo(() => {
    const m = new Map<string, { codes: string[]; count: number }>();
    for (const r of rows) {
      if (r.tagsB.length >= 2) {
        const codes = [...r.tagsB].sort();
        const key = codes.join('+');
        const e = m.get(key);
        if (e) e.count += 1;
        else m.set(key, { codes, count: 1 });
      }
    }
    return Array.from(m.values())
      .filter((c) => c.count >= 1)
      .sort((a, b) => b.count - a.count || a.codes.length - b.codes.length);
  }, [rows]);

  // ---- Filtered middle column ------------------------------------------
  const filteredRows = useMemo(() => {
    switch (selection.kind) {
      case 'all':
        return rows;
      case 'unclassified':
        return rows.filter((r) => !r.typeA);
      case 'untagged':
        return rows.filter((r) => r.tagsB.length === 0);
      case 'type':
        return rows.filter((r) => r.typeA === selection.key);
      case 'combo':
        return rows.filter((r) => r.tagsB.length >= 2 && comboKey(r.tagsB) === selection.key);
      case 'subtype':
        return classifier === 'A'
          ? rows.filter((r) => r.subtypeA === selection.code)
          : rows.filter((r) => r.tagsB.includes(selection.code));
      default:
        return rows;
    }
  }, [rows, selection, classifier]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.messageId === selectedMessageId) ?? null,
    [rows, selectedMessageId]
  );

  // Middle column ordering. "Score" = the Classifier B 0-10 value relevant to the
  // current selection (the selected subtype's score; for a combination, the max
  // across its codes; otherwise the row's strongest signal).
  const sortedRows = useMemo(() => {
    const scoreOf = (r: ScoreQueryRow): number => {
      if (selection.kind === 'subtype') return r.scoresB[selection.code] ?? 0;
      if (selection.kind === 'combo') {
        return selection.key.split('+').reduce((m, c) => Math.max(m, r.scoresB[c] ?? 0), 0);
      }
      const vals = Object.values(r.scoresB);
      return vals.length ? Math.max(...vals) : 0;
    };
    const ts = (r: ScoreQueryRow) => new Date(r.queryTimestamp).getTime();
    const pc = (a: ScoreQueryRow, b: ScoreQueryRow) =>
      a.participantToken.localeCompare(b.participantToken, undefined, { numeric: true, sensitivity: 'base' });
    const arr = filteredRows.slice();
    switch (sortMode) {
      case 'recent':
        arr.sort((a, b) => ts(b) - ts(a));
        break;
      case 'oldest':
        arr.sort((a, b) => ts(a) - ts(b));
        break;
      case 'score-desc':
        arr.sort((a, b) => scoreOf(b) - scoreOf(a) || ts(b) - ts(a));
        break;
      case 'score-asc':
        arr.sort((a, b) => scoreOf(a) - scoreOf(b) || ts(b) - ts(a));
        break;
      case 'participant-asc':
        arr.sort((a, b) => pc(a, b) || ts(b) - ts(a));
        break;
      case 'participant-desc':
        arr.sort((a, b) => pc(b, a) || ts(b) - ts(a));
        break;
    }
    return arr;
  }, [filteredRows, sortMode, selection]);

  function switchClassifier(next: Classifier) {
    setClassifier(next);
    setSelection({ kind: 'all' });
  }

  // ---- Classification runner -------------------------------------------
  async function runClassification(force: boolean) {
    if (running) return;
    if (force && !window.confirm('Re-classify ALL queries? This discards cached results and makes new LLM calls.')) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRunError(null);
    setRunProgress({ classified, total, failed: 0 });
    let first = true;
    let totalFailed = 0;
    try {
      while (true) {
        const res = await fetch(
          `/api/instructor/assignments/${assignmentId}/score/classify`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: first && force, limit: 50, model: selectedModel }),
            signal: controller.signal,
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!mountedRef.current) return;
        if (!res.ok) {
          setRunError(typeof data?.message === 'string' ? data.message : 'Classification request failed.');
          break;
        }
        first = false;
        totalFailed += data.failed ?? 0;
        setRunProgress({ classified: data.classified, total: data.total, failed: totalFailed });
        if (data.remaining <= 0 || data.processed === 0) break;
        if ((data.succeeded ?? 0) === 0) {
          setRunError(`Classification stalled — ${data.failed ?? 0} queries failed this batch. Check the server logs.`);
          break;
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || !mountedRef.current) return;
      setRunError('Classification was interrupted. Please try again.');
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        router.refresh();
      }
    }
  }

  // ---- Render -----------------------------------------------------------
  return (
    <div className="space-y-4">
      <ControlBar
        classifier={classifier}
        onSwitch={switchClassifier}
        total={total}
        classified={classified}
        remaining={remaining}
        model={selectedModel}
        onModelChange={setSelectedModel}
        openaiConfigured={openaiConfigured}
        running={running}
        runProgress={runProgress}
        runError={runError}
        onRun={() => runClassification(false)}
        onRerun={() => runClassification(true)}
      />

      {classified === 0 ? (
        <EmptyState openaiConfigured={openaiConfigured} total={total} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.1fr)] gap-4 h-[calc(100vh-260px)] min-h-[520px]">
          {/* LEFT — intent list */}
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-y-auto">
            <SidebarHeader label={classifier === 'A' ? 'Type → Subtype' : 'Subtypes (multi-tag)'} count={rows.length} />
            <button
              onClick={() => setSelection({ kind: 'all' })}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-[hsl(var(--border))] ${
                selection.kind === 'all' ? 'bg-[hsl(var(--muted))] font-medium' : 'hover:bg-[hsl(var(--muted))]/50'
              }`}
            >
              <span>All queries</span>
              <CountBadge n={rows.length} />
            </button>

            {classifier === 'A'
              ? SCORE_TAXONOMY.map((type) => {
                  const isOpen = expanded.has(type.key);
                  const typeCount = counts.typeA.get(type.key) ?? 0;
                  return (
                    <div key={type.key} className="border-b border-[hsl(var(--border))]">
                      <div
                        className={`flex items-center ${
                          selection.kind === 'type' && selection.key === type.key
                            ? 'bg-[hsl(var(--muted))]'
                            : ''
                        }`}
                      >
                        <button
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(type.key)) next.delete(type.key);
                              else next.add(type.key);
                              return next;
                            })
                          }
                          className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                          aria-label={isOpen ? 'Collapse' : 'Expand'}
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setSelection({ kind: 'type', key: type.key })}
                          className="flex-1 text-left py-2 pr-3 text-sm font-medium flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${TYPE_STYLES[type.key].dot}`} />
                            {type.label}
                          </span>
                          <CountBadge n={typeCount} />
                        </button>
                      </div>
                      {isOpen && (
                        <div className="pb-1">
                          {type.subtypes.map((s) => {
                            const c = counts.subA.get(s.code) ?? 0;
                            const active = selection.kind === 'subtype' && selection.code === s.code;
                            return (
                              <button
                                key={s.code}
                                onClick={() => setSelection({ kind: 'subtype', code: s.code })}
                                className={`w-full text-left pl-9 pr-3 py-1.5 text-xs flex items-center justify-between ${
                                  active ? 'bg-[hsl(var(--muted))] font-medium' : 'hover:bg-[hsl(var(--muted))]/50'
                                } ${c === 0 ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}
                                title={s.description}
                              >
                                <span className="truncate">
                                  <span className="font-mono">{s.code}</span> {s.label}
                                </span>
                                <CountBadge n={c} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              : SCORE_TAXONOMY.map((type) => (
                  <div key={type.key} className="border-b border-[hsl(var(--border))]">
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] flex items-center gap-2 bg-[hsl(var(--muted))]/30">
                      <span className={`w-2 h-2 rounded-full ${TYPE_STYLES[type.key].dot}`} />
                      {type.label}
                    </div>
                    {type.subtypes.map((s) => {
                      const c = counts.subB.get(s.code) ?? 0;
                      const active = selection.kind === 'subtype' && selection.code === s.code;
                      return (
                        <button
                          key={s.code}
                          onClick={() => setSelection({ kind: 'subtype', code: s.code })}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between ${
                            active ? 'bg-[hsl(var(--muted))] font-medium' : 'hover:bg-[hsl(var(--muted))]/50'
                          } ${c === 0 ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}
                          title={s.description}
                        >
                          <span className="truncate">
                            <span className="font-mono">{s.code}</span> {s.label}
                          </span>
                          <CountBadge n={c} />
                        </button>
                      );
                    })}
                  </div>
                ))}

            {/* Unclassified (A) / Untagged (B) bucket */}
            {classifier === 'A' && counts.unclassifiedA > 0 && (
              <button
                onClick={() => setSelection({ kind: 'unclassified' })}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  selection.kind === 'unclassified' ? 'bg-[hsl(var(--muted))] font-medium' : 'hover:bg-[hsl(var(--muted))]/50'
                }`}
              >
                <span className="text-[hsl(var(--muted-foreground))]">Unclassified</span>
                <CountBadge n={counts.unclassifiedA} />
              </button>
            )}
            {classifier === 'B' && counts.untaggedB > 0 && (
              <button
                onClick={() => setSelection({ kind: 'untagged' })}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  selection.kind === 'untagged' ? 'bg-[hsl(var(--muted))] font-medium' : 'hover:bg-[hsl(var(--muted))]/50'
                }`}
              >
                <span className="text-[hsl(var(--muted-foreground))]">No tags fired</span>
                <CountBadge n={counts.untaggedB} />
              </button>
            )}

            {/* Multi-tag combinations (B only) */}
            {classifier === 'B' && combos.length > 0 && (
              <div className="border-t-4 border-[hsl(var(--border))]">
                <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]/30">
                  Multi-tag combinations ({combos.length})
                </div>
                {combos.map((combo) => {
                  const key = combo.codes.join('+');
                  const active = selection.kind === 'combo' && selection.key === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelection({ kind: 'combo', key })}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 ${
                        active ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted))]/50'
                      }`}
                    >
                      <span className="flex flex-wrap gap-1">
                        {combo.codes.map((c) => (
                          <Chip key={c} className={chipForSubtype(c)} tooltipHtml={tagTooltipHtml(c)}>
                            {c}
                          </Chip>
                        ))}
                      </span>
                      <CountBadge n={combo.count} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* MIDDLE — query list */}
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-y-auto">
            <div className="sticky top-0 z-10 px-3 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] truncate">
                {selectionLabel(selection, classifier, combos)}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                  title="Sort the query list"
                  className="text-xs border border-[hsl(var(--border))] rounded px-1.5 py-0.5 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  <option value="recent">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="participant-asc">Participant (P-001 → …)</option>
                  <option value="participant-desc">Participant (… → P-001)</option>
                  <option value="score-desc">Score (high → low)</option>
                  <option value="score-asc">Score (low → high)</option>
                </select>
                <CountBadge n={sortedRows.length} />
              </div>
            </div>
            {sortedRows.length === 0 ? (
              <p className="p-6 text-sm text-[hsl(var(--muted-foreground))]">No queries for this selection.</p>
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {sortedRows.map((r) => {
                  const active = r.messageId === selectedMessageId;
                  return (
                    <li key={r.messageId}>
                      <button
                        onClick={() => setSelectedMessageId(r.messageId)}
                        className={`w-full text-left px-3 py-2.5 ${
                          active ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted))]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
                            {r.participantToken || '—'}
                          </span>
                          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                            {new Date(r.queryTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-sm text-[hsl(var(--foreground))] leading-snug mb-1.5">
                          {truncate(r.queryText, 140)}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <RowTags row={r} classifier={classifier} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* RIGHT — response viewer */}
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-y-auto">
            {!selectedRow ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[hsl(var(--muted-foreground))]">
                <MessageSquare className="w-8 h-8 mb-3 opacity-50" />
                <p className="text-sm">Select a query to view the chatbot response.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="font-mono">{selectedRow.participantToken || '—'}</span>
                    <RowTags row={selectedRow} classifier={classifier} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span>{new Date(selectedRow.queryTimestamp).toLocaleString()}</span>
                    <button
                      onClick={() => setPreviewOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                      title="Show the prompt sent to the model and its result"
                    >
                      <Code2 className="w-3.5 h-3.5" /> Prompt &amp; result
                    </button>
                  </div>
                </div>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1.5">
                    Student query
                  </h3>
                  <p className="text-sm whitespace-pre-wrap rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3">
                    {selectedRow.queryText}
                  </p>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1.5">
                    Chatbot response
                  </h3>
                  {selectedRow.responseText && selectedRow.responseText.trim() ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-[hsl(var(--muted))] prose-pre:text-[hsl(var(--foreground))] prose-pre:border prose-pre:border-[hsl(var(--border))]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedRow.responseText}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-[hsl(var(--muted-foreground))] italic">No chatbot response was recorded for this query.</p>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedRow && (
        <PromptPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          row={selectedRow}
          initialClassifier={classifier}
        />
      )}

      <Tooltip id={TAG_TOOLTIP_ID} place="top" className="max-w-xs leading-snug" />
    </div>
  );
}

function selectionLabel(
  selection: Selection,
  classifier: Classifier,
  combos: { codes: string[]; count: number }[]
): string {
  switch (selection.kind) {
    case 'all':
      return 'All queries';
    case 'type':
      return `Type · ${selection.key}`;
    case 'subtype':
      return classifier === 'A' ? subtypeLabel(selection.code) : `Tag · ${subtypeLabel(selection.code)}`;
    case 'combo': {
      const combo = combos.find((c) => c.codes.join('+') === selection.key);
      return `Combination · ${combo ? combo.codes.join(' + ') : selection.key}`;
    }
    case 'unclassified':
      return 'Unclassified';
    case 'untagged':
      return 'No tags fired';
  }
}

// --------------------------------------------------------------------------
// Prompt & result preview modal
// --------------------------------------------------------------------------
function PromptPreviewModal({
  open,
  onClose,
  row,
  initialClassifier,
}: {
  open: boolean;
  onClose: () => void;
  row: ScoreQueryRow;
  initialClassifier: Classifier;
}) {
  const [which, setWhich] = useState<Classifier>(initialClassifier);
  useEffect(() => {
    if (open) setWhich(initialClassifier);
  }, [open, initialClassifier]);

  const system = which === 'A' ? SYSTEM_A : SYSTEM_B;
  const user = buildQueryContent(row.queryText, row.responseText);
  const raw = which === 'A' ? row.rawA : row.rawB;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
            <DialogTitle className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Prompt &amp; result
              {row.model && <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">({row.model})</span>}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-[hsl(var(--border))] overflow-hidden text-xs">
                {(['A', 'B'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setWhich(c)}
                    className={`px-2.5 py-1 font-medium ${
                      which === c
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'
                    } ${c === 'B' ? 'border-l border-[hsl(var(--border))]' : ''}`}
                  >
                    Classifier {c}
                  </button>
                ))}
              </div>
              <button onClick={onClose} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto px-4 py-3 space-y-4 text-sm">
            <PreBlock label="System prompt" text={system} />
            <PreBlock label="User message (query + context)" text={user} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1">
                Raw model output
              </p>
              {raw ? (
                <pre className="text-xs whitespace-pre-wrap break-words rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 max-h-60 overflow-y-auto">
                  {raw}
                </pre>
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))] italic">
                  Raw output was not stored for this row (classified before raw capture was added). Re-classify to capture it.
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1.5">
                Parsed result
              </p>
              {which === 'A' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {row.typeA ? (
                    <Chip className={TYPE_STYLES[row.typeA].chip}>{row.typeA}</Chip>
                  ) : (
                    <Chip className={NEUTRAL_CHIP}>unclassified</Chip>
                  )}
                  {row.subtypeA && <span className="text-sm">{subtypeLabel(row.subtypeA)}</span>}
                </div>
              ) : (
                <BScores row={row} />
              )}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function PreBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1">{label}</p>
      <pre className="text-xs whitespace-pre-wrap break-words rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 max-h-60 overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

function BScores({ row }: { row: ScoreQueryRow }) {
  const [showAll, setShowAll] = useState(false);
  const entries = Object.entries(row.scoresB)
    .filter(([, v]) => (showAll ? true : v > 0))
    .sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {row.tagsB.length > 0 ? (
          row.tagsB.map((code) => (
            <Chip key={code} className={chipForSubtype(code)}>
              {subtypeLabel(code)}
            </Chip>
          ))
        ) : (
          <Chip className={NEUTRAL_CHIP}>no tags fired</Chip>
        )}
      </div>
      {entries.length > 0 && (
        <div className="space-y-1 pt-1">
          {entries.map(([code, v]) => (
            <div key={code} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 font-mono text-[hsl(var(--muted-foreground))]">{code}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                <div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${(v / 10) * 100}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums text-[hsl(var(--muted-foreground))]">{v}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setShowAll((s) => !s)} className="text-xs text-[hsl(var(--primary))] hover:underline">
        {showAll ? 'Show only scored' : 'Show all 26 scores'}
      </button>
    </div>
  );
}

function ControlBar(props: {
  classifier: Classifier;
  onSwitch: (c: Classifier) => void;
  total: number;
  classified: number;
  remaining: number;
  model: string;
  onModelChange: (m: string) => void;
  openaiConfigured: boolean;
  running: boolean;
  runProgress: { classified: number; total: number; failed: number } | null;
  runError: string | null;
  onRun: () => void;
  onRerun: () => void;
}) {
  const {
    classifier,
    onSwitch,
    total,
    classified,
    remaining,
    model,
    onModelChange,
    openaiConfigured,
    running,
    runProgress,
    runError,
    onRun,
    onRerun,
  } = props;
  const pct = total > 0 ? Math.round((classified / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Classifier toggle */}
      <div className="inline-flex rounded-md border border-[hsl(var(--border))] overflow-hidden self-start">
        <button
          onClick={() => onSwitch('A')}
          className={`px-3 py-1.5 text-sm font-medium ${
            classifier === 'A'
              ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
              : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'
          }`}
        >
          Classifier A · single
        </button>
        <button
          onClick={() => onSwitch('B')}
          className={`px-3 py-1.5 text-sm font-medium border-l border-[hsl(var(--border))] ${
            classifier === 'B'
              ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
              : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'
          }`}
        >
          Classifier B · multi-tag
        </button>
      </div>

      {/* Status + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          <span className="font-medium text-[hsl(var(--foreground))]">
            {running && runProgress ? runProgress.classified : classified}
          </span>
          /{total} classified
          {running && runProgress && runProgress.failed > 0 && (
            <span className="text-[hsl(var(--destructive))]"> · {runProgress.failed} failed</span>
          )}
        </div>
        {total > 0 && (
          <div className="w-28 h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
            <div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${running && runProgress ? Math.round((runProgress.classified / Math.max(1, runProgress.total)) * 100) : pct}%` }} />
          </div>
        )}

        {/* Model picker */}
        <label className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="hidden sm:inline">Model</span>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={running}
            className="border border-[hsl(var(--border))] rounded px-2 py-1 text-sm bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
          >
            {(SCORE_MODELS as readonly string[]).map((m) => (
              <option key={m} value={m}>
                {SCORE_MODEL_LABELS[m] ?? m}
              </option>
            ))}
            {!(SCORE_MODELS as readonly string[]).includes(model) && <option value={model}>{model}</option>}
          </select>
        </label>

        {!openaiConfigured ? (
          <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--destructive))]">
            <AlertTriangle className="w-3.5 h-3.5" /> OPENAI_API_KEY not set
          </span>
        ) : remaining > 0 ? (
          <button
            onClick={onRun}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Classifying…' : `Classify ${remaining} remaining`}
          </button>
        ) : (
          <button
            onClick={onRerun}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Re-classify all
          </button>
        )}
      </div>
      {runError && (
        <p className="w-full text-xs text-[hsl(var(--destructive))] sm:order-last">{runError}</p>
      )}
    </div>
  );
}

function EmptyState({ openaiConfigured, total }: { openaiConfigured: boolean; total: number }) {
  return (
    <div className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-12 text-center">
      <div className="w-14 h-14 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-7 h-7 text-[hsl(var(--muted-foreground))]" />
      </div>
      <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-1">No classifications yet</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-md mx-auto">
        This assignment has <span className="font-medium text-[hsl(var(--foreground))]">{total}</span> student
        {total === 1 ? ' query' : ' queries'}. Run the classifier to label each one with both the hierarchical (A)
        and multi-tag (B) schemes, then browse them here.
      </p>
      {!openaiConfigured && (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-[hsl(var(--destructive))]">
          <AlertTriangle className="w-3.5 h-3.5" /> Set OPENAI_API_KEY on the server to enable classification.
        </p>
      )}
      {total === 0 && (
        <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
          There are no chatbot queries in this assignment&apos;s logs yet.
        </p>
      )}
      <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">Use the “Classify” button above to start.</p>
    </div>
  );
}

function SidebarHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 px-3 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] truncate">{label}</span>
      <CountBadge n={count} />
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
      {n}
    </span>
  );
}

const TAG_TOOLTIP_ID = 'score-tag-tooltip';

function Chip({
  children,
  className = '',
  tooltipHtml,
}: {
  children: React.ReactNode;
  className?: string;
  tooltipHtml?: string;
}) {
  return (
    <span
      {...(tooltipHtml ? { 'data-tooltip-id': TAG_TOOLTIP_ID, 'data-tooltip-html': tooltipHtml } : {})}
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium font-mono ${tooltipHtml ? 'cursor-help' : ''} ${className}`}
    >
      {children}
    </span>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Hover tooltip HTML for a subtype tag: code · label, its description, and (optionally) the score. */
function tagTooltipHtml(code: string, score?: number): string {
  const s = getSubtype(code);
  const head = escapeHtml(s ? `${s.code} · ${s.label}` : code);
  const desc = s ? `<div>${escapeHtml(s.description)}</div>` : '';
  const sc = score === undefined ? '' : `<div style="opacity:.7;margin-top:2px">Score: ${score}/10</div>`;
  return `<div style="font-weight:600">${head}</div>${desc}${sc}`;
}

/** The classification tag chip(s) for a row, under the active classifier. */
function RowTags({ row, classifier }: { row: ScoreQueryRow; classifier: Classifier }) {
  if (classifier === 'A') {
    if (row.subtypeA) {
      return (
        <Chip className={chipForSubtype(row.subtypeA)} tooltipHtml={tagTooltipHtml(row.subtypeA)}>
          {row.subtypeA}
        </Chip>
      );
    }
    if (row.typeA) {
      return (
        <Chip className={TYPE_STYLES[row.typeA].chip} tooltipHtml={`<div style="font-weight:600">Type · ${row.typeA}</div>`}>
          {row.typeA}
        </Chip>
      );
    }
    return <Chip className={NEUTRAL_CHIP}>unclassified</Chip>;
  }
  if (row.tagsB.length === 0) {
    return <Chip className={NEUTRAL_CHIP}>no tags</Chip>;
  }
  return (
    <>
      {row.tagsB
        .slice()
        .sort((a, b) => (row.scoresB[b] ?? 0) - (row.scoresB[a] ?? 0))
        .map((code) => (
          <Chip key={code} className={chipForSubtype(code)} tooltipHtml={tagTooltipHtml(code, row.scoresB[code])}>
            {code}
            <span className="ml-1 font-sans opacity-60">{row.scoresB[code] ?? 0}</span>
          </Chip>
        ))}
    </>
  );
}
