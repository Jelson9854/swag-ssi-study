"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import { EventTracker, getSessionEventTracker } from "@/lib/event-tracker";
import { getGlobalValidator } from "@/lib/copy-validator";
import toast from "react-hot-toast";

interface BlockNoteEditorProps {
  sessionId: string;
  strictPasteBlocking: boolean;
}

export default function BlockNoteEditor({ sessionId, strictPasteBlocking }: BlockNoteEditorProps) {
  const trackerRef = useRef<EventTracker | null>(null);
  const validator = getGlobalValidator();
  const [initialContent, setInitialContent] = useState<Record<string, unknown>[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

        const { snapshot } = await response.json();

        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
          setInitialContent(snapshot);
          console.log('✓ Loaded snapshot with', snapshot.length, 'blocks');
        } else {
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

    // 주기적으로 snapshot 체크 (1초마다) - 연속 타이핑 중 3초마다 저장용
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

  // Listen for submission requests from the UI
  useEffect(() => {
    const handleSubmissionRequest = async () => {
      const tracker = trackerRef.current;
      if (!tracker || !editor) return;

      try {
        const documentState = editor.document;
        tracker.trackSubmission(documentState);
        await tracker.forceSave();
        window.dispatchEvent(new CustomEvent('prelude:submission-saved'));
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

    window.addEventListener("prelude:submit-request", handleSubmissionRequest);
    return () => {
      window.removeEventListener("prelude:submit-request", handleSubmissionRequest);
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

    // Track user activity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdate = ({ transaction }: any) => {
      if (!transaction.docChanged) return;

      const tracker = trackerRef.current;
      if (!tracker) return;

      // Track activity (throttled to 1 per second)
      tracker.trackActivity();

      // Notify that editor has changed (for submit button state)
      window.dispatchEvent(new CustomEvent('prelude:editor-changed'));

      // Take snapshot if needed (activity-based, every 5 seconds)
      if (tracker.shouldTakeSnapshot()) {
        try {
          const documentState = editor.document;
          tracker.trackSnapshot(documentState);
        } catch (error) {
          console.error("Failed to create snapshot:", error);
        }
      }
    };

    tiptapEditor.on("update", handleUpdate);

    return () => {
      tiptapEditor.off("update", handleUpdate);
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
