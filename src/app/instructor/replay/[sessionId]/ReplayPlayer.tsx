'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { Tooltip as TimelineTooltip } from 'react-tooltip';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChatPanel from '@/components/chat/ChatPanel';
import type { ReplayPasteHighlight } from '@/components/chat/replayPasteHighlight';
import { useUIStore } from '@/stores/uiStore';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react';
import { Button } from '@/components/ui/button';
import { Play, Pause, ChevronDown, Check, Keyboard, MessageSquare, ClipboardCopy, AlertTriangle, Send, BarChart3 } from 'lucide-react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import 'react-tooltip/dist/react-tooltip.css';

interface EditorEvent {
  id: number;
  sessionId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  timestamp: number;
  sequenceNumber: number;
}

interface ChatMessage {
  id: number;
  conversationId: string;
  conversationTitle: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  timestamp: number;
  sequenceNumber: number;
}

interface Conversation {
  id: string;
  sessionId: string;
  title: string;
  createdAt: number;
}

interface ReplayPlayerProps {
  events: EditorEvent[];
  chatMessages: ChatMessage[];
  conversations: Conversation[];
  startTime: number;
  endTime: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10];

interface WordCountSnapshot {
  timestamp: number;
  wordCount: number;
}

interface WordCountGraphPoint {
  percentage: number;
  wordCount: number;
  time: number;
  timeFormatted: string;
}

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
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        walk(child, key);
      }
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

