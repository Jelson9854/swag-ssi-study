"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import { StepMap } from "@tiptap/pm/transform";
import { EventTracker, getSessionEventTracker } from "@/lib/event-tracker";
import { getGlobalValidator } from "@/lib/copy-validator";
import { SWAG_CUSTOM_EVENTS } from "@/lib/swag-events";
import toast from "react-hot-toast";

interface BlockNoteEditorProps {
  sessionId: string;
  strictPasteBlocking: boolean;
}

const extractBlockText = (value: unknown): string => {
  const parts: string[] = [];

  const walk = (node: unknown, parentKey?: string) => {
    if (typeof node === "string") {
      if (parentKey === "text" || parentKey === "content") {
        parts.push(node);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, parentKey));
      return;
    }

    if (node && typeof node === "object") {
      Object.entries(node as Record<string, unknown>).forEach(([key, child]) => {
        walk(child, key);
      });
    }
  };

  walk(value);
  return parts.join(" ");
};

const countWords = (document: unknown): number => {
  const plainText = extractBlockText(document).replace(/\s+/g, " ").trim();
  if (!plainText) {
    return 0;
  }
  return plainText.split(" ").length;
};

type AuthorshipOrigin = "user" | "gpt";

interface AuthorshipRange {
  from: number;
  to: number;
  origin: AuthorshipOrigin;
}

interface PMDocLike {
  content: { size: number };
  textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string;
}

interface PMStepLike {
  toJSON?: () => unknown;
  getMap?: () => StepMap;
  apply?: (doc: PMDocLike) => { doc?: PMDocLike; failed?: string };
}

const clampPmPosition = (position: number, maxPosition: number): number => {
  if (!Number.isFinite(position)) return 0;
  return Math.min(Math.max(0, Math.floor(position)), maxPosition);
};

const countWordsFromText = (text: string): number => {
  const plainText = text.replace(/\s+/g, " ").trim();
  if (!plainText) {
    return 0;
  }
  return plainText.split(" ").length;
};

