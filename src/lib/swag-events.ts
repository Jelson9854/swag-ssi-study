export const SWAG_SEQUENCE_STORAGE_PREFIX = 'swag:event-sequence';
export const LEGACY_PRELUDE_SEQUENCE_STORAGE_PREFIX = 'prelude:event-sequence';

export const SWAG_CUSTOM_EVENTS = {
  EVENTS_SAVING: 'swag:events-saving',
  EVENTS_SAVED: 'swag:events-saved',
  SUBMIT_REQUEST: 'swag:submit-request',
  SUBMISSION_SAVED: 'swag:submission-saved',
  EDITOR_CHANGED: 'swag:editor-changed',
} as const;

export const getSwagSequenceStorageKey = (sessionId: string): string =>
  `${SWAG_SEQUENCE_STORAGE_PREFIX}:${sessionId}`;

export const getLegacyPreludeSequenceStorageKey = (sessionId: string): string =>
  `${LEGACY_PRELUDE_SEQUENCE_STORAGE_PREFIX}:${sessionId}`;