const normalizeForMatching = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[`*_#>|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export default function ReplayPlayer({
  events,
  chatMessages,
  conversations,
  startTime,
  endTime,
}: ReplayPlayerProps) {
  // UI Store for chat panel
  const {
    isChatOpen,
    chatWidth,
    isResizing,
    setChatOpen,
    startResize,
    handleResize,
    stopResize,
  } = useUIStore();

  // Replay-specific state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [speed, setSpeed] = useState(5); // Default 5x speed
  const [editorDocument, setEditorDocument] = useState<Record<string, unknown>[]>([
    { type: 'paragraph', content: [] }
  ]);
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [currentEvent, setCurrentEvent] = useState<{ type: string; label: string; timestamp: number } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isWordCountGraphExpanded, setIsWordCountGraphExpanded] = useState(true);
  const prevVisibleMessagesCountRef = useRef<number>(0);
  const wordCountGradientId = useId();

  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Create BlockNote editor for replay
  const editor = useCreateBlockNote({
    initialContent: [{ type: 'paragraph', content: [] }],
  });

  // Mark editor as ready after mount
  useEffect(() => {
    if (editor) {
      const timer = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tiptapEditor = (editor as any)._tiptapEditor;
        if (tiptapEditor && tiptapEditor.view) {
          setIsEditorReady(true);
        }
      }, 100); // Small delay to ensure Tiptap is fully mounted

      return () => clearTimeout(timer);
    }
  }, [editor]);

  const duration = endTime - startTime;

  // Detect idle periods FIRST (gaps > 1 minute with no activity)
  const idlePeriods = useMemo(() => {
    const IDLE_THRESHOLD = 60 * 1000; // 1 minute
    const allEventTimes: number[] = [];

    // Collect all event timestamps
    events.forEach(e => allEventTimes.push(e.timestamp));
    chatMessages.forEach(m => allEventTimes.push(m.timestamp));

    // Sort by time
    allEventTimes.sort((a, b) => a - b);

    const periods: Array<{
      start: number;
      end: number;
      duration: number;
      compressedMs: number; // 압축되는 시간 (밀리초)
      edgeSeconds: number; // 앞뒤 표시할 시간 (초)
    }> = [];

    for (let i = 0; i < allEventTimes.length - 1; i++) {
      const gap = allEventTimes[i + 1] - allEventTimes[i];
      if (gap > IDLE_THRESHOLD) {
        const totalSeconds = Math.floor(gap / 1000);
        // 앞뒤 5초씩은 항상 표시하고, 나머지를 압축
        const EDGE_SECONDS = 5;
        const compressibleSeconds = Math.max(0, totalSeconds - (EDGE_SECONDS * 2));
        const compressedMs = compressibleSeconds * 1000;

        periods.push({
          start: allEventTimes[i],
          end: allEventTimes[i + 1],
          duration: gap,
          compressedMs, // 압축되는 시간 (밀리초)
          edgeSeconds: EDGE_SECONDS,
        });
      }
    }

    return periods;
  }, [events, chatMessages]);

  // Calculate compressed timeline (remove idle periods, keeping only edges)
  const getCompressedTime = useCallback((realTime: number) => {
    let compressed = realTime - startTime;

    // Subtract compressed idle periods before this time
    idlePeriods.forEach(idle => {
      const idleMiddleStart = idle.start + (idle.edgeSeconds * 1000);
      const idleMiddleEnd = idle.end - (idle.edgeSeconds * 1000);
      const compressedDuration = idle.compressedMs;

      if (realTime >= idleMiddleEnd) {
        // We're past the entire idle period - subtract the compressed part
        compressed -= compressedDuration;
      } else if (realTime >= idleMiddleStart) {
        // We're in the middle (compressed) part - this shouldn't happen with jump,
        // but handle it just in case
        compressed -= (realTime - idleMiddleStart);
      }
    });

    return compressed + startTime;
  }, [startTime, idlePeriods]);

  const getRealTime = useCallback((compressedTime: number) => {
    let real = compressedTime - startTime;
    let accumulatedCompression = 0;

    for (const idle of idlePeriods) {
      const idleStartCompressed = idle.start - startTime - accumulatedCompression;
      const compressedDuration = idle.compressedMs;

      if (compressedTime - startTime > idleStartCompressed + (idle.edgeSeconds * 1000)) {
        // We've passed this idle period's first edge
        real += compressedDuration;
        accumulatedCompression += compressedDuration;
      } else {
        break;
      }
    }

    return real + startTime;
  }, [startTime, idlePeriods]);

  // Compressed timeline duration
  const compressedDuration = useMemo(() => {
    const totalCompression = idlePeriods.reduce((sum, idle) =>
      sum + (idle.compressedMs), 0
    );
    return duration - totalCompression;
  }, [duration, idlePeriods]);

  const progress = compressedDuration > 0
    ? ((getCompressedTime(currentTime) - startTime) / compressedDuration) * 100
    : 0;
  const clampedProgress = Math.max(0, Math.min(100, progress));

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

  // Find the nearest snapshot before current time
  const findNearestSnapshot = useCallback((time: number) => {
    const snapshots = events.filter(
      e => e.eventType === 'snapshot' && e.timestamp <= time
    );
    return snapshots[snapshots.length - 1];
  }, [events]);

  // Rebuild editor content up to current time
  const rebuildContent = useCallback((time: number) => {
    // Find nearest snapshot before current time
    const snapshot = findNearestSnapshot(time);

    if (snapshot && snapshot.eventData) {
      // Return BlockNote document structure directly
      const doc = snapshot.eventData as unknown as Record<string, unknown>[];
      if (Array.isArray(doc)) {
        return doc;
      }
    }

    // No snapshot yet - show initial state (empty paragraph)
    return [{ type: 'paragraph', content: [] }];
  }, [findNearestSnapshot]);

  const getVisibleMessageCount = useCallback((time: number) => {
    let left = 0;
    let right = chatMessages.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (chatMessages[mid].timestamp <= time) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }, [chatMessages]);

  // Update visible messages based on current time
  const updateVisibleMessages = useCallback((time: number) => {
    const visibleCount = getVisibleMessageCount(time);
    const previousVisibleCount = prevVisibleMessagesCountRef.current;

    if (visibleCount === previousVisibleCount) {
      return;
    }

    const visible = chatMessages.slice(0, visibleCount);
    setVisibleMessages(visible);

    // Highlight newly added message
    if (visibleCount > previousVisibleCount && visible.length > 0) {
      const newMessage = visible[visible.length - 1];
      setHighlightedMessageId(newMessage.id);
      // Clear highlight after 2 seconds
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
    prevVisibleMessagesCountRef.current = visibleCount;
  }, [chatMessages, getVisibleMessageCount]);

  // Check for editor-related events at current time (paste, submission)
  const checkCurrentEvent = useCallback((time: number) => {
    const EVENT_DISPLAY_DURATION = 3000; // Show event for 3 seconds

    // Check paste events
    const recentPaste = events.find(
      e => (e.eventType === 'paste_internal' || e.eventType === 'paste_external') &&
        e.timestamp <= time &&
        e.timestamp > time - EVENT_DISPLAY_DURATION
    );
    if (recentPaste) {
      setCurrentEvent({
        type: recentPaste.eventType,
        label: recentPaste.eventType === 'paste_external' ? 'External Paste Blocked' : 'Content Pasted',
        timestamp: recentPaste.timestamp,
      });
      return;
    }

    // Check submission events
    const recentSubmission = events.find(
      e => e.eventType === 'submission' &&
        e.timestamp <= time &&
        e.timestamp > time - EVENT_DISPLAY_DURATION
    );
    if (recentSubmission) {
      setCurrentEvent({
        type: 'submission',
        label: 'Submitted',
        timestamp: recentSubmission.timestamp,
      });
      return;
    }

    setCurrentEvent(null);
  }, [events]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = (frameTime: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = frameTime;
      }

      const deltaMs = frameTime - lastFrameTimeRef.current;
      lastFrameTimeRef.current = frameTime;

      setCurrentTime((prev) => {
        let newTime = prev + deltaMs * speed;

        // Check if we're entering an idle period and skip it
        for (const idle of idlePeriods) {
          const idleMiddleStart = idle.start + (idle.edgeSeconds * 1000);
          const idleMiddleEnd = idle.end - (idle.edgeSeconds * 1000);

          // If we just entered the compressed middle part, jump to the end
          if (prev < idleMiddleStart && newTime >= idleMiddleStart) {
            newTime = idleMiddleEnd;
            break;
          }
        }

        if (newTime >= endTime) {
          // Stop playing when reaching the end
          // Use setTimeout to avoid state update during render
          setTimeout(() => setIsPlaying(false), 0);
          return endTime;
        }
        return newTime;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    lastFrameTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, speed, endTime, idlePeriods]);

  // Update content when current time changes
  useEffect(() => {
    const content = rebuildContent(currentTime);
    setEditorDocument(content);
    updateVisibleMessages(currentTime);
    checkCurrentEvent(currentTime);
  }, [currentTime, rebuildContent, updateVisibleMessages, checkCurrentEvent]);

  // Update editor when document changes
  useEffect(() => {
    if (!editor || !isEditorReady || editorDocument.length === 0) return;

    // Safely check if editor is ready
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = (editor as any)._tiptapEditor;
      if (!tiptapEditor || !tiptapEditor.view) {
        return; // Editor not fully mounted yet
      }

      // Prevent updates if content is the same
      const currentDoc = editor.document;
      if (JSON.stringify(currentDoc) === JSON.stringify(editorDocument)) {
        return;
      }

      editor.replaceBlocks(editor.document, editorDocument);
    } catch (error) {
      // Silently ignore editor update errors during replay
      console.debug('Editor update skipped:', error);
    }
  }, [editor, isEditorReady, editorDocument]);

  const seekToPercentage = useCallback((percentage: number) => {
    if (compressedDuration <= 0) return;

    const clampedPercentage = Math.max(0, Math.min(100, percentage));
    const newCompressedTime = startTime + (clampedPercentage / 100) * compressedDuration;
    const newRealTime = getRealTime(newCompressedTime);
    setCurrentTime(Math.max(startTime, Math.min(endTime, newRealTime)));
  }, [compressedDuration, startTime, getRealTime, endTime]);

  // Handle timeline click (accounting for compressed time)
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    seekToPercentage(percentage);
  };

  const handleWordCountGraphClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    seekToPercentage(percentage);
  };

  const handleReplayPasteClick = useCallback((timestamp: number) => {
    setIsPlaying(false);
    setCurrentTime(timestamp);
  }, []);

  // Format time for display
  const formatTime = useCallback((ms: number) => {
    const seconds = Math.floor((ms - startTime) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, [startTime]);

  const snapshotWordCounts = useMemo<WordCountSnapshot[]>(() => {
    const snapshots = events
      .filter((event) => event.eventType === 'snapshot')
      .sort((a, b) => a.timestamp - b.timestamp);

    return snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      wordCount: countWordsFromDocument(snapshot.eventData),
    }));
  }, [events]);

  const wordCountGraphData = useMemo<WordCountGraphPoint[]>(() => {
    if (compressedDuration <= 0) {
      return [{
        percentage: 0,
        wordCount: 0,
        time: startTime,
        timeFormatted: formatTime(startTime),
      }];
    }

    const sampled: WordCountGraphPoint[] = [];
    const sampleCount = 100;
    let snapshotIndex = 0;
    let currentWordCount = 0;

    for (let i = 0; i <= sampleCount; i++) {
      const percentage = (i / sampleCount) * 100;
      const compressedTime = startTime + (compressedDuration * percentage) / 100;
      const realTime = getRealTime(compressedTime);

      while (
        snapshotIndex < snapshotWordCounts.length &&
        snapshotWordCounts[snapshotIndex].timestamp <= realTime
      ) {
        currentWordCount = snapshotWordCounts[snapshotIndex].wordCount;
        snapshotIndex += 1;
      }

      sampled.push({
        percentage,
        wordCount: currentWordCount,
        time: realTime,
        timeFormatted: formatTime(realTime),
      });
    }

    return sampled;
  }, [compressedDuration, startTime, getRealTime, snapshotWordCounts, formatTime]);

  const maxWordCount = useMemo(() => {
    if (wordCountGraphData.length === 0) return 1;
    return Math.max(...wordCountGraphData.map((point) => point.wordCount), 1);
  }, [wordCountGraphData]);

  const replayPasteHighlights = useMemo<ReplayPasteHighlight[]>(() => {
    const searchableMessages = chatMessages.map((message) => ({
      id: message.id,
      timestamp: message.timestamp,
      normalizedContent: normalizeForMatching(message.content),
    }));

    const highlights: ReplayPasteHighlight[] = [];

    events
      .filter((event) => event.eventType === 'paste_internal')
      .forEach((event, index) => {
        const pastedContent = ((event.eventData as { content?: string })?.content || '').trim();
        if (pastedContent.length < 3) {
          return;
        }

        const normalizedPasteContent = normalizeForMatching(pastedContent);
        if (!normalizedPasteContent) {
          return;
        }

        let matchedMessage: (typeof searchableMessages)[number] | undefined;
        for (let i = searchableMessages.length - 1; i >= 0; i -= 1) {
          const message = searchableMessages[i];
          if (message.timestamp > event.timestamp) {
            continue;
          }
          if (message.normalizedContent.includes(normalizedPasteContent)) {
            matchedMessage = message;
            break;
          }
        }

        if (!matchedMessage) {
          return;
        }

        highlights.push({
          id: `paste-highlight-${index}`,
          messageId: matchedMessage.id,
          snippet: pastedContent,
          timestamp: event.timestamp,
          timeLabel: formatTime(event.timestamp),
        });
      });

    return highlights;
  }, [chatMessages, events, formatTime]);

  const visibleReplayPasteHighlights = useMemo(
    () => replayPasteHighlights.filter((highlight) => highlight.timestamp <= currentTime),
    [replayPasteHighlights, currentTime]
  );

  const renderWordCountTooltip = useCallback(
    ({
      active,
      payload,
    }: {
      active?: boolean;
      payload?: ReadonlyArray<{ payload: WordCountGraphPoint }>;
    }) => {
      if (!active || !payload || payload.length === 0) return null;
      const point = payload[0].payload;

      return (
        <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--popover))] px-2 py-1.5 shadow-md">
          <div className="text-xs font-semibold text-[hsl(var(--popover-foreground))]">
            {point.wordCount} words
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            at {point.timeFormatted}
          </div>
        </div>
      );
    },
    []
  );

  // Get timeline markers for events (using compressed time)
  const markers = useMemo(() => {
    const timelineMarkers: Array<{
      id: string;
      position: number;
      type: string;
      label: string;
      content: string;
      time: string;
    }> = [];

    if (compressedDuration <= 0) {
      return timelineMarkers;
    }

    // Chat message markers
    chatMessages.forEach((msg, i) => {
      if (msg.role === 'user') {
        const compressedTime = getCompressedTime(msg.timestamp);
        const position = ((compressedTime - startTime) / compressedDuration) * 100;
        timelineMarkers.push({
          id: `chat-${i}`,
          position,
          type: 'chat',
          label: 'Chat Message',
          content: msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content,
          time: formatTime(msg.timestamp),
        });
      }
    });

    // Paste event markers
    events
      .filter(e => e.eventType === 'paste_internal' || e.eventType === 'paste_external')
      .forEach((event, i) => {
        const compressedTime = getCompressedTime(event.timestamp);
        const position = ((compressedTime - startTime) / compressedDuration) * 100;
        const pasteContent = (event.eventData as { content?: string })?.content || '';
        timelineMarkers.push({
          id: `paste-${i}`,
          position,
          type: event.eventType,
          label: event.eventType === 'paste_external' ? 'External Paste (Blocked)' : 'Internal Paste',
          content: pasteContent.length > 100 ? pasteContent.slice(0, 100) + '...' : pasteContent,
          time: formatTime(event.timestamp),
        });
      });

    // Submission markers
    events
      .filter(e => e.eventType === 'submission')
      .forEach((event, i) => {
        const compressedTime = getCompressedTime(event.timestamp);
        const position = ((compressedTime - startTime) / compressedDuration) * 100;
        timelineMarkers.push({
          id: `submission-${i}`,
          position,
          type: 'submission',
          label: `Submission ${i + 1}`,
          content: '',
          time: formatTime(event.timestamp),
        });
      });

    return timelineMarkers;
  }, [chatMessages, compressedDuration, events, formatTime, getCompressedTime, startTime]);

  // Get typing sessions from all events (to match idle period calculation)
  const typingSessions = useMemo(() => {
    // Use same event list as idle period calculation for consistency
    const allEventTimes: number[] = [];
    events.forEach(e => allEventTimes.push(e.timestamp));
    chatMessages.forEach(m => allEventTimes.push(m.timestamp));
    allEventTimes.sort((a, b) => a - b);

    const sessions: Array<{ startTime: number; endTime: number }> = [];
    const GAP_THRESHOLD = 60 * 1000; // 1 minute gap to match idle period threshold

    if (allEventTimes.length === 0) return sessions;

    let currentSession = {
      startTime: allEventTimes[0],
      endTime: allEventTimes[0],
    };

    for (let i = 1; i < allEventTimes.length; i++) {
      const timeSinceLastEvent = allEventTimes[i] - currentSession.endTime;

      if (timeSinceLastEvent <= GAP_THRESHOLD) {
        currentSession.endTime = allEventTimes[i];
      } else {
        sessions.push(currentSession);
        currentSession = {
          startTime: allEventTimes[i],
          endTime: allEventTimes[i],
        };
      }
    }

    sessions.push(currentSession);
    return sessions;
  }, [events, chatMessages]);

  // Get all navigable events
  const navigableEvents = useMemo(() => {
    const navEvents: Array<{
      time: number;
      type: 'typing_start' | 'chat' | 'paste_internal' | 'paste_external' | 'submission';
      label: string;
      description: string;
    }> = [];

    // Typing session starts
    typingSessions.forEach((session, i) => {
      navEvents.push({
        time: session.startTime,
        type: 'typing_start',
        label: `Typing Session ${i + 1}`,
        description: `Started at ${formatTime(session.startTime)}`,
      });
    });

    // Chat messages
    chatMessages.forEach((msg, i) => {
      if (msg.role === 'user') {
        navEvents.push({
          time: msg.timestamp,
          type: 'chat',
          label: `Chat Message ${i + 1}`,
          description: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : ''),
        });
      }
    });

    // Paste events
    events
      .filter(e => e.eventType === 'paste_internal' || e.eventType === 'paste_external')
      .forEach((event, i) => {
        navEvents.push({
          time: event.timestamp,
          type: event.eventType as 'paste_internal' | 'paste_external',
          label: event.eventType === 'paste_external' ? `External Paste ${i + 1}` : `Internal Paste ${i + 1}`,
          description: `At ${formatTime(event.timestamp)}`,
        });
      });

    // Submissions
    events
      .filter(e => e.eventType === 'submission')
      .forEach((event, i) => {
        navEvents.push({
          time: event.timestamp,
          type: 'submission',
          label: `Submission ${i + 1}`,
          description: `At ${formatTime(event.timestamp)}`,
        });
      });

    // Sort by time
    return navEvents.sort((a, b) => a.time - b.time);
  }, [typingSessions, chatMessages, events, formatTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          // If at the end, restart from beginning
          if (currentTime >= endTime) {
            setCurrentTime(startTime);
          }
          setIsPlaying(prev => !prev);
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Jump to next event
          const nextEvent = navigableEvents.find(ev => ev.time > currentTime);
          if (nextEvent) {
            setCurrentTime(nextEvent.time);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Jump to previous event with speed-adjusted buffer
          const buffer = 1000 * speed; // Buffer scales with playback speed
          const prevEvent = [...navigableEvents]
            .reverse()
            .find(ev => ev.time < currentTime - buffer);
          if (prevEvent) {
            setCurrentTime(prevEvent.time);
          } else if (navigableEvents.length > 0) {
            // Go to first event if no previous
            setCurrentTime(navigableEvents[0].time);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, navigableEvents, speed, startTime, endTime]);

  const replayConversationsForPanel = useMemo(
    () => conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: new Date(conversation.createdAt),
    })),
    [conversations]
  );

  const replayMessagesForPanel = useMemo(
    () => visibleMessages.map((message) => ({
      id: message.id,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      conversationTitle: message.conversationTitle,
      timestamp: message.timestamp,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: message.metadata as { webSearchEnabled?: boolean; webSearchUsed?: boolean; [key: string]: unknown } | undefined,
    })),
    [visibleMessages]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Timeline Controls */}
      <div className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4">
        <div className={`flex gap-4 ${isWordCountGraphExpanded ? 'items-end' : 'items-center'}`}>
          <div className="flex items-center gap-4">
            {/* Play/Pause Button */}
            <Button
              onClick={() => {
                // If at the end, restart from beginning
                if (currentTime >= endTime) {
                  setCurrentTime(startTime);
                }
                setIsPlaying(!isPlaying);
              }}
              size="icon"
              className="rounded-full h-10 w-10"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" fill="currentColor" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
              )}
            </Button>

            {/* Time Display */}
            <div className="text-sm text-[hsl(var(--foreground))] font-mono w-32 tabular-nums">
              {formatTime(currentTime)} / {formatTime(endTime)}
              {idlePeriods.length > 0 && (
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  ({idlePeriods.length} breaks)
                </div>
              )}
            </div>
          </div>

          {/* Timeline Container */}
          <div className="flex-1 flex flex-col gap-1">
            {/* Word Count Graph */}
            {snapshotWordCounts.length > 0 && (
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  isWordCountGraphExpanded ? 'h-28' : 'h-0'
                }`}
              >
                <div
                  className="h-28 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-0.5 py-1 cursor-pointer outline-none focus:outline-none"
                  onClick={handleWordCountGraphClick}
                  tabIndex={-1}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={wordCountGraphData}
                      margin={{ top: 2, right: 4, left: 0, bottom: 0 }}
                      style={{ outline: 'none' }}
                    >
                      <defs>
                        <linearGradient id={wordCountGradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.06} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="percentage" type="number" domain={[0, 100]} hide />
                      <YAxis domain={[0, maxWordCount]} hide />
                      <RechartsTooltip
                        content={renderWordCountTooltip}
                        cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '3 3' }}
                      />
                      <ReferenceLine
                        x={clampedProgress}
                        stroke="#ef4444"
                        strokeWidth={1.2}
                        strokeDasharray="4 4"
                      />
                      <Area
                        type="stepAfter"
                        dataKey="wordCount"
                        stroke="#2563eb"
                        strokeWidth={1.8}
                        fill={`url(#${wordCountGradientId})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Typing Activity Bar (Top) */}
            <div className="h-2 bg-[hsl(var(--secondary))] rounded relative overflow-hidden">
              {typingSessions.map((session, i) => {
                const compressedStart = getCompressedTime(session.startTime);
                const compressedEnd = getCompressedTime(session.endTime);
                const startPos = ((compressedStart - startTime) / compressedDuration) * 100;
                const endPos = ((compressedEnd - startTime) / compressedDuration) * 100;
                const width = endPos - startPos;
                const durationMs = session.endTime - session.startTime;
                const durationMin = Math.floor(durationMs / 60000);
                const durationSec = Math.floor((durationMs % 60000) / 1000);

                return (
                  <div
                    key={`session-${i}`}
                    className="absolute top-0 h-full bg-blue-500/80 rounded cursor-pointer hover:bg-blue-500 transition-colors"
                    style={{
                      left: `${startPos}%`,
                      width: `${Math.max(width, 0.5)}%`,
                    }}
                    data-tooltip-id="timeline-tooltip"
                    data-tooltip-html={`<div class="text-center"><div class="font-semibold">Typing Session ${i + 1}</div><div class="text-xs text-gray-300 mt-1">${formatTime(session.startTime)} - ${formatTime(session.endTime)}</div><div class="text-xs text-gray-400">Duration: ${durationMin}m ${durationSec}s</div></div>`}
                  />
                );
              })}

              {/* Idle period indicators */}
              {idlePeriods.map((idle, i) => {
                const middleStart = idle.start + (idle.edgeSeconds * 1000);
                const compressedMiddleStart = getCompressedTime(middleStart);
                const middlePos = ((compressedMiddleStart - startTime) / compressedDuration) * 100;
                const markerWidth = 2; // 2% width
                const centeredPos = middlePos - (markerWidth / 2);

                return (
                  <div key={`idle-${i}`}>
                    <div
                      className="absolute top-0 h-full bg-[hsl(var(--muted-foreground))] cursor-pointer hover:bg-[hsl(var(--foreground))]"
                      style={{
                        left: `${centeredPos}%`,
                        width: `${markerWidth}%`,
                      }}
                      data-tooltip-id="timeline-tooltip"
                      data-tooltip-html={`<div class="text-center"><div class="font-semibold">Break</div><div class="text-xs text-gray-300 mt-1">${Math.floor(idle.duration / 60000)}m ${Math.floor((idle.duration % 60000) / 1000)}s</div><div class="text-xs text-gray-400">Student was inactive</div></div>`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Main Timeline (Bottom) */}
            <div
              className="h-4 bg-[hsl(var(--input))] rounded cursor-pointer relative group"
              onClick={handleTimelineClick}
            >
              {/* Progress bar */}
              <div
                className="absolute top-0 left-0 h-full bg-[hsl(var(--primary))] rounded-l"
                style={{ width: `${clampedProgress}%` }}
              />

              {/* Event markers */}
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className={`absolute top-0 w-1.5 h-full cursor-pointer hover:w-2 transition-all z-10 ${marker.type === 'paste_external'
                    ? 'bg-red-500'
                    : marker.type === 'paste_internal'
                      ? 'bg-emerald-500'
                      : marker.type === 'submission'
                        ? 'bg-orange-500'
                        : 'bg-purple-500'
                    }`}
                  style={{ left: `${marker.position}%` }}
                  data-tooltip-id="timeline-tooltip"
                  data-tooltip-html={`<div style="max-width: 250px;"><div class="font-semibold ${marker.type === 'paste_external' ? 'text-red-300' :
                    marker.type === 'paste_internal' ? 'text-green-300' :
                      marker.type === 'submission' ? 'text-orange-300' : 'text-purple-300'
                    }">${marker.label}</div><div class="text-xs text-gray-300 mt-1">at ${marker.time}</div>${marker.content ? `<div class="text-xs text-gray-200 mt-2 whitespace-pre-wrap">${marker.content}</div>` : ''
                    }</div>`}
                />
              ))}

              {/* Playhead */}
              <div
                className="absolute top-0 w-0.5 h-full bg-[hsl(var(--foreground))] scale-y-125 transition-transform"
                style={{ left: `${clampedProgress}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[hsl(var(--foreground))] rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${clampedProgress}% - 6px)` }}
              />
            </div>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">Speed:</span>
            <Listbox value={speed} onChange={(value) => setSpeed(value)}>
              <div className="relative">
                <ListboxButton className="h-9 px-3 border border-[hsl(var(--input))] rounded-md text-sm bg-[hsl(var(--background))] text-[hsl(var(--foreground))] min-w-[80px] text-left flex items-center justify-between gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <span>{speed}x</span>
                  <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                </ListboxButton>
                <ListboxOptions className="absolute right-0 top-full mt-1 w-24 overflow-auto rounded-md bg-[hsl(var(--popover))] py-1 text-sm shadow-md ring-1 ring-[hsl(var(--border))] z-50 focus:outline-none">
                  {SPEED_OPTIONS.map((s) => (
                    <ListboxOption
                      key={s}
                      value={s}
                      className="cursor-pointer select-none px-3 py-2 hover:bg-[hsl(var(--accent))] text-[hsl(var(--popover-foreground))]"
                    >
                      {({ selected }) => (
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{s}x</span>
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
        </div>

        {/* Legend, Current Event, and Event Navigation - Same Row */}
        <div className="flex items-center justify-between mt-2">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 bg-blue-500/80 rounded" />
              <span>Typing Activity</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-purple-500 rounded" />
              <span>Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-emerald-500 rounded" />
              <span>Internal Paste</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span>External Paste</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-500 rounded" />
              <span>Submission</span>
            </div>
            {idlePeriods.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 bg-[hsl(var(--muted-foreground))] rounded" />
                <span>Break (compressed)</span>
              </div>
            )}
          </div>

          {/* Event Navigation Dropdown */}
          <div className="flex items-center gap-2">
            <Button
              variant={isWordCountGraphExpanded ? 'primary' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setIsWordCountGraphExpanded((prev) => !prev)}
              disabled={snapshotWordCounts.length === 0}
            >
              <BarChart3 className="w-4 h-4" />
              Word Count
            </Button>

            <Menu as="div" className="relative">
              <MenuButton as={Button} variant="outline" size="sm" className="gap-2">
                <div className="flex items-center gap-2">
                  <span>Events</span>
                  <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                </div>
              </MenuButton>

              <MenuItems className="absolute right-0 mt-2 w-80 bg-[hsl(var(--popover))] rounded-lg shadow-xl border border-[hsl(var(--border))] z-20 max-h-96 overflow-y-auto focus:outline-none text-[hsl(var(--popover-foreground))]">
                <div className="sticky top-0 bg-[hsl(var(--muted))] px-4 py-2 border-b border-[hsl(var(--border))]">
                  <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase">
                    Jump to Event ({navigableEvents.length})
                  </p>
                </div>

                {navigableEvents.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))] text-sm">
                    No events recorded
                  </div>
                ) : (
                  <div className="py-1">
                    {navigableEvents.map((event, i) => {
                      const isPast = event.time <= currentTime;

                      const getEventIcon = (type: string) => {
                        switch (type) {
                          case 'typing_start': return <Keyboard className="w-4 h-4 text-blue-500" />;
                          case 'chat': return <MessageSquare className="w-4 h-4 text-purple-500" />;
                          case 'paste_internal': return <ClipboardCopy className="w-4 h-4 text-emerald-500" />;
                          case 'paste_external': return <AlertTriangle className="w-4 h-4 text-destructive" />;
                          case 'submission': return <Send className="w-4 h-4 text-orange-500" />;
                          default: return null;
                        }
                      };

                      return (
                        <MenuItem key={i}>
                          {({ active }) => (
                            <button
                              onClick={() => setCurrentTime(event.time)}
                              className={`w-full px-4 py-3 text-left transition-colors border-b border-[hsl(var(--border))] last:border-0 ${active ? 'bg-[hsl(var(--accent))]' :
                                isPast ? 'bg-[hsl(var(--muted))]/50' : 'bg-[hsl(var(--card))] hover:bg-[hsl(var(--accent))]'
                                }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 p-1 bg-[hsl(var(--muted))] rounded-md">
                                  {getEventIcon(event.type)}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className={`text-sm font-medium truncate ${isPast ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'
                                      }`}>
                                      {event.label}
                                    </p>
                                    <span className={`text-xs font-mono whitespace-nowrap ${isPast ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'
                                      }`}>
                                      {formatTime(event.time)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                                    {event.description}
                                  </p>
                                </div>
                              </div>
                            </button>
                          )}
                        </MenuItem>
                      );
                    })}
                  </div>
                )}
              </MenuItems>
            </Menu>
          </div>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor View (Left) */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Editor</h2>
          </div>
          <div className="flex-1 overflow-auto p-6 bg-white relative">
            {/* Editor Event Indicator */}
            {currentEvent && (
              <div
                className={`absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-md ${
                  currentEvent.type === 'paste_external'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : currentEvent.type === 'paste_internal'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-orange-100 text-orange-700 border border-orange-200'
                }`}
              >
                {currentEvent.type === 'paste_external' && <AlertTriangle className="w-4 h-4" />}
                {currentEvent.type === 'paste_internal' && <ClipboardCopy className="w-4 h-4" />}
                {currentEvent.type === 'submission' && <Send className="w-4 h-4" />}
                <span>{currentEvent.label}</span>
              </div>
            )}
            <div className="max-w-3xl mx-auto">
              <BlockNoteView
                editor={editor}
                editable={false}
                theme="light"
              />
            </div>
          </div>
        </div>

        {/* Resize Handle - only show when chat is open */}
        {isChatOpen && (
          <div
            className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize transition-colors"
            onMouseDown={startResize}
          />
        )}

        {/* Chat View (Right) - Resizable with ChatPanel */}
        {isChatOpen && (
          <div className="bg-gray-50" style={{ width: `${chatWidth}px` }}>
            <ChatPanel
              mode="replay"
              isOpen={isChatOpen}
              onToggle={setChatOpen}
              replayConversations={replayConversationsForPanel}
              replayMessages={replayMessagesForPanel}
              highlightedMessageId={highlightedMessageId}
              replayPasteHighlights={visibleReplayPasteHighlights}
              onReplayPasteClick={handleReplayPasteClick}
            />
          </div>
        )}

        {/* Floating chat button when closed */}
        {!isChatOpen && (
          <div className="fixed top-1/2 right-0 -translate-y-1/2 z-50">
            <button
              onClick={() => setChatOpen(true)}
              className="bg-blue-600 text-white px-3 py-6 rounded-l-lg shadow-lg hover:px-4 transition-all duration-300 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-xs font-medium">AI</span>
            </button>
          </div>
        )}
      </div>

      {/* Timeline Tooltip */}
      <TimelineTooltip
        id="timeline-tooltip"
        place="top"
        className="!bg-gray-900 !rounded-lg !px-3 !py-2 !text-sm !max-w-xs z-50"
        opacity={1}
      />
    </div>
  );
}