const mergeAuthorshipRanges = (ranges: AuthorshipRange[]): AuthorshipRange[] => {
  if (ranges.length === 0) return [];

  const normalized = ranges
    .filter((range) => Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from)
    .map((range) => ({
      from: Math.floor(range.from),
      to: Math.floor(range.to),
      origin: range.origin,
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

const getAuthorshipSegmentsInRange = (
  ranges: AuthorshipRange[],
  from: number,
  to: number
): AuthorshipRange[] => {
  if (to <= from) return [];

  const normalized = mergeAuthorshipRanges(
    ranges
      .map((range) => ({
        from: Math.max(from, range.from),
        to: Math.min(to, range.to),
        origin: range.origin,
      }))
      .filter((range) => range.to > range.from)
  );

  const segments: AuthorshipRange[] = [];
  let cursor = from;

  normalized.forEach((range) => {
    const start = Math.max(cursor, range.from);
    if (start > cursor) {
      segments.push({
        from: cursor,
        to: start,
        origin: "user",
      });
    }

    if (range.to > start) {
      segments.push({
        from: start,
        to: range.to,
        origin: range.origin,
      });
      cursor = range.to;
    }
  });

  if (cursor < to) {
    segments.push({
      from: cursor,
      to,
      origin: "user",
    });
  }

  return segments.filter((segment) => segment.to > segment.from);
};

const isPmDocLike = (value: unknown): value is PMDocLike => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { content?: { size?: number }; textBetween?: unknown };
  return (
    typeof candidate.textBetween === "function" &&
    !!candidate.content &&
    typeof candidate.content.size === "number"
  );
};

const countAddedWordsFromStepMap = (newDoc: PMDocLike, stepMap: StepMap): number => {
  const maxPosition = Math.max(0, Math.floor(newDoc.content.size));
  let addedWords = 0;

  stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
    const from = clampPmPosition(newStart, maxPosition);
    const to = clampPmPosition(newEnd, maxPosition);
    if (to <= from) return;
    const insertedText = newDoc.textBetween(from, to, " ", " ");
    addedWords += countWordsFromText(insertedText);
  });

  return addedWords;
};

const countDeletedWordsByOriginFromStepMap = (
  oldDoc: PMDocLike,
  stepMap: StepMap,
  ranges: AuthorshipRange[]
): { user: number; gpt: number } => {
  const maxPosition = Math.max(0, Math.floor(oldDoc.content.size));
  let deletedUserWords = 0;
  let deletedGptWords = 0;

  stepMap.forEach((oldStart, oldEnd) => {
    const from = clampPmPosition(oldStart, maxPosition);
    const to = clampPmPosition(oldEnd, maxPosition);
    if (to <= from) return;

    const segments = getAuthorshipSegmentsInRange(ranges, from, to);
    segments.forEach((segment) => {
      const deletedText = oldDoc.textBetween(segment.from, segment.to, " ", " ");
      const deletedWordCount = countWordsFromText(deletedText);
      if (segment.origin === "gpt") {
        deletedGptWords += deletedWordCount;
      } else {
        deletedUserWords += deletedWordCount;
      }
    });
  });

  return {
    user: deletedUserWords,
    gpt: deletedGptWords,
  };
};

export default function BlockNoteEditor({ sessionId, strictPasteBlocking }: BlockNoteEditorProps) {
  const trackerRef = useRef<EventTracker | null>(null);
  const pendingTypingSourceRef = useRef<{ source: 'gpt'; setAt: number } | null>(null);
  const authorshipRangesRef = useRef<AuthorshipRange[]>([]);
  const hasLoadedSnapshotRef = useRef(false);
  const initialSnapshotSeededRef = useRef(false);
  const validator = getGlobalValidator();
  const [initialContent, setInitialContent] = useState<Record<string, unknown>[] | null>(null);
  const [maxExistingSequence, setMaxExistingSequence] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    pendingTypingSourceRef.current = null;
    authorshipRangesRef.current = [];
    hasLoadedSnapshotRef.current = false;
    initialSnapshotSeededRef.current = false;
    setMaxExistingSequence(-1);
  }, [sessionId]);

  // Load snapshot on mount
  useEffect(() => {
    const loadSnapshot = async () => {
      try {
        const response = await fetch('/api/events/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) {
          throw new Error('Failed to load snapshot');
        }

        const { snapshot, maxSequenceNumber } = await response.json();
        const parsedMaxSequence = Number(maxSequenceNumber);
        setMaxExistingSequence(
          Number.isFinite(parsedMaxSequence) ? Math.max(-1, Math.floor(parsedMaxSequence)) : -1
        );

        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
          hasLoadedSnapshotRef.current = true;
          setInitialContent(snapshot);
          console.log('✓ Loaded snapshot with', snapshot.length, 'blocks');
        } else {
          hasLoadedSnapshotRef.current = false;
          // No snapshot found, use default
          setInitialContent([
            {
              type: "paragraph",
              content: [],
            },
          ]);
        }
      } catch (error) {
        console.error('Failed to load snapshot:', error);
        hasLoadedSnapshotRef.current = false;
        // Fallback to default content
        setInitialContent([
          {
            type: "paragraph",
            content: [],
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSnapshot();
  }, [sessionId]);

  // Create BlockNote editor with loaded content - only when initialContent is ready
  const editor = useCreateBlockNote({
    initialContent: initialContent || undefined,
  }, [initialContent]);

  // Initialize event tracker
  useEffect(() => {
    trackerRef.current = getSessionEventTracker(sessionId);

    // Snapshot 콜백 등록 (타이핑 멈춤 감지용)
    if (trackerRef.current) {
      trackerRef.current.setSnapshotCallback(() => {
        if (editor) {
          try {
            const documentState = editor.document;
            trackerRef.current?.trackSnapshot(documentState);
          } catch (error) {
            console.error("Failed to create snapshot:", error);
          }
        }
      });
    }

    // Force save on page unload
    const handleBeforeUnload = () => {
      trackerRef.current?.forceSave();
    };

    // 주기적으로 snapshot 체크 (1초마다)
    const snapshotCheckInterval = setInterval(() => {
      const tracker = trackerRef.current;
      if (tracker && tracker.shouldTakeSnapshot() && editor) {
        try {
          const documentState = editor.document;
          tracker.trackSnapshot(documentState);
        } catch (error) {
          console.error("Failed to create snapshot:", error);
        }
      }
    }, 1000);

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(snapshotCheckInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      trackerRef.current?.forceSave();
    };
  }, [sessionId, editor]);

  // Ensure sequence numbers continue from the latest value in DB.
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    tracker.setMinimumSequenceNumber(maxExistingSequence + 1);
  }, [maxExistingSequence, sessionId]);

  // Ensure a baseline snapshot exists before typing starts in fresh sessions.
  useEffect(() => {
    if (isLoading || !editor) return;
    if (hasLoadedSnapshotRef.current || initialSnapshotSeededRef.current) return;

    const tracker = trackerRef.current;
    if (!tracker) return;

    try {
      tracker.trackSnapshot(editor.document);
      initialSnapshotSeededRef.current = true;
    } catch (error) {
      console.error("Failed to create initial baseline snapshot:", error);
    }
  }, [editor, isLoading, sessionId]);

  // Listen for submission requests from the UI
  useEffect(() => {
    const handleSubmissionRequest = async () => {
      const tracker = trackerRef.current;
      if (!tracker || !editor) return;

      try {
        const documentState = editor.document;
        tracker.trackSubmission(documentState);
        await tracker.forceSave();
        window.dispatchEvent(new CustomEvent(SWAG_CUSTOM_EVENTS.SUBMISSION_SAVED));
        toast.success("Submitted! You can resubmit anytime before the deadline.", {
          duration: 3000,
          position: "top-center",
        });
      } catch (error) {
        console.error("Failed to submit:", error);
        toast.error("Submission failed. Please try again.", {
          duration: 4000,
          position: "top-center",
        });
      }
    };

    window.addEventListener(SWAG_CUSTOM_EVENTS.SUBMIT_REQUEST, handleSubmissionRequest);
    return () => {
      window.removeEventListener(SWAG_CUSTOM_EVENTS.SUBMIT_REQUEST, handleSubmissionRequest);
    };
  }, [editor]);

  // Track changes
  useEffect(() => {
    if (!editor) return;

    // Access underlying Tiptap editor for transaction tracking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptapEditor = (editor as any)._tiptapEditor;

    if (!tiptapEditor) {
      console.warn("Tiptap editor not accessible");
      return;
    }

    // Track user activity + ProseMirror step logs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdate = ({ transaction }: any) => {
      if (!transaction.docChanged) return;

      const tracker = trackerRef.current;
      if (!tracker) return;

      const txTimestamp = Date.now();
      const steps = Array.isArray(transaction.steps) ? transaction.steps : [];
      const stepDocs = Array.isArray(transaction.docs) ? transaction.docs : [];
      const currentWordCount = countWords(editor.document);
      const currentDocContentSize = Number.isFinite(transaction?.doc?.content?.size)
        ? Math.max(0, Math.floor(transaction.doc.content.size))
        : undefined;
      const pendingTypingSource = pendingTypingSourceRef.current;
      const typingSource = (
        pendingTypingSource &&
        pendingTypingSource.source === "gpt" &&
        txTimestamp - pendingTypingSource.setAt <= 2000
      ) ? "gpt" : "user";

      if (pendingTypingSource && typingSource !== "gpt") {
        pendingTypingSourceRef.current = null;
      }
      let nextAuthorshipRanges = authorshipRangesRef.current;
      steps.forEach((step: unknown, stepIndex: number) => {
        try {
          const stepObject = step as PMStepLike;
          if (typeof stepObject.toJSON !== "function" || typeof stepObject.getMap !== "function") return;

          const stepJsonRaw = stepObject.toJSON();
          if (!stepJsonRaw || typeof stepJsonRaw !== "object") return;

          const stepMap = stepObject.getMap();
          let addedWords = 0;
          let deletedUserWords = 0;
          let deletedGptWords = 0;
          let stepDocContentSize = currentDocContentSize;

          const fallbackOldDoc = stepIndex === 0 ? transaction.before : undefined;
          const oldDocCandidate = stepDocs[stepIndex] ?? fallbackOldDoc;
          const oldDoc = isPmDocLike(oldDocCandidate) ? oldDocCandidate : null;

          if (oldDoc && typeof stepObject.apply === "function") {
            const deletedWords = countDeletedWordsByOriginFromStepMap(
              oldDoc,
              stepMap,
              nextAuthorshipRanges
            );
            deletedUserWords = deletedWords.user;
            deletedGptWords = deletedWords.gpt;

            const stepResult = stepObject.apply(oldDoc);
            if (stepResult?.doc && isPmDocLike(stepResult.doc)) {
              addedWords = countAddedWordsFromStepMap(stepResult.doc, stepMap);
              stepDocContentSize = Math.max(0, Math.floor(stepResult.doc.content.size));
              nextAuthorshipRanges = applyStepToAuthorshipRanges(
                nextAuthorshipRanges,
                stepMap,
                typingSource,
                stepResult.doc.content.size
              );
            } else if (typeof currentDocContentSize === "number") {
              nextAuthorshipRanges = applyStepToAuthorshipRanges(
                nextAuthorshipRanges,
                stepMap,
                typingSource,
                currentDocContentSize
              );
            }
          } else if (typeof currentDocContentSize === "number") {
            nextAuthorshipRanges = applyStepToAuthorshipRanges(
              nextAuthorshipRanges,
              stepMap,
              typingSource,
              currentDocContentSize
            );
          }

          const stepJson = stepJsonRaw as Record<string, unknown>;
          const stepType =
            typeof stepJson.stepType === "string" ? stepJson.stepType : "unknown";

          tracker.trackTypingOp({
            stepJson,
            stepType,
            stepIndex,
            stepCount: steps.length,
            transactionTimestamp: txTimestamp,
            wordCount: currentWordCount,
            docContentSize: stepDocContentSize,
            addedWords,
            deletedUserWords,
            deletedGptWords,
            source: typingSource,
          });
        } catch {
          // Ignore step serialization failures and continue processing update.
        }
      });
      authorshipRangesRef.current = nextAuthorshipRanges;

      // Paste-from-chat provenance is attached to the next doc-changing transaction only.
      if (typingSource === "gpt") {
        pendingTypingSourceRef.current = null;
      }

      // Track activity (throttled to 1 per second)
      tracker.trackActivity();

      // Notify that editor has changed (for submit button state)
      window.dispatchEvent(new CustomEvent(SWAG_CUSTOM_EVENTS.EDITOR_CHANGED));

      // Take snapshot if needed based on activity/interval thresholds.
      if (tracker.shouldTakeSnapshot()) {
        try {
          const documentState = editor.document;
          tracker.trackSnapshot(documentState);
        } catch (error) {
          console.error("Failed to create snapshot:", error);
        }
      }
    };

    // Track cursor / selection movement independently from doc changes.
    const handleSelectionUpdate = () => {
      const tracker = trackerRef.current;
      if (!tracker) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = (tiptapEditor as any).state;
        const selection = state?.selection;
        if (!selection) return;

        tracker.trackEditorSelection({
          from: selection.from,
          to: selection.to,
        });
      } catch {
        // Ignore selection extraction failures.
      }
    };

    tiptapEditor.on("update", handleUpdate);
    tiptapEditor.on("selectionUpdate", handleSelectionUpdate);
    handleSelectionUpdate();

    return () => {
      tiptapEditor.off("update", handleUpdate);
      tiptapEditor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor]);

  // Copy/Paste validation
  useEffect(() => {
    if (!editor) return;

    const blockExternalPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }

      toast.error("External paste is blocked. You can only paste content from within this system.", {
        duration: 4000,
        position: "top-center",
        style: {
          background: "#EF4444",
          color: "#fff",
        },
      });
    };

    const handleCopy = () => {
      const copiedContent = window.getSelection()?.toString();

      if (copiedContent) {
        // Mark content as copied from internal editor
        validator.markInternalCopy(copiedContent, "editor");
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const pastedContent = e.clipboardData?.getData("text/plain")?.trim() || "";
      const tracker = trackerRef.current;

      if (!pastedContent) {
        if (tracker) {
          tracker.trackPaste("[non-text clipboard content]", false, {
            sourceArea: "unknown",
            targetArea: "editor",
            matchMethod: "none",
          });
        }

        // In strict mode, non-text clipboard payloads are treated as external content and blocked.
        if (strictPasteBlocking) {
          blockExternalPaste(e);
        }
        return;
      }

      const classification = validator.classifyPaste(pastedContent);

      // Track the paste event
      if (tracker) {
        tracker.trackPaste(pastedContent, classification.isInternal, {
          sourceArea: classification.source,
          targetArea: "editor",
          matchMethod: classification.matchMethod,
        });
      }

      if (classification.isInternal && classification.source === "chat") {
        pendingTypingSourceRef.current = { source: "gpt", setAt: Date.now() };
      }

      if (!classification.isInternal) {
        // Allow external paste when strict blocking is disabled. Logs are still recorded.
        if (strictPasteBlocking) {
          blockExternalPaste(e);
        }
      } else {
        // Clear the copy buffer after successful paste
        validator.clearCopyBuffer();
      }
    };

    // Bind directly to the editable node and capture early for reliable logging/blocking.
    const editorElement = document.querySelector<HTMLElement>(".blocknote-wrapper [contenteditable='true']")
      || document.querySelector<HTMLElement>(".blocknote-wrapper");

    if (!editorElement) {
      console.warn("BlockNote editor element not found");
      return;
    }

    // Add copy and paste listeners to the editor element
    editorElement.addEventListener("copy", handleCopy);
    editorElement.addEventListener("paste", handlePaste as EventListener, true);

    return () => {
      editorElement.removeEventListener("copy", handleCopy);
      editorElement.removeEventListener("paste", handlePaste as EventListener, true);
    };
  }, [validator, editor, strictPasteBlocking]);

  if (isLoading) {
    return (
      <div className="blocknote-wrapper">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading editor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="blocknote-wrapper">
      <BlockNoteView
        editor={editor}
        theme="light"
        data-placeholder="Start writing your essay here..."
      />
    </div>
  );
}
