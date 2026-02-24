"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
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

export default function BlockNoteEditor({ sessionId, strictPasteBlocking }: BlockNoteEditorProps) {
  const trackerRef = useRef<EventTracker | null>(null);
  const pendingTypingSourceRef = useRef<{ source: 'gpt'; setAt: number } | null>(null);
  const hasLoadedSnapshotRef = useRef(false);
  const initialSnapshotSeededRef = useRef(false);
  const validator = getGlobalValidator();
  const [initialContent, setInitialContent] = useState<Record<string, unknown>[] | null>(null);
  const [maxExistingSequence, setMaxExistingSequence] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    pendingTypingSourceRef.current = null;
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
      steps.forEach((step: unknown, stepIndex: number) => {
        try {
          const stepObject = step as { toJSON?: () => unknown };
          if (typeof stepObject.toJSON !== "function") return;

          const stepJsonRaw = stepObject.toJSON();
          if (!stepJsonRaw || typeof stepJsonRaw !== "object") return;

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
            docContentSize: currentDocContentSize,
            source: typingSource,
          });
        } catch {
          // Ignore step serialization failures and continue processing update.
        }
      });

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
