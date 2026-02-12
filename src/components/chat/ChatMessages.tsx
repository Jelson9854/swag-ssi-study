'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { getGlobalValidator } from '@/lib/copy-validator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Copy, Check, Globe, Loader2 } from 'lucide-react';

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

export interface ReplayPasteHighlight {
  id: string;
  messageId: string | number;
  snippet: string;
  timestamp: number;
  timeLabel: string;
}

interface HighlightMatch {
  start: number;
  end: number;
  highlight: ReplayPasteHighlight;
}

const normalizeForComparison = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[`*_#>|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const buildCandidateSnippets = (rawSnippet: string): string[] => {
  const candidates = new Set<string>();

  const addCandidate = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= 3) {
      candidates.add(trimmed);
    }
  };

  const normalizedSnippet = rawSnippet.replace(/\s+/g, ' ').trim();
  addCandidate(rawSnippet);
  addCandidate(normalizedSnippet);
  addCandidate(rawSnippet.replace(/[`*_#>|[\]()-]/g, ' ').replace(/\s+/g, ' ').trim());

  // Long snippets (e.g., pasted markdown tables) often don't exist as one contiguous text node.
  // Add line/cell-level candidates so table cells can be highlighted individually.
  const lines = rawSnippet
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  lines.forEach((line) => {
    if (/^[:|\-\s]+$/.test(line)) {
      return;
    }

    addCandidate(line);
    addCandidate(line.replace(/\s+/g, ' ').trim());
    addCandidate(line.replace(/[`*_#>|[\]()-]/g, ' ').replace(/\s+/g, ' ').trim());

    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length >= 3 && !/^:?-{2,}:?$/.test(cell));
      cells.forEach((cell) => addCandidate(cell));
    }
  });

  if (normalizedSnippet.length >= 60) {
    addCandidate(normalizedSnippet.slice(0, 120).trim());
    addCandidate(normalizedSnippet.slice(0, 60).trim());
  }

  return Array.from(candidates).slice(0, 40);
};

const collectHighlightMatches = (text: string, highlights: ReplayPasteHighlight[]): HighlightMatch[] => {
  if (!text || highlights.length === 0) {
    return [];
  }

  const allMatches: HighlightMatch[] = [];
  const lowerText = text.toLowerCase();

  highlights.forEach((highlight) => {
    const rawSnippet = highlight.snippet.trim();
    if (rawSnippet.length < 3) {
      return;
    }

    const candidateSnippets = buildCandidateSnippets(rawSnippet);

    for (const snippet of candidateSnippets) {
      const lowerSnippet = snippet.toLowerCase();
      let searchIndex = 0;

      while (searchIndex < lowerText.length) {
        const matchIndex = lowerText.indexOf(lowerSnippet, searchIndex);
        if (matchIndex === -1) {
          break;
        }

        allMatches.push({
          start: matchIndex,
          end: matchIndex + snippet.length,
          highlight,
        });
        searchIndex = matchIndex + snippet.length;
      }
    }
  });

  if (allMatches.length === 0) {
    // Fallback: if this whole text node is included in pasted content, highlight the node.
    // This is especially useful for plain-text copies of rendered tables where row text
    // may not preserve explicit cell delimiters.
    const normalizedText = normalizeForComparison(text);
    if (normalizedText.length >= 4) {
      const matchedHighlight = highlights.find((highlight) => {
        const normalizedSnippet = normalizeForComparison(highlight.snippet);
        return normalizedSnippet.includes(normalizedText);
      });

      if (matchedHighlight) {
        return [{
          start: 0,
          end: text.length,
          highlight: matchedHighlight,
        }];
      }
    }

    return [];
  }

  allMatches.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return (b.end - b.start) - (a.end - a.start);
  });

  const dedupedMatches: HighlightMatch[] = [];
  let cursor = 0;

  for (const match of allMatches) {
    if (match.start < cursor) {
      continue;
    }
    dedupedMatches.push(match);
    cursor = match.end;
  }

  return dedupedMatches;
};

const renderHighlightedText = (
  text: string,
  highlights: ReplayPasteHighlight[],
  onReplayPasteClick?: (timestamp: number) => void
): ReactNode => {
  const matches = collectHighlightMatches(text, highlights);
  if (matches.length === 0) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }

    const highlightedText = text.slice(match.start, match.end);
    parts.push(
      <button
        key={`${match.highlight.id}-${match.start}-${index}`}
        type="button"
        className="inline rounded-sm bg-amber-200/90 px-0.5 text-amber-950 underline decoration-amber-500/70 underline-offset-2 hover:bg-amber-300 transition-colors"
        data-tooltip-id="timeline-tooltip"
        data-tooltip-html={`<div class="text-center"><div class="font-semibold text-emerald-300">Internal Paste</div><div class="text-xs text-gray-300 mt-1">at ${match.highlight.timeLabel}</div><div class="text-xs text-gray-400 mt-1">Click to jump</div></div>`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReplayPasteClick?.(match.highlight.timestamp);
        }}
      >
        {highlightedText}
      </button>
    );

    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
};

const renderHighlightedChildren = (
  children: ReactNode,
  highlights: ReplayPasteHighlight[],
  onReplayPasteClick?: (timestamp: number) => void
): ReactNode => {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return renderHighlightedText(child, highlights, onReplayPasteClick);
    }

    if (!isValidElement<{ children?: ReactNode }>(child)) {
      return child;
    }

    const typedChild = child as ReactElement<{ children?: ReactNode }>;
    if (typeof typedChild.type === 'string') {
      if (typedChild.type === 'code' || typedChild.type === 'pre' || typedChild.type === 'button') {
        return typedChild;
      }
    }

    if (typedChild.props.children === undefined) {
      return typedChild;
    }

    return cloneElement(
      typedChild,
      typedChild.props,
      renderHighlightedChildren(typedChild.props.children, highlights, onReplayPasteClick)
    );
  });
};

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
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
              {/* Conversation badge above message */}
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

              {/* Metadata row (Timestamp, Search, Copy) */}
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

                {/* Copy button - only for assistant messages */}
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

      {/* Loading indicator */}
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
