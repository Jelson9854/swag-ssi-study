'use client';

import { useCallback, useEffect, useState } from 'react';
import BackLink from '@/components/ui/BackLink';
import TrackedEditor from './TrackedEditor';
import ChatPanel from '../chat/ChatPanel';
import { useUIStore } from '@/stores/uiStore';
import SubmissionModal from './SubmissionModal';
import { Button } from '@/components/ui/button';
import { FileText, History, Send, Bot, Check, Loader2, ListChecks } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getGlobalValidator } from '@/lib/copy-validator';
import { SWAG_CUSTOM_EVENTS } from '@/lib/swag-events';

interface EditorClientProps {
  sessionId: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentInstructions: string;
  assignmentCriteria: string | null;
  deadline: Date;
  allowWebSearch: boolean;
  strictPasteBlocking: boolean;
}

export default function EditorClient({
  sessionId,
  assignmentId,
  assignmentTitle,
  assignmentInstructions,
  assignmentCriteria,
  deadline,
  allowWebSearch,
  strictPasteBlocking,
}: EditorClientProps) {
  const validator = getGlobalValidator();
  const hasCriteria = Boolean(assignmentCriteria?.trim());

  const {
    isChatOpen,
    chatWidth,
    isResizing,
    showInstructions,
    saveStatus,
    setChatOpen,
    toggleInstructions,
    setSaveStatus,
    startResize,
    handleResize,
    stopResize,
  } = useUIStore();

  const [submissions, setSubmissions] = useState<Array<{
    id: number;
    eventData: Record<string, unknown>[];
    timestamp: string | Date;
    sequenceNumber: number;
  }>>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
  const [hasChangesAfterSubmit, setHasChangesAfterSubmit] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);

  useEffect(() => {
    validator.registerInstruction(assignmentInstructions);
    if (assignmentCriteria) {
      validator.registerInstruction(assignmentCriteria);
    }
  }, [assignmentCriteria, assignmentInstructions, validator]);

  // Listen for save events
  useEffect(() => {
    const handleSaving = () => {
      setSaveStatus('saving');
    };

    const handleSaved = () => {
      setSaveStatus('saved');
      // Reset to ready after 2 seconds
      setTimeout(() => setSaveStatus('ready'), 2000);
    };

    window.addEventListener(SWAG_CUSTOM_EVENTS.EVENTS_SAVING, handleSaving);
    window.addEventListener(SWAG_CUSTOM_EVENTS.EVENTS_SAVED, handleSaved);
    return () => {
      window.removeEventListener(SWAG_CUSTOM_EVENTS.EVENTS_SAVING, handleSaving);
      window.removeEventListener(SWAG_CUSTOM_EVENTS.EVENTS_SAVED, handleSaved);
    };
  }, [setSaveStatus]);

  const loadSubmissions = useCallback(async () => {
    const response = await fetch('/api/events/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      throw new Error('Failed to load submissions');
    }

    const { submissions: loaded } = await response.json();
    const nextSubmissions = Array.isArray(loaded) ? loaded : [];
    setSubmissions(nextSubmissions);

    if (nextSubmissions.length > 0) {
      setSelectedSubmissionId(nextSubmissions[nextSubmissions.length - 1].id);
    } else {
      setSelectedSubmissionId(null);
    }
  }, [sessionId]);

  // Open submission modal after a successful submission
  useEffect(() => {
    const handleSubmissionSaved = () => {
      setHasChangesAfterSubmit(false);
      loadSubmissions()
        .then(() => setIsSubmissionModalOpen(true))
        .catch(() => {
          // If loading fails, just keep the editor view
        });
    };

    window.addEventListener(SWAG_CUSTOM_EVENTS.SUBMISSION_SAVED, handleSubmissionSaved);
    return () => {
      window.removeEventListener(SWAG_CUSTOM_EVENTS.SUBMISSION_SAVED, handleSubmissionSaved);
    };
  }, [loadSubmissions]);

  // Listen for editor changes to enable submit button
  useEffect(() => {
    const handleEditorChange = () => {
      setHasChangesAfterSubmit(true);
    };

    window.addEventListener(SWAG_CUSTOM_EVENTS.EDITOR_CHANGED, handleEditorChange);
    return () => {
      window.removeEventListener(SWAG_CUSTOM_EVENTS.EDITOR_CHANGED, handleEditorChange);
    };
  }, []);

  const handleOpenSubmissions = () => {
    loadSubmissions()
      .then(() => setIsSubmissionModalOpen(true))
      .catch(() => {
        setIsSubmissionModalOpen(true);
      });
  };

  const handleInstructionCopy = useCallback(() => {
    const copiedContent = window.getSelection()?.toString();
    if (copiedContent) {
      validator.markInternalCopy(copiedContent, 'instruction');
    }
  }, [validator]);

  // Handle resize with mouse events
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => handleResize(e.clientX);
    const handleMouseUp = () => stopResize();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleResize, stopResize]);

  return (
    <div className="h-screen flex flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackLink href="/student/dashboard" label="Dashboard" className="text-[hsl(var(--muted-foreground))]" />
            <div>
              <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">
                {assignmentTitle}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Due: {deadline.toLocaleDateString()}
                </p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                  strictPasteBlocking
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {strictPasteBlocking ? 'External Paste: Blocked' : 'External Paste: Allowed'}
                </span>
                <span className="text-[hsl(var(--border))]">•</span>
                <Button
                  onClick={toggleInstructions}
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/80 font-medium hover:bg-transparent"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  {showInstructions ? 'Hide Instructions' : 'View Instructions'}
                </Button>
                {hasCriteria ? (
                  <>
                    <span className="text-[hsl(var(--border))]">•</span>
                    <Button
                      onClick={() => setShowCriteria((current) => !current)}
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/80 font-medium hover:bg-transparent"
                    >
                      <ListChecks className="w-4 h-4 mr-1" />
                      {showCriteria ? 'Hide Criteria' : 'View Criteria'}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] mr-2">
              <span className={`font-medium flex items-center gap-1.5 ${saveStatus === 'saving' ? 'text-[hsl(var(--primary))]' :
                saveStatus === 'saved' ? 'text-green-600' :
                  'text-[hsl(var(--muted-foreground))]'
                }`}>
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Saved
                  </>
                ) : (
                  'Ready'
                )}
              </span>
            </div>
            <Button
              onClick={handleOpenSubmissions}
              variant="secondary"
              size="sm"
              title="View previous submissions"
            >
              <History className="w-4 h-4 mr-2" />
              Submissions
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent(SWAG_CUSTOM_EVENTS.SUBMIT_REQUEST))}
              className={hasChangesAfterSubmit ? "" : "opacity-50 cursor-not-allowed"}
              disabled={!hasChangesAfterSubmit}
              title={hasChangesAfterSubmit ? "You can resubmit anytime before the deadline" : "No changes since last submission"}
              size="sm"
            >
              <Send className="w-4 h-4 mr-2" />
              {hasChangesAfterSubmit ? 'Submit' : 'Submitted'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor (Left) */}
        <div className="flex-1 flex flex-col border-r border-[hsl(var(--border))]">
          {/* Instructions Panel (Collapsible) */}
          {showInstructions && (
            <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
              <div className="max-w-4xl mx-auto p-6">
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-3">Assignment Instructions</h2>
                <div
                  className="prose prose-sm max-w-none max-h-80 overflow-auto bg-[hsl(var(--card))] rounded-lg p-4 border border-[hsl(var(--border))]"
                  onCopy={handleInstructionCopy}
                >
                  <div className="text-[hsl(var(--foreground))] prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {assignmentInstructions}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showCriteria && hasCriteria ? (
            <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
              <div className="max-w-4xl mx-auto p-6">
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-3">Assignment Criteria</h2>
                <div
                  className="prose prose-sm max-w-none max-h-80 overflow-auto bg-[hsl(var(--card))] rounded-lg p-4 border border-[hsl(var(--border))]"
                  onCopy={handleInstructionCopy}
                >
                  <div className="text-[hsl(var(--foreground))] prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {assignmentCriteria || ''}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Editor */}
          <div className="flex-1 min-h-0 px-6 pb-6 pt-2">
            <div className="max-w-4xl mx-auto h-full min-h-0">
              <TrackedEditor sessionId={sessionId} strictPasteBlocking={strictPasteBlocking} />
            </div>
          </div>
        </div>

        {/* Resize Handle - only show when chat is open */}
        {isChatOpen && (
          <div
            className="w-1 bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary))] cursor-col-resize transition-colors"
            onMouseDown={startResize}
          />
        )}

        {/* Chat (Right) - only show when open */}
        {isChatOpen && (
          <div className="bg-[hsl(var(--muted))]/10" style={{ width: `${chatWidth}px` }}>
            <ChatPanel
              sessionId={sessionId}
              assignmentId={assignmentId}
              isOpen={isChatOpen}
              onToggle={setChatOpen}
              allowWebSearch={allowWebSearch}
            />
          </div>
        )}

        {/* Floating chat button when closed */}
        {!isChatOpen && (
          <div className="fixed top-1/2 right-0 -translate-y-1/2 z-50">
            <Button
              onClick={() => setChatOpen(true)}
              className="rounded-r-none rounded-l-lg shadow-lg h-auto py-4 pl-3 pr-4"
            >
              <Bot className="w-5 h-5 mr-2" />
              <span className="text-xs font-medium">Chat</span>
            </Button>
          </div>
        )}
      </div>

      <SubmissionModal
        isOpen={isSubmissionModalOpen}
        submissions={submissions}
        selectedSubmissionId={selectedSubmissionId}
        onSelectSubmission={setSelectedSubmissionId}
        onClose={() => setIsSubmissionModalOpen(false)}
      />
    </div>
  );
}
