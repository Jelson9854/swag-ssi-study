'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Button } from '@/components/ui/button';
import { Plus, X, Globe, ChevronDown, Check } from 'lucide-react';
import { getGlobalValidator } from '@/lib/copy-validator';
import toast, { Toaster } from 'react-hot-toast';
import ConversationList from './ConversationList';
import ChatMessages from './ChatMessages';
import type { ReplayPasteHighlight } from './replayPasteHighlight';
import { useChatStore, type Conversation, type Message } from '@/stores/chatStore';

interface ChatPanelProps {
  sessionId?: string;
  assignmentId?: string;
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  allowWebSearch?: boolean;
  // Replay mode props
  mode?: 'live' | 'replay';
  replayConversations?: Conversation[];
  replayMessages?: Message[];
  highlightedMessageId?: number | null;
  replayPasteHighlights?: ReplayPasteHighlight[];
  onReplayPasteClick?: (timestamp: number) => void;
}

function ChatPanel({
  sessionId,
  assignmentId,
  // isOpen not used in component body but kept in props for interface
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isOpen,
  onToggle,
  allowWebSearch = false,
  mode = 'live',
  replayConversations = [],
  replayMessages = [],
  highlightedMessageId = null,
  replayPasteHighlights = [],
  onReplayPasteClick,
}: ChatPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const validator = getGlobalValidator();
  const [replayActiveConversationId, setReplayActiveConversationId] = useState<'all' | string>('all');

  // Zustand store
  const {
    mode: storeMode,
    conversations,
    activeConversationId,
    messages,
    input,
    isLoading,
    isCreatingConversation,
    webSearchEnabled,
    setMode,
    setActiveConversationId,
    setInput,
    toggleWebSearch,
    loadConversations,
    loadMessages,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    sendMessage,
  } = useChatStore();

  const isReplayMode = mode === 'replay';
  const replayConversationsWithDate = useMemo(
    () => replayConversations.map((conversation) => ({
      ...conversation,
      createdAt: new Date(conversation.createdAt),
    })),
    [replayConversations]
  );

  const replayVisibleMessages = useMemo(() => {
    if (replayActiveConversationId === 'all') {
      return replayMessages;
    }

    const activeReplayConversation = replayConversationsWithDate.find(
      (conversation) => conversation.id === replayActiveConversationId
    );
    if (!activeReplayConversation) {
      return replayMessages;
    }

    return replayMessages.filter(
      (message) => message.conversationTitle === activeReplayConversation.title
    );
  }, [replayActiveConversationId, replayMessages, replayConversationsWithDate]);

  // Set mode on mount
  useEffect(() => {
    if (storeMode !== mode) {
      setMode(mode);
    }
  }, [mode, setMode, storeMode]);

  // Load conversations on mount (live mode only)
  useEffect(() => {
    if (isReplayMode) {
      return;
    }

    if (sessionId) {
      loadConversations(sessionId);
    }
  }, [
    sessionId,
    isReplayMode,
    loadConversations,
  ]);

  // Keep replay conversation selection valid as replay data changes
  useEffect(() => {
    if (!isReplayMode) {
      return;
    }

    if (
      replayActiveConversationId !== 'all' &&
      !replayConversationsWithDate.some((conversation) => conversation.id === replayActiveConversationId)
    ) {
      setReplayActiveConversationId('all');
    }
  }, [isReplayMode, replayActiveConversationId, replayConversationsWithDate]);

  // Load messages when active conversation changes (live mode only)
  useEffect(() => {
    if (isReplayMode) {
      return;
    }

    if (!activeConversationId) return;

    if (activeConversationId !== 'all') {
      loadMessages(activeConversationId);
    }
  }, [
    activeConversationId,
    isReplayMode,
    loadMessages,
  ]);

  const shownConversations = isReplayMode ? replayConversationsWithDate : conversations;
  const shownActiveConversationId = isReplayMode ? replayActiveConversationId : activeConversationId;
  const shownMessages = isReplayMode ? replayVisibleMessages : messages;

  // Copy/Paste validation for chat input
  useEffect(() => {
    const inputElement = inputRef.current;
    if (!inputElement) return;

    const handleCopy = () => {
      const copiedContent = window.getSelection()?.toString();
      if (copiedContent) {
        validator.markInternalCopy(copiedContent);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const pastedContent = e.clipboardData?.getData('text/plain');
      if (!pastedContent) return;

      const isInternal = validator.validatePaste(pastedContent);

      if (!isInternal) {
        // Block external paste
        e.preventDefault();
        toast.error('External paste is blocked. You can only paste content from within this system.', {
          duration: 4000,
          position: 'top-center',
          style: {
            background: '#EF4444',
            color: '#fff',
          },
        });
      } else {
        // Clear the copy buffer after successful paste
        validator.clearCopyBuffer();
      }
    };

    inputElement.addEventListener('copy', handleCopy);
    inputElement.addEventListener('paste', handlePaste as EventListener);

    return () => {
      inputElement.removeEventListener('copy', handleCopy);
      inputElement.removeEventListener('paste', handlePaste as EventListener);
    };
  }, [validator]);

  // Auto-generate title from first message (only in live mode)
  useEffect(() => {
    if (isReplayMode) return;

    if (messages.length === 1 && activeConversationId && activeConversationId !== 'all') {
      const firstMessage = messages[0];
      if (firstMessage.role === 'user') {
        const title = firstMessage.content.slice(0, 50) + (firstMessage.content.length > 50 ? '...' : '');
        updateConversationTitle(activeConversationId, title);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeConversationId, isReplayMode]);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !activeConversationId || activeConversationId === 'all') return;

    await sendMessage({
      conversationId: activeConversationId,
      sessionId,
      assignmentId,
    });
  };

  const handleCreateConversation = () => {
    if (sessionId) {
      createConversation(sessionId);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId);

    // If we need to create a new conversation after deleting the last one
    if (conversations.length === 1 && sessionId) {
      createConversation(sessionId);
    }
  };

  return (
    <>
      <Toaster
        toastOptions={{
          className: '',
          style: {
            cursor: 'pointer',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />

      {/* Chat panel - always rendered for smooth animation */}
      <div className="flex flex-col h-full bg-[hsl(var(--background))]">
        {/* Header with New Conversation and Close buttons */}
        <div className="border-b border-[hsl(var(--border))] px-4 py-3 flex items-center justify-between bg-[hsl(var(--card))]">
          <h3 className="font-semibold text-[hsl(var(--foreground))]">AI Assistant</h3>
          <div className="flex items-center gap-2">
            {/* New conversation button - only show in live mode */}
            {!isReplayMode && (
              <Button
                onClick={handleCreateConversation}
                disabled={isCreatingConversation}
                variant="ghost"
                size="icon"
                title="New conversation"
              >
                <Plus className="w-5 h-5" />
              </Button>
            )}
            <Button
              onClick={() => onToggle(false)}
              variant="ghost"
              size="icon"
              title="Close chat"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Conversation filter - show in replay mode when there are conversations */}
        {isReplayMode && shownConversations.length > 0 && (
          <div className="border-b border-[hsl(var(--border))] px-4 py-2 bg-[hsl(var(--muted))]/10">
            <Listbox
              value={shownActiveConversationId || 'all'}
              onChange={(value) => setReplayActiveConversationId(value)}
            >
              <div className="relative">
                <ListboxButton className="w-full px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-left flex items-center justify-between gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <span>
                    {shownActiveConversationId === 'all' || !shownActiveConversationId
                      ? `All conversations (${shownConversations.length})`
                      : shownConversations.find(c => c.id === shownActiveConversationId)?.title || 'Conversation'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                </ListboxButton>
                <ListboxOptions className="absolute left-0 mt-2 max-h-60 w-full overflow-auto rounded-md bg-[hsl(var(--popover))] py-1 text-sm shadow-md ring-1 ring-[hsl(var(--border))] z-10 focus:outline-none">
                  <ListboxOption
                    value="all"
                    className="cursor-pointer select-none px-3 py-2 hover:bg-[hsl(var(--accent))] text-[hsl(var(--popover-foreground))]"
                  >
                    {({ selected }) => (
                      <div className="flex items-center justify-between">
                        <span className="font-medium">All conversations ({shownConversations.length})</span>
                        {selected && (
                          <Check className="w-4 h-4 text-[hsl(var(--primary))]" />
                        )}
                      </div>
                    )}
                  </ListboxOption>
                  {shownConversations.map((conv) => (
                    <ListboxOption
                      key={conv.id}
                      value={conv.id}
                      className="cursor-pointer select-none px-3 py-2 hover:bg-[hsl(var(--accent))] text-[hsl(var(--popover-foreground))]"
                    >
                      {({ selected }) => (
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{conv.title}</span>
                          {selected && (
                            <Check className="w-4 h-4 text-[hsl(var(--primary))]" />
                          )}
                        </div>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>
        )}

        {/* Conversation List (collapsible) - only show in live mode */}
        {!isReplayMode && conversations.length > 1 && (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={setActiveConversationId}
            onUpdateTitle={updateConversationTitle}
            onDeleteConversation={handleDeleteConversation}
          />
        )}

        {/* Chat Messages */}
        <ChatMessages
          messages={shownMessages}
          isLoading={isReplayMode ? false : isLoading}
          showConversationBadge={isReplayMode && shownActiveConversationId === 'all'}
          showTimestamp={isReplayMode}
          enableCopy={!isReplayMode}
          showWebSearchIndicator={isReplayMode}
          highlightedMessageId={highlightedMessageId}
          replayPasteHighlights={isReplayMode ? replayPasteHighlights : []}
          onReplayPasteClick={isReplayMode ? onReplayPasteClick : undefined}
        />

        {/* Input - only show in live mode */}
        {!isReplayMode && (
          <div className="p-4 bg-[hsl(var(--muted))]/10 border-t border-[hsl(var(--border))]">
            <form onSubmit={handleSubmit}>
              {/* ChatGPT-style input container */}
              <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-3 flex flex-col gap-2 shadow-sm focus-within:ring-2 focus-within:ring-[hsl(var(--primary))]/20 transition-all">
                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && activeConversationId && !isLoading) {
                        handleSubmit(e as unknown as React.FormEvent);
                      }
                    }
                  }}
                  placeholder="Ask for help with your essay..."
                  disabled={!activeConversationId || isLoading}
                  rows={1}
                  className="w-full bg-transparent resize-none outline-none text-base text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] disabled:text-[hsl(var(--muted-foreground))]"
                  style={{
                    minHeight: '28px',
                    maxHeight: '200px',
                    height: 'auto',
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />

                {/* Web Search Toggle and Send Button Row */}
                <div className="flex items-center justify-between">
                  {/* Web Search Toggle - Ghost style (only show if allowed by instructor) */}
                  {allowWebSearch ? (
                    <Button
                      type="button"
                      onClick={toggleWebSearch}
                      variant="ghost"
                      size="sm"
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${webSearchEnabled
                        ? 'text-sky-500 bg-sky-500/10 hover:bg-sky-500/20'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'
                        }`}
                    >
                      <Globe className="w-4 h-4" />
                      <span>Web search</span>
                    </Button>
                  ) : (
                    <div />
                  )}

                  {/* Send Button - Circular */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || !activeConversationId}
                    className={`p-2 rounded-full transition-colors flex items-center justify-center ${input.trim() && activeConversationId && !isLoading
                      ? 'bg-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground))]/90 text-[hsl(var(--background))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
                      }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(ChatPanel);
