'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getGlobalValidator } from '@/lib/copy-validator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Copy, Check, Globe, Loader2 } from 'lucide-react';
import { renderHighlightedChildren, type ReplayPasteHighlight } from './replayPasteHighlight';

interface Message {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  conversationTitle?: string;
  timestamp?: number;
  metadata?: {
    webSearchEnabled?: boolean;
    webSearchUsed?: boolean;
    [key: string]: unknown;
  };
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
  showConversationBadge?: boolean;
  showTimestamp?: boolean;
  enableCopy?: boolean;
  showWebSearchIndicator?: boolean;
  highlightedMessageId?: number | null;
  replayPasteHighlights?: ReplayPasteHighlight[];
  onReplayPasteClick?: (timestamp: number) => void;
}

export default function ChatMessages({
  messages,
  isLoading = false,
  showConversationBadge = false,
  showTimestamp = false,
  enableCopy = true,
  showWebSearchIndicator = false,
  highlightedMessageId = null,
  replayPasteHighlights = [],
  onReplayPasteClick,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoScrolledHighlightCountRef = useRef(0);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const validator = getGlobalValidator();

  const messagePasteHighlightMap = useMemo(() => {
    const map = new Map<string, ReplayPasteHighlight[]>();

    replayPasteHighlights.forEach((highlight) => {
      const key = String(highlight.messageId);
      const existing = map.get(key);
      if (existing) {
        existing.push(highlight);
      } else {
        map.set(key, [highlight]);
      }
    });

    return map;
  }, [replayPasteHighlights]);

  // Register all messages with validator (both user and assistant)
  useEffect(() => {
    messages.forEach((message) => {
      validator.registerChatMessage(message.content);
    });
  }, [messages, validator]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // When a new replay paste highlight appears, bring that highlight near top for easier scanning.
  useEffect(() => {
    const currentCount = replayPasteHighlights.length;
    if (currentCount === 0) {
      lastAutoScrolledHighlightCountRef.current = 0;
      return;
    }

    if (currentCount <= lastAutoScrolledHighlightCountRef.current) {
      return;
    }

    lastAutoScrolledHighlightCountRef.current = currentCount;
    const latestHighlight = replayPasteHighlights[currentCount - 1];
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !latestHighlight) {
      return;
    }

    requestAnimationFrame(() => {
      const target = scrollContainer.querySelector<HTMLElement>(
        `[data-replay-highlight-id="${latestHighlight.id}"]`
      );
      if (!target) {
        return;
      }

      const topOffset = Math.max(0, target.offsetTop - scrollContainer.offsetTop - 12);
      scrollContainer.scrollTo({
        top: topOffset,
        behavior: 'smooth',
      });
    });
  }, [replayPasteHighlights]);

  // Handle copy events in chat messages area
  useEffect(() => {
    const handleCopy = () => {
      const copiedContent = window.getSelection()?.toString();
      if (copiedContent) {
        validator.markInternalCopy(copiedContent);
      }
    };

    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('copy', handleCopy);
    };
  }, [validator]);

  const copyToClipboard = async (content: string, messageId: string | number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);

      // Mark as internal copy in validator
      validator.markInternalCopy(content);

      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[hsl(var(--muted-foreground))] text-sm text-center">
          Start a conversation with the AI assistant to get help with your essay.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        const isCopied = copiedId === message.id;
        const isLastMessage = index === messages.length - 1;
        const isStreaming = isLastMessage && isLoading && !isUser;
        const isHighlighted = highlightedMessageId === message.id;
        const messageHighlights = messagePasteHighlightMap.get(String(message.id)) ?? [];

        return (
          <div
            key={message.id}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`${isUser ? 'max-w-[85%]' : 'w-full'} ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
              {showConversationBadge && message.conversationTitle && (
                <div className="mb-1 px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded text-xs font-medium self-start">
                  {message.conversationTitle}
                </div>
              )}

              <div
                className={`rounded-2xl px-4 py-3 transition-all duration-300 ${isUser
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-tr-sm'
                  : 'bg-transparent text-[hsl(var(--foreground))] px-0 py-0'
                  } ${isHighlighted ? 'ring-2 ring-purple-500 ring-offset-2 shadow-lg shadow-purple-200' : ''}`}
              >
                {isUser ? (
                  <p className="text-base whitespace-pre-wrap wrap-break-word">
                    {renderHighlightedChildren(message.content, messageHighlights, onReplayPasteClick)}
                  </p>
                ) : (
                  <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-outfit prose-p:leading-relaxed prose-pre:bg-[hsl(var(--muted))] prose-pre:text-[hsl(var(--foreground))] prose-pre:border prose-pre:border-[hsl(var(--border))]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children, ...props }) => (
                          <p {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </p>
                        ),
                        li: ({ children, ...props }) => (
                          <li {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </li>
                        ),
                        blockquote: ({ children, ...props }) => (
                          <blockquote {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </blockquote>
                        ),
                        h1: ({ children, ...props }) => (
                          <h1 {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </h1>
                        ),
                        h2: ({ children, ...props }) => (
                          <h2 {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </h2>
                        ),
                        h3: ({ children, ...props }) => (
                          <h3 {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </h3>
                        ),
                        h4: ({ children, ...props }) => (
                          <h4 {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </h4>
                        ),
                        h5: ({ children, ...props }) => (
                          <h5 {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </h5>
                        ),
                        h6: ({ children, ...props }) => (
                          <h6 {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </h6>
                        ),
                        td: ({ children, ...props }) => (
                          <td {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </td>
                        ),
                        th: ({ children, ...props }) => (
                          <th {...props}>
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </th>
                        ),
                        a: ({ children, ...props }) => (
                          <a {...props} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--primary))] hover:underline">
                            {renderHighlightedChildren(children, messageHighlights, onReplayPasteClick)}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 px-1">
                {(showTimestamp || (showWebSearchIndicator && message.metadata?.webSearchEnabled)) && (
                  <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {showWebSearchIndicator && message.metadata?.webSearchEnabled && (
                      <span className="flex items-center gap-1 text-sky-500">
                        <Globe className="w-3 h-3" />
                        Web search
                      </span>
                    )}
                    {showTimestamp && message.timestamp && (
                      <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                )}

                {!isUser && enableCopy && !isStreaming && (
                  <Button
                    onClick={() => copyToClipboard(message.content, message.id)}
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-transparent"
                    title="Copy message"
                  >
                    {isCopied ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="w-3 h-3" />
                        Copied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="w-3 h-3" />
                        Copy
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-transparent px-0 py-2">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
