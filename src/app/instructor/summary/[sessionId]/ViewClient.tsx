'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Step, StepMap } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

type AuthorshipOrigin = 'user' | 'gpt';
type PasteSourceArea = 'chat' | 'editor' | 'instruction' | 'external' | 'unknown';
type PasteTargetArea = 'editor' | 'chat';

interface SummaryEditorEvent {
  id: number;
  eventType: string;
  eventData: unknown;
  timestamp: Date | string;
  sequenceNumber: number;
}

interface SubmissionWordBreakdown {
  submissionId: number | null;
  totalWords: number;
  userWords: number;
  gptWords: number;
}

interface SubmissionContributionMetrics {
  submissionId: number | null;
  ha: number;
  hd: number;
  gp: number;
  gd: number;
  hcr: number | null;
  her: number | null;
  isExact: boolean;
}

interface TypingOpEventData {
  stepJson?: Record<string, unknown>;
  source?: 'user' | 'gpt';
  docContentSize?: number;
  addedWords?: number;
  deletedUserWords?: number;
  deletedGptWords?: number;
}

interface AuthorshipRange {
  from: number;
  to: number;
  origin: AuthorshipOrigin;
}

interface SummaryAuthorshipOverlayState {
  enabled: boolean;
  ranges: AuthorshipRange[];
}

interface SubmissionAuthorshipAnalysis {
  wordBreakdownById: Map<number, SubmissionWordBreakdown>;
  rangesBySubmissionId: Map<number, AuthorshipRange[]>;
  contributionById: Map<number, SubmissionContributionMetrics>;
}

interface ViewClientProps {
  finalDocument: Record<string, unknown>[];
  submissions: Array<{
    id: number;
    eventData: Record<string, unknown>[];
    timestamp: Date | string;
    sequenceNumber: number;
  }>;
  events: SummaryEditorEvent[];
  selectedSubmissionId: number | null;
  onSelectSubmissionId: (submissionId: number | null) => void;
  onSubmissionWordBreakdownChange?: (wordBreakdown: SubmissionWordBreakdown | null) => void;
  onSubmissionContributionMetricsChange?: (metrics: SubmissionContributionMetrics | null) => void;
}

const clampPmPosition = (position: number, maxPosition: number): number => {
  if (!Number.isFinite(position)) return 0;
  return Math.min(Math.max(0, Math.floor(position)), maxPosition);
};

