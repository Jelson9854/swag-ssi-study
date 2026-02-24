import type { PasteMatchMethod, PasteSource } from './copy-validator';
import {
  getLegacyPreludeSequenceStorageKey,
  getSwagSequenceStorageKey,
  SWAG_CUSTOM_EVENTS,
} from './swag-events';

export interface EditorEventData {
  type:
    | 'paste_internal'
    | 'paste_external'
    | 'snapshot'
    | 'submission'
    | 'typing_op'
    | 'editor_selection'
    | 'chat_input'
    | 'chat_web_search_toggle';
  timestamp: number;
  sequenceNumber: number;
  data?: unknown;
}

export type PasteTargetArea = 'editor' | 'chat';

export interface PasteEventContext {
  sourceArea?: PasteSource;
  targetArea?: PasteTargetArea;
  matchMethod?: PasteMatchMethod;
}

export interface TypingOpContext {
  stepJson: Record<string, unknown>;
  stepType?: string;
  stepIndex?: number;
  stepCount?: number;
  transactionTimestamp?: number;
  wordCount?: number;
  docContentSize?: number;
  addedWords?: number;
  deletedUserWords?: number;
  deletedGptWords?: number;
  source?: 'user' | 'gpt';
}

export interface EditorSelectionContext {
  from: number;
  to: number;
}

export interface ChatInputContext {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  conversationId?: string;
  webSearchEnabled?: boolean;
  trigger?: 'input' | 'selection' | 'submit_clear' | 'web_search_toggle';
}

export interface ChatWebSearchToggleContext {
  enabled: boolean;
  conversationId?: string;
}

