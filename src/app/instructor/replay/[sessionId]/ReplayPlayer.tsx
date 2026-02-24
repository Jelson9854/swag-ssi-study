'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { Step } from '@tiptap/pm/transform';
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
import { Tooltip as TimelineTooltip } from '@/components/ui/tooltip';
import { Play, Pause, ChevronDown, Check, Keyboard, MessageSquare, ClipboardCopy, AlertTriangle, Send, BarChart3 } from 'lucide-react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

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

interface WordCountTimelineEntry {
  timestamp: number;
  wordCount: number;
}

interface WordCountGraphPoint {
  percentage: number;
  wordCount: number;
  time: number;
  timeFormatted: string;
}

interface TypingOpEventData {
  stepJson?: Record<string, unknown>;
  stepType?: string;
  stepIndex?: number;
  stepCount?: number;
  transactionTimestamp?: number;
  wordCount?: number;
}

interface ReplayTypingOpEvent extends EditorEvent {
  replayTimestamp: number;
}

const findLastEventIndexAtOrBefore = (items: Array<{ timestamp: number }>, timestamp: number): number => {
  let left = 0;
  let right = items.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (items[mid].timestamp <= timestamp) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left - 1;
};

const findLastReplayTypingIndexAtOrBefore = (
  items: ReplayTypingOpEvent[],
  replayTimestamp: number
): number => {
  let left = 0;
  let right = items.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (items[mid].replayTimestamp <= replayTimestamp) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left - 1;
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

type PasteSourceArea = 'chat' | 'editor' | 'instruction' | 'external' | 'unknown';
type PasteTargetArea = 'editor' | 'chat';

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

const pasteAreaLabel = (area: PasteSourceArea | PasteTargetArea): string => {
  if (area === 'instruction') return 'Instruction';
  if (area === 'chat') return 'Chat';
  if (area === 'editor') return 'Editor';
  if (area === 'external') return 'External';
  return 'Unknown';
};

const getPasteRouteLabel = (event: EditorEvent): string => {
  const eventData = (event.eventData || {}) as { sourceArea?: unknown; targetArea?: unknown };
  const sourceArea = normalizePasteSourceArea(eventData.sourceArea, event.eventType);
  const targetArea = normalizePasteTargetArea(eventData.targetArea);
  return `${pasteAreaLabel(sourceArea)} -> ${pasteAreaLabel(targetArea)}`;
};

const formatClockDuration = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const paddedMinutes = minutes.toString().padStart(2, '0');
  const seconds = safeSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
};