const mergeAuthorshipRanges = (ranges: AuthorshipRange[]): AuthorshipRange[] => {
  if (ranges.length === 0) return [];

  const normalized = ranges
    .filter((range) => Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from)
    .map((range) => ({
      ...range,
      from: Math.floor(range.from),
      to: Math.floor(range.to),
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to);

  if (normalized.length === 0) return [];

  const merged: AuthorshipRange[] = [normalized[0]];
  for (let i = 1; i < normalized.length; i += 1) {
    const current = normalized[i];
    const last = merged[merged.length - 1];

    if (current.from <= last.to && current.origin === last.origin) {
      last.to = Math.max(last.to, current.to);
      continue;
    }

    merged.push(current);
  }

  return merged;
};

const cloneAuthorshipRanges = (ranges: AuthorshipRange[]): AuthorshipRange[] => {
  return ranges.map((range) => ({
    from: range.from,
    to: range.to,
    origin: range.origin,
  }));
};

const summaryAuthorshipPluginKey = new PluginKey<SummaryAuthorshipOverlayState>('summaryAuthorshipOverlay');

const createSummaryAuthorshipPlugin = () => {
  return new Plugin<SummaryAuthorshipOverlayState>({
    key: summaryAuthorshipPluginKey,
    state: {
      init: () => ({ enabled: false, ranges: [] }),
      apply: (tr, value) => {
        const meta = tr.getMeta(summaryAuthorshipPluginKey) as SummaryAuthorshipOverlayState | undefined;
        return meta ?? value;
      },
    },
    props: {
      decorations(state) {
        const overlay = summaryAuthorshipPluginKey.getState(state);
        if (!overlay?.enabled) {
          return null;
        }

        const maxPosition = state.doc.content.size;
        if (maxPosition <= 0) {
          return null;
        }

        const normalized = mergeAuthorshipRanges(
          overlay.ranges
            .map((range) => ({
              from: clampPmPosition(range.from, maxPosition),
              to: clampPmPosition(range.to, maxPosition),
              origin: range.origin,
            }))
            .filter((range) => range.to > range.from)
        );

        const completed: AuthorshipRange[] = [];
        let cursor = 0;

        normalized.forEach((range) => {
          const start = Math.max(cursor, range.from);
          if (start > cursor) {
            completed.push({
              from: cursor,
              to: start,
              origin: 'user',
            });
          }

          if (range.to > start) {
            completed.push({
              from: start,
              to: range.to,
              origin: range.origin,
            });
            cursor = range.to;
          }
        });

        if (cursor < maxPosition) {
          completed.push({
            from: cursor,
            to: maxPosition,
            origin: 'user',
          });
        }

        const decorations = completed.map((range) => Decoration.inline(range.from, range.to, {
          style: range.origin === 'gpt'
            ? 'background-color: rgba(251, 191, 36, 0.30); border-radius: 2px;'
            : 'background-color: rgba(34, 197, 94, 0.22); border-radius: 2px;',
        }));

        if (decorations.length === 0) {
          return null;
        }

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
};

const removeAuthorshipRange = (
  ranges: AuthorshipRange[],
  removeFrom: number,
  removeTo: number
): AuthorshipRange[] => {
  if (removeTo <= removeFrom || ranges.length === 0) return ranges;

  const next: AuthorshipRange[] = [];
  ranges.forEach((range) => {
    if (removeTo <= range.from || removeFrom >= range.to) {
      next.push(range);
      return;
    }

    if (range.from < removeFrom) {
      next.push({
        from: range.from,
        to: removeFrom,
        origin: range.origin,
      });
    }

    if (removeTo < range.to) {
      next.push({
        from: removeTo,
        to: range.to,
        origin: range.origin,
      });
    }
  });

  return mergeAuthorshipRanges(next);
};

const mapAuthorshipRangesThroughStepMap = (
  ranges: AuthorshipRange[],
  stepMap: StepMap,
  maxPosition: number
): AuthorshipRange[] => {
  const mapped: AuthorshipRange[] = [];

  ranges.forEach((range) => {
    const from = clampPmPosition(stepMap.map(range.from, 1), maxPosition);
    const to = clampPmPosition(stepMap.map(range.to, -1), maxPosition);
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    if (end > start) {
      mapped.push({
        from: start,
        to: end,
        origin: range.origin,
      });
    }
  });

  return mergeAuthorshipRanges(mapped);
};

const applyStepToAuthorshipRanges = (
  ranges: AuthorshipRange[],
  stepMap: StepMap,
  origin: AuthorshipOrigin,
  maxPosition: number
): AuthorshipRange[] => {
  let next = mapAuthorshipRangesThroughStepMap(ranges, stepMap, maxPosition);

  stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
    const from = clampPmPosition(newStart, maxPosition);
    const to = clampPmPosition(newEnd, maxPosition);
    if (to <= from) return;

    next = removeAuthorshipRange(next, from, to);
    next.push({
      from,
      to,
      origin,
    });
  });

  return mergeAuthorshipRanges(next);
};

const computeGptShareFromAuthorshipRanges = (
  ranges: AuthorshipRange[],
  docContentSize: number
): number => {
  if (docContentSize <= 0) return 0;

  const normalized = mergeAuthorshipRanges(
    ranges
      .map((range) => ({
        from: clampPmPosition(range.from, docContentSize),
        to: clampPmPosition(range.to, docContentSize),
        origin: range.origin,
      }))
      .filter((range) => range.to > range.from)
  );

  const gptSpan = normalized.reduce((sum, range) => (
    range.origin === 'gpt' ? sum + (range.to - range.from) : sum
  ), 0);

  return Math.max(0, Math.min(1, gptSpan / docContentSize));
};

const extractBlockNoteText = (value: unknown): string => {
  const parts: string[] = [];

  const walk = (node: unknown, parentKey?: string) => {
    if (typeof node === 'string') {
      if (parentKey === 'text' || parentKey === 'content') {
        parts.push(node);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, parentKey));
      return;
    }

    if (node && typeof node === 'object') {
      Object.entries(node as Record<string, unknown>).forEach(([key, child]) => {
        walk(child, key);
      });
    }
  };

  walk(value);
  return parts.join(' ');
};

const countWordsFromDocument = (document: unknown): number => {
  const plainText = extractBlockNoteText(document)
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) {
    return 0;
  }

  return plainText.split(' ').length;
};

const normalizePasteSourceArea = (sourceArea: unknown, eventType: string): PasteSourceArea => {
  if (
    sourceArea === 'chat' ||
    sourceArea === 'editor' ||
    sourceArea === 'instruction' ||
    sourceArea === 'external' ||
    sourceArea === 'unknown'
  ) {
    return sourceArea;
  }
  return eventType === 'paste_external' ? 'external' : 'unknown';
};

const normalizePasteTargetArea = (targetArea: unknown): PasteTargetArea => {
  return targetArea === 'chat' ? 'chat' : 'editor';
};

const toTimestampMs = (timestamp: Date | string): number => {
  const value = new Date(timestamp).getTime();
  if (Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const SUMMARY_AUTHORSHIP_HIGHLIGHT_STORAGE_KEY = 'swag:summary:authorship-highlight';

export default function ViewClient({
  finalDocument,
  submissions,
  events,
  selectedSubmissionId,
  onSelectSubmissionId,
  onSubmissionWordBreakdownChange,
  onSubmissionContributionMetricsChange,
}: ViewClientProps) {
  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [submissions]
  );

  const selectedSubmission = sortedSubmissions.find((submission) => submission.id === selectedSubmissionId) || null;
  const documentToShow = selectedSubmission?.eventData || finalDocument;
  const lastReportedWordBreakdownKeyRef = useRef<string>('');
  const lastReportedContributionKeyRef = useRef<string>('');
  const authorshipPluginRegisteredRef = useRef(false);
  const lastAppliedOverlayKeyRef = useRef('init');
  const [showAuthorshipHighlight, setShowAuthorshipHighlight] = useState(false);

  const editor = useCreateBlockNote({
    initialContent: documentToShow.length > 0 ? documentToShow : undefined,
  });

  useEffect(() => {
    if (!editor) return;
    const currentDoc = editor.document;
    if (JSON.stringify(currentDoc) === JSON.stringify(documentToShow)) return;
    editor.replaceBlocks(editor.document, documentToShow);
  }, [editor, documentToShow]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(SUMMARY_AUTHORSHIP_HIGHLIGHT_STORAGE_KEY);
    if (stored === null) return;
    const normalized = stored.toLowerCase();
    setShowAuthorshipHighlight(normalized === '1' || normalized === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      SUMMARY_AUTHORSHIP_HIGHLIGHT_STORAGE_KEY,
      showAuthorshipHighlight ? '1' : '0'
    );
  }, [showAuthorshipHighlight]);

  useEffect(() => {
    if (!editor) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = (editor as any)._tiptapEditor;
      if (!tiptapEditor || typeof tiptapEditor.registerPlugin !== 'function') {
        return;
      }

      if (!authorshipPluginRegisteredRef.current) {
        tiptapEditor.registerPlugin(createSummaryAuthorshipPlugin());
        authorshipPluginRegisteredRef.current = true;
      }
    } catch {
      // Ignore plugin registration failures in readonly summary view.
    }
  }, [editor]);

  const typingOriginBySequence = useMemo(() => {
    const origins = new Map<number, AuthorshipOrigin>();

    const gptPasteEvents = events
      .filter((event) => event.eventType === 'paste_internal')
      .filter((event) => {
        const eventData = (event.eventData || {}) as { sourceArea?: unknown; targetArea?: unknown };
        return (
          normalizePasteSourceArea(eventData.sourceArea, event.eventType) === 'chat' &&
          normalizePasteTargetArea(eventData.targetArea) === 'editor'
        );
      })
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    const typingEvents = events
      .filter((event) => event.eventType === 'typing_op')
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    typingEvents.forEach((event) => {
      const eventData = (event.eventData || {}) as TypingOpEventData;
      if (eventData.source === 'gpt' || eventData.source === 'user') {
        origins.set(event.sequenceNumber, eventData.source);
        return;
      }

      const eventTime = toTimestampMs(event.timestamp);
      let matchedGptPaste = false;
      for (let i = gptPasteEvents.length - 1; i >= 0; i -= 1) {
        const pasteEvent = gptPasteEvents[i];
        if (pasteEvent.sequenceNumber > event.sequenceNumber) {
          continue;
        }

        const sequenceDelta = event.sequenceNumber - pasteEvent.sequenceNumber;
        if (sequenceDelta > 40) {
          break;
        }

        const timeDelta = eventTime - toTimestampMs(pasteEvent.timestamp);
        if (timeDelta >= 0 && timeDelta <= 1500) {
          matchedGptPaste = true;
          break;
        }
      }

      origins.set(event.sequenceNumber, matchedGptPaste ? 'gpt' : 'user');
    });

    return origins;
  }, [events]);

  const submissionAuthorshipAnalysis = useMemo<SubmissionAuthorshipAnalysis>(() => {
    const breakdownById = new Map<number, SubmissionWordBreakdown>();
    const rangesBySubmissionId = new Map<number, AuthorshipRange[]>();
    const contributionById = new Map<number, SubmissionContributionMetrics>();
    const sortedEvents = [...events].sort((a, b) => {
      const aTime = toTimestampMs(a.timestamp);
      const bTime = toTimestampMs(b.timestamp);
      if (aTime !== bTime) return aTime - bTime;
      if (a.sequenceNumber !== b.sequenceNumber) return a.sequenceNumber - b.sequenceNumber;
      return a.id - b.id;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptapSchema = ((editor as any)?._tiptapEditor?.state?.schema ?? null) as Parameters<typeof Step.fromJSON>[0] | null;
    let authorshipRanges: AuthorshipRange[] = [];
    let currentDocContentSize = 0;
    let ha = 0;
    let hd = 0;
    let gp = 0;
    let gd = 0;
    let hasExactContributionData = true;

    sortedEvents.forEach((event) => {
      if (event.eventType === 'typing_op') {
        const eventData = (event.eventData || {}) as TypingOpEventData;
        const origin = typingOriginBySequence.get(event.sequenceNumber) ?? 'user';
        const addedWordsRaw = Number(eventData.addedWords);
        const deletedUserWordsRaw = Number(eventData.deletedUserWords);
        const deletedGptWordsRaw = Number(eventData.deletedGptWords);
        const hasExactStepContribution =
          Number.isFinite(addedWordsRaw) &&
          addedWordsRaw >= 0 &&
          Number.isFinite(deletedUserWordsRaw) &&
          deletedUserWordsRaw >= 0 &&
          Number.isFinite(deletedGptWordsRaw) &&
          deletedGptWordsRaw >= 0;

        if (hasExactStepContribution) {
          const addedWords = Math.max(0, Math.floor(addedWordsRaw));
          const deletedUserWords = Math.max(0, Math.floor(deletedUserWordsRaw));
          const deletedGptWords = Math.max(0, Math.floor(deletedGptWordsRaw));

          if (origin === 'gpt') {
            gp += addedWords;
          } else {
            ha += addedWords;
          }
          hd += deletedUserWords;
          gd += deletedGptWords;
        } else {
          hasExactContributionData = false;
        }

        if (tiptapSchema && eventData.stepJson && typeof eventData.stepJson === 'object') {
          try {
            const step = Step.fromJSON(tiptapSchema, eventData.stepJson);
            const stepMap = step.getMap();

            const loggedDocContentSize = Number(eventData.docContentSize);
            const hasLoggedDocContentSize = Number.isFinite(loggedDocContentSize) && loggedDocContentSize >= 0;
            let nextDocContentSize = hasLoggedDocContentSize ? Math.floor(loggedDocContentSize) : null;

            if (nextDocContentSize === null) {
              let inferredDelta = 0;
              stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
                inferredDelta += (newEnd - newStart) - (oldEnd - oldStart);
              });

              const inferredBase = currentDocContentSize > 0 ? currentDocContentSize : 1;
              nextDocContentSize = Math.max(0, inferredBase + inferredDelta);
            }

            authorshipRanges = applyStepToAuthorshipRanges(
              authorshipRanges,
              stepMap,
              origin,
              Math.max(0, nextDocContentSize)
            );
            currentDocContentSize = Math.max(0, nextDocContentSize);
          } catch {
            // Ignore malformed historical steps.
          }
        }
      }

      if (event.eventType === 'submission') {
        const totalWords = countWordsFromDocument(event.eventData);
        const gptShare = computeGptShareFromAuthorshipRanges(authorshipRanges, currentDocContentSize);
        const gptWords = Math.min(totalWords, Math.max(0, Math.round(totalWords * gptShare)));
        const userWords = Math.max(0, totalWords - gptWords);

        breakdownById.set(event.id, {
          submissionId: event.id,
          totalWords,
          userWords,
          gptWords,
        });
        rangesBySubmissionId.set(event.id, cloneAuthorshipRanges(authorshipRanges));

        const netHuman = ha - hd;
        const netGpt = gp - gd;
        const hcrDenominator = netHuman + netGpt;
        const herDenominator = ha + hd + gp + gd;
        contributionById.set(event.id, {
          submissionId: event.id,
          ha,
          hd,
          gp,
          gd,
          hcr: hasExactContributionData && hcrDenominator > 0 ? netHuman / hcrDenominator : null,
          her: hasExactContributionData && herDenominator > 0 ? (ha + hd + gd) / herDenominator : null,
          isExact: hasExactContributionData,
        });
      }
    });

    sortedSubmissions.forEach((submission) => {
      if (breakdownById.has(submission.id)) {
        return;
      }

      const totalWords = countWordsFromDocument(submission.eventData);
      breakdownById.set(submission.id, {
        submissionId: submission.id,
        totalWords,
        userWords: totalWords,
        gptWords: 0,
      });
      rangesBySubmissionId.set(submission.id, []);
      contributionById.set(submission.id, {
        submissionId: submission.id,
        ha: 0,
        hd: 0,
        gp: 0,
        gd: 0,
        hcr: null,
        her: null,
        isExact: false,
      });
    });

    return {
      wordBreakdownById: breakdownById,
      rangesBySubmissionId,
      contributionById,
    };
  }, [editor, events, sortedSubmissions, typingOriginBySequence]);

  useEffect(() => {
    if (!onSubmissionWordBreakdownChange) return;

    let nextWordBreakdown: SubmissionWordBreakdown | null = null;
    if (selectedSubmissionId !== null) {
      nextWordBreakdown = submissionAuthorshipAnalysis.wordBreakdownById.get(selectedSubmissionId) ?? null;
      if (!nextWordBreakdown) {
        const totalWords = selectedSubmission ? countWordsFromDocument(selectedSubmission.eventData) : 0;
        nextWordBreakdown = {
          submissionId: selectedSubmissionId,
          totalWords,
          userWords: totalWords,
          gptWords: 0,
        };
      }
    } else {
      const totalWords = countWordsFromDocument(documentToShow);
      nextWordBreakdown = {
        submissionId: null,
        totalWords,
        userWords: totalWords,
        gptWords: 0,
      };
    }

    const nextKey = nextWordBreakdown
      ? `${nextWordBreakdown.submissionId ?? 'none'}:${nextWordBreakdown.totalWords}:${nextWordBreakdown.userWords}:${nextWordBreakdown.gptWords}`
      : 'null';
    if (nextKey === lastReportedWordBreakdownKeyRef.current) {
      return;
    }

    lastReportedWordBreakdownKeyRef.current = nextKey;
    onSubmissionWordBreakdownChange(nextWordBreakdown);
  }, [
    documentToShow,
    onSubmissionWordBreakdownChange,
    selectedSubmission,
    selectedSubmissionId,
    submissionAuthorshipAnalysis,
  ]);

  useEffect(() => {
    if (!onSubmissionContributionMetricsChange) return;

    let nextMetrics: SubmissionContributionMetrics | null = null;
    if (selectedSubmissionId !== null) {
      nextMetrics = submissionAuthorshipAnalysis.contributionById.get(selectedSubmissionId) ?? null;
      if (!nextMetrics) {
        nextMetrics = {
          submissionId: selectedSubmissionId,
          ha: 0,
          hd: 0,
          gp: 0,
          gd: 0,
          hcr: null,
          her: null,
          isExact: false,
        };
      }
    } else {
      nextMetrics = {
        submissionId: null,
        ha: 0,
        hd: 0,
        gp: 0,
        gd: 0,
        hcr: null,
        her: null,
        isExact: false,
      };
    }

    const nextKey = nextMetrics
      ? `${nextMetrics.submissionId ?? 'none'}:${nextMetrics.ha}:${nextMetrics.hd}:${nextMetrics.gp}:${nextMetrics.gd}:${nextMetrics.hcr ?? 'null'}:${nextMetrics.her ?? 'null'}:${nextMetrics.isExact ? 1 : 0}`
      : 'null';
    if (nextKey === lastReportedContributionKeyRef.current) {
      return;
    }

    lastReportedContributionKeyRef.current = nextKey;
    onSubmissionContributionMetricsChange(nextMetrics);
  }, [
    onSubmissionContributionMetricsChange,
    selectedSubmissionId,
    submissionAuthorshipAnalysis,
  ]);

  const selectedSubmissionAuthorshipRanges = useMemo(() => {
    if (selectedSubmissionId === null) {
      return [] as AuthorshipRange[];
    }
    return submissionAuthorshipAnalysis.rangesBySubmissionId.get(selectedSubmissionId) ?? [];
  }, [selectedSubmissionId, submissionAuthorshipAnalysis]);

  useEffect(() => {
    if (!editor) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = (editor as any)._tiptapEditor;
      const state = tiptapEditor?.state;
      const view = tiptapEditor?.view;
      if (!state || !view) {
        return;
      }

      const rangesSignature = selectedSubmissionAuthorshipRanges
        .map((range) => `${range.from}:${range.to}:${range.origin}`)
        .join('|');
      const overlayKey = `${showAuthorshipHighlight ? 1 : 0}:${selectedSubmissionId ?? 'none'}:${rangesSignature}`;
      if (overlayKey === lastAppliedOverlayKeyRef.current) {
        return;
      }

      const tr = state.tr.setMeta(summaryAuthorshipPluginKey, {
        enabled: showAuthorshipHighlight,
        ranges: selectedSubmissionAuthorshipRanges,
      });
      view.dispatch(tr);
      lastAppliedOverlayKeyRef.current = overlayKey;
    } catch {
      // Ignore highlight overlay dispatch failures in summary view.
    }
  }, [editor, selectedSubmissionAuthorshipRanges, selectedSubmissionId, showAuthorshipHighlight]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Final Submission</h2>
            <p className="text-sm text-gray-600 mt-1">
              {sortedSubmissions.length > 0
                ? 'Select any submission to review'
                : 'This is the latest auto-saved version'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showAuthorshipHighlight}
                onChange={(event) => setShowAuthorshipHighlight(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>GPT/User Highlight</span>
            </label>
            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
              <span className="inline-block h-2.5 w-2.5 rounded bg-amber-400/80" />
              GPT
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-400/80" />
              User
            </span>
            {sortedSubmissions.length > 0 && (
              <>
                <span className="text-sm text-gray-600">
                  Submission
                </span>
                <Listbox
                  value={selectedSubmission}
                  onChange={(submission) => {
                    if (!submission) {
                      return;
                    }
                    onSelectSubmissionId(submission.id);
                  }}
                >
                  <div className="relative">
                    <ListboxButton className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white text-gray-700 min-w-[260px] text-left flex items-center justify-between gap-2">
                      <span>
                        {selectedSubmission
                          ? `Submission ${sortedSubmissions.findIndex(s => s.id === selectedSubmission.id) + 1}`
                          : 'Select submission'}
                      </span>
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.292l3.71-4.06a.75.75 0 111.1 1.02l-4.25 4.65a.75.75 0 01-1.1 0l-4.25-4.65a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </ListboxButton>
                    <ListboxOptions className="absolute right-0 mt-2 max-h-60 w-80 overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5 z-10">
                      {sortedSubmissions.map((submission, index) => {
                        const submittedAt = new Date(submission.timestamp).toLocaleString();
                        return (
                          <ListboxOption
                            key={submission.id}
                            value={submission}
                            className="cursor-pointer select-none px-3 py-2 hover:bg-gray-100"
                          >
                            {({ selected }) => (
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{`Submission ${index + 1}`}</span>
                                  {selected && (
                                    <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                      <path fillRule="evenodd" d="M16.704 5.29a1 1 0 01.006 1.414l-7.1 7.2a1 1 0 01-1.42.01l-3.3-3.2a1 1 0 011.4-1.44l2.59 2.51 6.39-6.48a1 1 0 011.414-.006z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500">
                                  {submittedAt}
                                </span>
                              </div>
                            )}
                          </ListboxOption>
                        );
                      })}
                    </ListboxOptions>
                  </div>
                </Listbox>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <BlockNoteView
            editor={editor}
            editable={false}
            theme="light"
          />
        </div>
      </div>
    </div>
  );
}