export class EventTracker {
  private queue: EditorEventData[] = [];
  private sequenceNumber = 0;
  private sessionId: string;
  private sequenceStorageKey: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private lastSnapshotTime = Date.now();
  private lastActivityTime = 0;
  private activityCount = 0;
  private activityThrottle = 1000; // 1초마다 최대 1번 활동 카운트
  private snapshotCallback: (() => void) | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private keystrokeCount = 0; // 키 입력 카운터
  private lastSnapshotSequenceNumber = -1;
  private lastEditorSelectionKey = '';
  private lastEditorSelectionLoggedAt = 0;
  private lastChatInputKey = '';
  private lastChatInputLoggedAt = 0;
  private KEYSTROKES_PER_SNAPSHOT = 80; // 80번 입력마다 snapshot
  private INACTIVITY_SNAPSHOT_DELAY_MS = 3000;
  private MIN_SNAPSHOT_INTERVAL_MS = 15000;
  private BATCH_FLUSH_MS = 2000;
  private MAX_BATCH_SIZE = 50;
  private EDITOR_SELECTION_THROTTLE_MS = 80;
  private CHAT_INPUT_SELECTION_THROTTLE_MS = 80;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sequenceStorageKey = getSwagSequenceStorageKey(sessionId);
    this.sequenceNumber = this.loadInitialSequenceNumber();
  }

  private loadInitialSequenceNumber(): number {
    if (typeof window === 'undefined') {
      return 0;
    }

    const parseStoredValue = (raw: string | null): number | null => {
      if (!raw) return null;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      return parsed;
    };

    const currentValue = parseStoredValue(window.sessionStorage.getItem(this.sequenceStorageKey));
    if (currentValue !== null) {
      return currentValue;
    }

    // One-time fallback for sessions that were tracked under the old prelude key.
    const legacyKey = getLegacyPreludeSequenceStorageKey(this.sessionId);
    const legacyValue = parseStoredValue(window.sessionStorage.getItem(legacyKey));
    if (legacyValue !== null) {
      window.sessionStorage.setItem(this.sequenceStorageKey, String(legacyValue));
      window.sessionStorage.removeItem(legacyKey);
      return legacyValue;
    }

    return 0;
  }

  private nextSequenceNumber(): number {
    const next = this.sequenceNumber;
    this.sequenceNumber += 1;

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(this.sequenceStorageKey, String(this.sequenceNumber));
    }

    return next;
  }

  setMinimumSequenceNumber(minSequenceNumber: number) {
    if (!Number.isFinite(minSequenceNumber)) return;
    const normalized = Math.max(0, Math.floor(minSequenceNumber));
    if (normalized <= this.sequenceNumber) return;

    this.sequenceNumber = normalized;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(this.sequenceStorageKey, String(this.sequenceNumber));
    }
  }

  // 사용자 활동 추적 (throttled)
  trackActivity() {
    const now = Date.now();

    // 1초 이내 중복 활동 무시
    if (now - this.lastActivityTime < this.activityThrottle) {
      return;
    }

    this.lastActivityTime = now;
    this.activityCount++;
    this.keystrokeCount++; // 키 입력 카운트 증가

    // 타이핑 멈춤 감지: 일정 시간 입력 없으면 snapshot
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      if (this.activityCount > 0 && this.snapshotCallback) {
        this.snapshotCallback();
      }
    }, this.INACTIVITY_SNAPSHOT_DELAY_MS); // 입력이 멈추면 snapshot 저장

    // 키 입력 횟수 기반 저장 (새로 추가)
    if (this.keystrokeCount >= this.KEYSTROKES_PER_SNAPSHOT && this.snapshotCallback) {
      this.snapshotCallback();
    }
  }

  trackSnapshot(documentState: Record<string, unknown>[]) {
    const snapshotSequenceNumber = this.nextSequenceNumber();
    this.queue.push({
      type: 'snapshot',
      timestamp: Date.now(),
      sequenceNumber: snapshotSequenceNumber,
      data: documentState,
    });

    this.activityCount = 0;
    this.keystrokeCount = 0; // 키 입력 카운터 리셋
    this.lastSnapshotTime = Date.now();
    this.lastSnapshotSequenceNumber = snapshotSequenceNumber;
    this.scheduleSave();
  }

  trackSubmission(documentState: Record<string, unknown>[]) {
    this.queue.push({
      type: 'submission',
      timestamp: Date.now(),
      sequenceNumber: this.nextSequenceNumber(),
      data: documentState,
    });
  }

  trackPaste(content: string, isInternal: boolean, context: PasteEventContext = {}) {
    this.queue.push({
      type: isInternal ? 'paste_internal' : 'paste_external',
      timestamp: Date.now(),
      sequenceNumber: this.nextSequenceNumber(),
      data: {
        content,
        sourceArea: context.sourceArea ?? (isInternal ? 'unknown' : 'external'),
        targetArea: context.targetArea ?? 'editor',
        matchMethod: context.matchMethod ?? 'none',
      },
    });

    this.scheduleSave();
  }

  trackTypingOp(context: TypingOpContext) {
    const data: Record<string, unknown> = {
      baseSnapshotSequenceNumber: this.lastSnapshotSequenceNumber,
      stepJson: context.stepJson,
    };

    if (context.stepType) data.stepType = context.stepType;
    if (typeof context.stepIndex === 'number') data.stepIndex = context.stepIndex;
    if (typeof context.stepCount === 'number') data.stepCount = context.stepCount;
    if (typeof context.transactionTimestamp === 'number') data.transactionTimestamp = context.transactionTimestamp;
    if (typeof context.wordCount === 'number') data.wordCount = context.wordCount;
    if (typeof context.docContentSize === 'number') data.docContentSize = context.docContentSize;
    if (typeof context.addedWords === 'number') data.addedWords = context.addedWords;
    if (typeof context.deletedUserWords === 'number') data.deletedUserWords = context.deletedUserWords;
    if (typeof context.deletedGptWords === 'number') data.deletedGptWords = context.deletedGptWords;
    if (context.source === 'user' || context.source === 'gpt') data.source = context.source;

    this.queue.push({
      type: 'typing_op',
      timestamp: Date.now(),
      sequenceNumber: this.nextSequenceNumber(),
      data,
    });

    this.scheduleSave();
  }

  trackEditorSelection(context: EditorSelectionContext) {
    const from = Number.isFinite(context.from) ? Math.max(0, Math.floor(context.from)) : 0;
    const to = Number.isFinite(context.to) ? Math.max(0, Math.floor(context.to)) : from;
    const key = `${from}:${to}`;
    const now = Date.now();

    if (key === this.lastEditorSelectionKey) {
      return;
    }

    if (now - this.lastEditorSelectionLoggedAt < this.EDITOR_SELECTION_THROTTLE_MS) {
      return;
    }

    this.lastEditorSelectionKey = key;
    this.lastEditorSelectionLoggedAt = now;

    this.queue.push({
      type: 'editor_selection',
      timestamp: now,
      sequenceNumber: this.nextSequenceNumber(),
      data: {
        from,
        to,
        isCollapsed: from === to,
      },
    });

    this.scheduleSave();
  }

  trackChatInput(context: ChatInputContext) {
    const text = typeof context.text === 'string' ? context.text : '';
    const selectionStart = Number.isFinite(context.selectionStart)
      ? Math.max(0, Math.floor(context.selectionStart))
      : text.length;
    const selectionEnd = Number.isFinite(context.selectionEnd)
      ? Math.max(0, Math.floor(context.selectionEnd))
      : selectionStart;
    const conversationId = typeof context.conversationId === 'string' ? context.conversationId : null;
    const webSearchEnabled = !!context.webSearchEnabled;
    const trigger = context.trigger ?? 'input';
    const key = `${conversationId ?? 'none'}:${webSearchEnabled ? 1 : 0}:${selectionStart}:${selectionEnd}:${text}`;
    const now = Date.now();

    if (key === this.lastChatInputKey) {
      return;
    }

    if (
      trigger === 'selection' &&
      now - this.lastChatInputLoggedAt < this.CHAT_INPUT_SELECTION_THROTTLE_MS
    ) {
      return;
    }

    this.lastChatInputKey = key;
    this.lastChatInputLoggedAt = now;

    this.queue.push({
      type: 'chat_input',
      timestamp: now,
      sequenceNumber: this.nextSequenceNumber(),
      data: {
        text,
        selectionStart,
        selectionEnd,
        conversationId,
        webSearchEnabled,
        trigger,
      },
    });

    this.scheduleSave();
  }

  trackChatWebSearchToggle(context: ChatWebSearchToggleContext) {
    const now = Date.now();
    this.queue.push({
      type: 'chat_web_search_toggle',
      timestamp: now,
      sequenceNumber: this.nextSequenceNumber(),
      data: {
        enabled: !!context.enabled,
        conversationId: typeof context.conversationId === 'string' ? context.conversationId : null,
      },
    });

    this.scheduleSave();
  }

  shouldTakeSnapshot(): boolean {
    // 키 입력 횟수 기반 또는 활동이 있고 최소 간격이 지났으면 snapshot
    const timeSinceSnapshot = Date.now() - this.lastSnapshotTime;
    return (
      this.activityCount > 0 &&
      (this.keystrokeCount >= this.KEYSTROKES_PER_SNAPSHOT || timeSinceSnapshot >= this.MIN_SNAPSHOT_INTERVAL_MS)
    );
  }

  // Snapshot 콜백 등록 (타이핑 멈춤 감지용)
  setSnapshotCallback(callback: () => void) {
    this.snapshotCallback = callback;
  }

  private scheduleSave() {
    // Snapshot은 즉시 저장 (다른 이벤트는 배치 처리)
    if (
      this.queue.length > 0 &&
      (this.queue[this.queue.length - 1].type === 'snapshot' ||
        this.queue[this.queue.length - 1].type === 'submission')
    ) {
      // 즉시 저장
      this.flush();
    } else if (this.queue.length >= this.MAX_BATCH_SIZE) {
      // 배치 크기에 도달하면 저장
      this.flush();
    } else if (!this.saveTimer) {
      // 그 외에는 짧은 지연 후 배치 저장
      this.saveTimer = setTimeout(() => {
        this.flush();
      }, this.BATCH_FLUSH_MS);
    }
  }

  async flush() {
    if (this.queue.length === 0) return;

    const eventsToSave = [...this.queue];
    this.queue = [];

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // Dispatch saving event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SWAG_CUSTOM_EVENTS.EVENTS_SAVING));
    }

    try {
      const response = await fetch('/api/events/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          events: eventsToSave,
        }),
      });

      if (!response.ok) {
        // Re-add events to queue if save failed
        this.queue.unshift(...eventsToSave);
        throw new Error('Failed to save events');
      }

      console.log(`✓ Saved ${eventsToSave.length} events`);

      // Dispatch saved event for UI update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SWAG_CUSTOM_EVENTS.EVENTS_SAVED));
      }
    } catch (error) {
      console.error('Failed to save events:', error);
      // Re-add events to queue
      this.queue.unshift(...eventsToSave);
    }
  }

  // Force save (for beforeunload)
  forceSave() {
    return this.flush();
  }
}

const trackerBySession = new Map<string, EventTracker>();

export function getSessionEventTracker(sessionId: string): EventTracker {
  let tracker = trackerBySession.get(sessionId);

  if (!tracker) {
    tracker = new EventTracker(sessionId);
    trackerBySession.set(sessionId, tracker);
  }

  return tracker;
}