const formatBreakDuration = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, totalSeconds);
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m ${seconds}s`;
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
  const [speed, setSpeed] = useState(5); // Keep existing default speed
  const [editorDocument, setEditorDocument] = useState<Record<string, unknown>[]>([
    { type: 'paragraph', content: [] }
  ]);
  const [replayBaseSnapshotId, setReplayBaseSnapshotId] = useState<number | null>(null);
  const [replayTypingOps, setReplayTypingOps] = useState<ReplayTypingOpEvent[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [visibleReplayPasteHighlights, setVisibleReplayPasteHighlights] = useState<ReplayPasteHighlight[]>([]);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isWordCountGraphExpanded, setIsWordCountGraphExpanded] = useState(true);
  const [stepReplayFailureCount, setStepReplayFailureCount] = useState(0);
  const [lastStepReplayFailure, setLastStepReplayFailure] = useState<string | null>(null);
  const prevVisibleMessagesCountRef = useRef<number>(0);
  const prevVisibleReplayPasteHighlightCountRef = useRef<number>(0);
  const lastAppliedTypingSnapshotKeyRef = useRef<string>('init');
  const lastAppliedTypingSeqRef = useRef<number>(-1);
  const loggedStepFailureSeqsRef = useRef<Set<number>>(new Set());
  const wordCountGradientId = useId();

  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastReplayFrameKeyRef = useRef<string>('');

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

  const snapshotEvents = useMemo(
    () => events.filter((event) => event.eventType === 'snapshot'),
    [events]
  );

  const typingOpEventsForReplay = useMemo<ReplayTypingOpEvent[]>(() => {
    const typingEvents = events.filter((event) => event.eventType === 'typing_op');
    if (typingEvents.length === 0) {
      return [];
    }

    const MIN_TYPING_GAP_MS = 75;
    const MAX_TYPING_DRIFT_MS = 1200;
    let previousReplayTimestamp = Number.NEGATIVE_INFINITY;

    return typingEvents.map((event) => {
      let replayTimestamp = event.timestamp;
      if (previousReplayTimestamp > Number.NEGATIVE_INFINITY) {
        replayTimestamp = Math.max(replayTimestamp, previousReplayTimestamp + MIN_TYPING_GAP_MS);
      }

      const maxAllowedTimestamp = event.timestamp + MAX_TYPING_DRIFT_MS;
      if (replayTimestamp > maxAllowedTimestamp) {
        replayTimestamp = maxAllowedTimestamp;
      }

      if (replayTimestamp <= previousReplayTimestamp) {
        replayTimestamp = previousReplayTimestamp + 1;
      }

      previousReplayTimestamp = replayTimestamp;
      return {
        ...event,
        replayTimestamp,
      };
    });
  }, [events]);

  const findNearestSnapshot = useCallback((time: number) => {
    const snapshotIndex = findLastEventIndexAtOrBefore(snapshotEvents, time);
    if (snapshotIndex < 0) {
      return undefined;
    }
    return snapshotEvents[snapshotIndex];
  }, [snapshotEvents]);

  const getTypingOpsInWindow = useCallback((
    startExclusive: number,
    endInclusive: number,
    snapshotId: number | null
  ) => {
    if (typingOpEventsForReplay.length === 0 || endInclusive < startExclusive) {
      return [];
    }

    const endIndex = findLastReplayTypingIndexAtOrBefore(typingOpEventsForReplay, endInclusive);
    if (endIndex < 0) {
      return [];
    }

    let startIndex = findLastReplayTypingIndexAtOrBefore(typingOpEventsForReplay, startExclusive);
    startIndex = Math.max(startIndex + 1, 0);

    if (startIndex > endIndex) {
      return [];
    }

    const candidateEvents = typingOpEventsForReplay.slice(startIndex, endIndex + 1);
    return snapshotId !== null
      ? candidateEvents.filter((event) => event.id > snapshotId)
      : candidateEvents;
  }, [typingOpEventsForReplay]);

  // Detect idle periods FIRST (gaps > 3 minutes with no activity)
  const idlePeriods = useMemo(() => {
    const IDLE_THRESHOLD = 3 * 60 * 1000; // 3 minutes
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
        // Break는 replay 시간축에서 0초로 취급한다.
        const EDGE_SECONDS = 0;
        const compressedMs = Math.max(0, gap - (EDGE_SECONDS * 2 * 1000));

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

  // Calculate compressed timeline (remove idle periods, collapsing breaks)
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

  useEffect(() => {
    if (isPlaying && currentTime >= endTime) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentTime, endTime]);

  // Update content when current time changes
  useEffect(() => {
    const content = rebuildContent(currentTime);
    setEditorDocument(content);
    const snapshot = findNearestSnapshot(currentTime);
    const snapshotTimestamp = snapshot?.timestamp ?? startTime;
    const snapshotId = snapshot?.id ?? null;
    const typingOpsUntilNow = getTypingOpsInWindow(
      snapshotTimestamp,
      currentTime,
      snapshotId
    );
    const latestTypingSeq = typingOpsUntilNow.length > 0
      ? typingOpsUntilNow[typingOpsUntilNow.length - 1].sequenceNumber
      : -1;
    const frameKey = `${snapshot?.id ?? 'none'}:${latestTypingSeq}`;
    if (frameKey !== lastReplayFrameKeyRef.current) {
      lastReplayFrameKeyRef.current = frameKey;
      setReplayBaseSnapshotId(snapshot?.id ?? null);
      setReplayTypingOps(typingOpsUntilNow);
    }
    updateVisibleMessages(currentTime);
  }, [currentTime, rebuildContent, updateVisibleMessages, findNearestSnapshot, getTypingOpsInWindow, startTime]);

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

      const snapshotKey = replayBaseSnapshotId === null ? 'none' : `snapshot-${replayBaseSnapshotId}`;
      const latestTypingSeq = replayTypingOps.length > 0
        ? replayTypingOps[replayTypingOps.length - 1].sequenceNumber
        : -1;
      const shouldResetBase =
        snapshotKey !== lastAppliedTypingSnapshotKeyRef.current ||
        latestTypingSeq < lastAppliedTypingSeqRef.current;

      if (shouldResetBase) {
        editor.replaceBlocks(editor.document, editorDocument);
        lastAppliedTypingSeqRef.current = -1;
      }

      const typingOpsToApply = shouldResetBase
        ? replayTypingOps
        : replayTypingOps.filter((typingEvent) => typingEvent.sequenceNumber > lastAppliedTypingSeqRef.current);

      const newFailureLogs: Array<{
        sequenceNumber: number;
        stepType: string;
        timestamp: number;
        errorMessage: string;
      }> = [];

      if (typingOpsToApply.length > 0) {
        typingOpsToApply.forEach((typingEvent) => {
          const data = (typingEvent.eventData || {}) as TypingOpEventData;

          const registerFailure = (error: unknown) => {
            if (loggedStepFailureSeqsRef.current.has(typingEvent.sequenceNumber)) {
              return;
            }
            loggedStepFailureSeqsRef.current.add(typingEvent.sequenceNumber);
            const stepType = typeof data.stepType === 'string'
              ? data.stepType
              : 'unknown';
            const errorMessage = error instanceof Error
              ? error.message
              : (typeof error === 'string' ? error : 'Unknown step apply error');
            newFailureLogs.push({
              sequenceNumber: typingEvent.sequenceNumber,
              stepType,
              timestamp: typingEvent.timestamp,
              errorMessage,
            });
          };

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const state = (tiptapEditor as any).state;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const view = (tiptapEditor as any).view;
            if (!state || !view) {
              return;
            }

            if (!data.stepJson || typeof data.stepJson !== 'object') {
              registerFailure('Missing stepJson in typing_op event');
              return;
            }

            try {
              const step = Step.fromJSON(state.schema, data.stepJson);
              const tr = state.tr.step(step);
              if (tr.docChanged) {
                view.dispatch(tr);
              }
            } catch (error) {
              registerFailure(error);
            }
          } catch (error) {
            registerFailure(error);
            // If an op fails, continue with the rest and rely on the next snapshot to self-heal.
          }
        });
      }

      if (newFailureLogs.length > 0) {
        setStepReplayFailureCount(loggedStepFailureSeqsRef.current.size);
        const latestFailure = newFailureLogs[newFailureLogs.length - 1];
        setLastStepReplayFailure(`${latestFailure.stepType} (seq ${latestFailure.sequenceNumber})`);

        newFailureLogs.forEach((failure) => {
          console.warn('[replay] typing_op apply failed', {
            sequenceNumber: failure.sequenceNumber,
            timestamp: failure.timestamp,
            stepType: failure.stepType,
            error: failure.errorMessage,
          });
        });
      }

      lastAppliedTypingSnapshotKeyRef.current = snapshotKey;
      lastAppliedTypingSeqRef.current = latestTypingSeq;
    } catch (error) {
      // Silently ignore editor update errors during replay
      console.debug('Editor update skipped:', error);
    }
  }, [editor, isEditorReady, editorDocument, replayTypingOps, replayBaseSnapshotId]);

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

  // Format replay clock time (breaks are compressed to 0s)
  const formatReplayTime = useCallback((ms: number) => {
    const compressedMs = getCompressedTime(ms);
    const totalSeconds = Math.max(0, Math.floor((compressedMs - startTime) / 1000));
    return formatClockDuration(totalSeconds);
  }, [getCompressedTime, startTime]);

  const wordCountTimeline = useMemo<WordCountTimelineEntry[]>(() => {
    const timeline: WordCountTimelineEntry[] = [{ timestamp: startTime, wordCount: 0 }];
    let currentWordCount = 0;

    const sortedEvents = [...events].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.sequenceNumber !== b.sequenceNumber) return a.sequenceNumber - b.sequenceNumber;
      return a.id - b.id;
    });

    sortedEvents.forEach((event) => {
      if (event.eventType === 'snapshot') {
        currentWordCount = countWordsFromDocument(event.eventData);
        timeline.push({ timestamp: event.timestamp, wordCount: currentWordCount });
        return;
      }

      if (event.eventType === 'typing_op') {
        const typingData = (event.eventData || {}) as TypingOpEventData;
        const nextWordCount = Number(typingData.wordCount);
        if (Number.isFinite(nextWordCount) && nextWordCount >= 0) {
          currentWordCount = Math.floor(nextWordCount);
          timeline.push({ timestamp: event.timestamp, wordCount: currentWordCount });
        }
      }
    });

    timeline.push({ timestamp: endTime, wordCount: currentWordCount });

    const dedupedByTimestamp: WordCountTimelineEntry[] = [];
    timeline.forEach((entry) => {
      const last = dedupedByTimestamp[dedupedByTimestamp.length - 1];
      if (!last || last.timestamp !== entry.timestamp) {
        dedupedByTimestamp.push(entry);
      } else {
        dedupedByTimestamp[dedupedByTimestamp.length - 1] = entry;
      }
    });

    return dedupedByTimestamp;
  }, [events, startTime, endTime]);

  const wordCountGraphData = useMemo<WordCountGraphPoint[]>(() => {
    if (compressedDuration <= 0) {
      const fallbackWordCount = wordCountTimeline[wordCountTimeline.length - 1]?.wordCount ?? 0;
      return [{
        percentage: 0,
        wordCount: fallbackWordCount,
        time: startTime,
        timeFormatted: formatReplayTime(startTime),
      }];
    }

    const points = wordCountTimeline.map((entry) => {
      const compressedTime = getCompressedTime(entry.timestamp);
      const percentage = ((compressedTime - startTime) / compressedDuration) * 100;
      return {
        percentage: Math.max(0, Math.min(100, percentage)),
        wordCount: entry.wordCount,
        time: entry.timestamp,
        timeFormatted: formatReplayTime(entry.timestamp),
      };
    });

    const dedupedByPercentage: WordCountGraphPoint[] = [];
    points.forEach((point) => {
      const last = dedupedByPercentage[dedupedByPercentage.length - 1];
      if (!last || Math.abs(last.percentage - point.percentage) > 0.001) {
        dedupedByPercentage.push(point);
      } else {
        dedupedByPercentage[dedupedByPercentage.length - 1] = point;
      }
    });

    return dedupedByPercentage;
  }, [compressedDuration, formatReplayTime, getCompressedTime, startTime, wordCountTimeline]);

  const maxWordCount = useMemo(() => {
    if (wordCountGraphData.length === 0) return 1;
    return Math.max(...wordCountGraphData.map((point) => point.wordCount), 1);
  }, [wordCountGraphData]);

  const hasWordCountData = useMemo(() => (
    wordCountGraphData.length > 1 || wordCountGraphData.some((point) => point.wordCount > 0)
  ), [wordCountGraphData]);

  const breakGraphMarkerPositions = useMemo(() => {
    if (compressedDuration <= 0) {
      return [];
    }

    return idlePeriods
      .map((idle) => {
        const markerTime = idle.start + (idle.edgeSeconds * 1000);
        const compressedMarkerTime = getCompressedTime(markerTime);
        const position = ((compressedMarkerTime - startTime) / compressedDuration) * 100;
        return Math.max(0, Math.min(100, position));
      })
      .filter((position) => Number.isFinite(position));
  }, [compressedDuration, getCompressedTime, idlePeriods, startTime]);

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
          timeLabel: formatReplayTime(event.timestamp),
        });
      });

    return highlights;
  }, [chatMessages, events, formatReplayTime]);

  useEffect(() => {
    let left = 0;
    let right = replayPasteHighlights.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (replayPasteHighlights[mid].timestamp <= currentTime) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    const visibleCount = left;
    if (visibleCount === prevVisibleReplayPasteHighlightCountRef.current) {
      return;
    }

    prevVisibleReplayPasteHighlightCountRef.current = visibleCount;
    setVisibleReplayPasteHighlights(replayPasteHighlights.slice(0, visibleCount));
  }, [replayPasteHighlights, currentTime]);

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

  const currentEvent = useMemo(() => {
    const EVENT_DISPLAY_DURATION = 3000; // Show event for 3 seconds
    const lowerBound = currentTime - EVENT_DISPLAY_DURATION;

    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.timestamp > currentTime) {
        continue;
      }
      if (event.timestamp <= lowerBound) {
        break;
      }

      if (event.eventType === 'paste_internal' || event.eventType === 'paste_external') {
        return {
          type: event.eventType,
          label: event.eventType === 'paste_external' ? 'External Paste' : 'Content Pasted',
          detail: getPasteRouteLabel(event),
          timestamp: event.timestamp,
        };
      }

      if (event.eventType === 'typing_op') {
        const typingData = (event.eventData || {}) as TypingOpEventData;
        const stepTypeLabel = typeof typingData.stepType === 'string' ? typingData.stepType : null;
        return {
          type: 'typing_op',
          label: 'Typing Step',
          detail: stepTypeLabel,
          timestamp: event.timestamp,
        };
      }

      if (event.eventType === 'submission') {
        return {
          type: 'submission',
          label: 'Submitted',
          detail: null,
          timestamp: event.timestamp,
        };
      }
    }

    return null;
  }, [events, currentTime]);

  // Get timeline markers for events (using compressed time)
  const markers = useMemo(() => {
    const timelineMarkers: Array<{
      id: string;
      position: number;
      type: string;
      label: string;
      content: string;
      time: string;
      route?: string;
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
          time: formatReplayTime(msg.timestamp),
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
        const route = getPasteRouteLabel(event);
        timelineMarkers.push({
          id: `paste-${i}`,
          position,
          type: event.eventType,
          label: event.eventType === 'paste_external' ? 'External Paste' : 'Internal Paste',
          content: pasteContent.length > 100 ? pasteContent.slice(0, 100) + '...' : pasteContent,
          time: formatReplayTime(event.timestamp),
          route,
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
          time: formatReplayTime(event.timestamp),
        });
      });

    return timelineMarkers;
  }, [chatMessages, compressedDuration, events, formatReplayTime, getCompressedTime, startTime]);

  // Get typing sessions from editor writing events only (exclude chat-only activity)
  const typingSessions = useMemo(() => {
    const writingEventTimes: number[] = [];

    events.forEach((event) => {
      if (event.eventType === 'typing_op') {
        writingEventTimes.push(event.timestamp);
        return;
      }

      if (event.eventType === 'paste_internal' || event.eventType === 'paste_external') {
        const targetArea = (event.eventData as { targetArea?: unknown } | undefined)?.targetArea;
        if (targetArea !== 'chat') {
          writingEventTimes.push(event.timestamp);
        }
      }
    });
    writingEventTimes.sort((a, b) => a - b);

    const sessions: Array<{ startTime: number; endTime: number }> = [];
    const GAP_THRESHOLD = 10 * 1000; // keep same typing session only within 10 seconds

    if (writingEventTimes.length === 0) return sessions;

    let currentSession = {
      startTime: writingEventTimes[0],
      endTime: writingEventTimes[0],
    };

    for (let i = 1; i < writingEventTimes.length; i++) {
      const timeSinceLastEvent = writingEventTimes[i] - currentSession.endTime;

      if (timeSinceLastEvent <= GAP_THRESHOLD) {
        currentSession.endTime = writingEventTimes[i];
      } else {
        sessions.push(currentSession);
        currentSession = {
          startTime: writingEventTimes[i],
          endTime: writingEventTimes[i],
        };
      }
    }

    sessions.push(currentSession);
    return sessions;
  }, [events]);

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
        description: `Started at ${formatReplayTime(session.startTime)}`,
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
        const routeLabel = getPasteRouteLabel(event);
        navEvents.push({
          time: event.timestamp,
          type: event.eventType as 'paste_internal' | 'paste_external',
          label: event.eventType === 'paste_external' ? `External Paste ${i + 1}` : `Internal Paste ${i + 1}`,
          description: `${routeLabel} at ${formatReplayTime(event.timestamp)}`,
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
          description: `At ${formatReplayTime(event.timestamp)}`,
        });
      });

    // Sort by time
    return navEvents.sort((a, b) => a.time - b.time);
  }, [typingSessions, chatMessages, events, formatReplayTime]);

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
            <div className="text-sm text-[hsl(var(--foreground))] font-mono w-44 tabular-nums">
              <span className="whitespace-nowrap">
                {formatReplayTime(currentTime)} / {formatReplayTime(endTime)}
              </span>
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
            {hasWordCountData && (
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
                      {breakGraphMarkerPositions.map((position, i) => (
                        <ReferenceLine
                          key={`break-graph-marker-${i}`}
                          x={position}
                          stroke="#111827"
                          strokeWidth={1.2}
                          strokeOpacity={0.9}
                          strokeDasharray="2 2"
                        />
                      ))}
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
                const replayDurationSeconds = Math.max(
                  0,
                  Math.floor((compressedEnd - compressedStart) / 1000)
                );
                const replayDurationLabel = formatClockDuration(replayDurationSeconds);

                return (
                  <div
                    key={`session-${i}`}
                    className="absolute top-0 h-full bg-blue-500/80 rounded cursor-pointer hover:bg-blue-500 transition-colors"
                    style={{
                      left: `${startPos}%`,
                      width: `${Math.max(width, 0.5)}%`,
                    }}
                    data-tooltip-id="timeline-tooltip"
                    data-tooltip-html={`<div class="text-center"><div class="font-semibold">Typing Session ${i + 1}</div><div class="text-xs text-gray-300 mt-1">${formatReplayTime(session.startTime)} - ${formatReplayTime(session.endTime)}</div><div class="text-xs text-gray-400">Duration: ${replayDurationLabel}</div></div>`}
                  />
                );
              })}

              {/* Idle period indicators */}
              {idlePeriods.map((idle, i) => {
                const middleStart = idle.start + (idle.edgeSeconds * 1000);
                const compressedMiddleStart = getCompressedTime(middleStart);
                const middlePos = ((compressedMiddleStart - startTime) / compressedDuration) * 100;
                const markerWidth = 1; // narrower break marker
                const centeredPos = middlePos - (markerWidth / 2);
                const realBreakDurationSeconds = Math.floor(idle.duration / 1000);
                const realBreakDurationLabel = formatBreakDuration(realBreakDurationSeconds);

                return (
                  <div key={`idle-${i}`}>
                    <div
                      className="absolute top-0 h-full bg-black/90 cursor-pointer hover:bg-black shadow-[0_0_6px_rgba(0,0,0,0.5)]"
                      style={{
                        left: `${centeredPos}%`,
                        width: `${markerWidth}%`,
                      }}
                      data-tooltip-id="timeline-tooltip"
                      data-tooltip-html={`<div class="text-center"><div class="font-semibold">Break</div><div class="text-xs text-gray-300 mt-1">${realBreakDurationLabel}</div><div class="text-xs text-gray-400">Student was inactive</div></div>`}
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
                        ? 'bg-blue-600'
                        : 'bg-purple-500'
                    }`}
                  style={{ left: `${marker.position}%` }}
                  data-tooltip-id="timeline-tooltip"
                  data-tooltip-html={`<div style="max-width: 250px;"><div class="font-semibold ${marker.type === 'paste_external' ? 'text-red-300' :
                    marker.type === 'paste_internal' ? 'text-green-300' :
                      marker.type === 'submission' ? 'text-blue-300' : 'text-purple-300'
                    }">${marker.label}</div><div class="text-xs text-gray-300 mt-1">at ${marker.time}</div>${marker.route ? `<div class="text-xs text-gray-300 mt-1">${marker.route}</div>` : ''}${marker.content ? `<div class="text-xs text-gray-200 mt-2 whitespace-pre-wrap">${marker.content}</div>` : ''
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
              <div className="w-3 h-3 bg-blue-600 rounded" />
              <span>Submission</span>
            </div>
            {idlePeriods.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 bg-black rounded" />
                <span>Break (compressed)</span>
              </div>
            )}
            {stepReplayFailureCount > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  Step apply failures: {stepReplayFailureCount}
                  {lastStepReplayFailure ? ` (${lastStepReplayFailure})` : ''}
                </span>
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
              disabled={!hasWordCountData}
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
                          case 'submission': return <Send className="w-4 h-4 text-blue-600" />;
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
                                      {formatReplayTime(event.time)}
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
                      : currentEvent.type === 'typing_op'
                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                      : 'bg-blue-100 text-blue-700 border border-blue-200'
                }`}
              >
                {currentEvent.type === 'paste_external' && <AlertTriangle className="w-4 h-4" />}
                {currentEvent.type === 'paste_internal' && <ClipboardCopy className="w-4 h-4" />}
                {currentEvent.type === 'typing_op' && <Keyboard className="w-4 h-4" />}
                {currentEvent.type === 'submission' && <Send className="w-4 h-4" />}
                <div className="flex flex-col leading-tight">
                  <span>{currentEvent.label}</span>
                  {currentEvent.detail && (
                    <span className="text-[11px] opacity-80">{currentEvent.detail}</span>
                  )}
                </div>
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
        className="!bg-gray-900 !text-gray-100 !border-gray-700 !rounded-lg !px-3 !py-2 !text-sm !max-w-xs z-50"
        opacity={1}
      />
    </div>
  );
}
