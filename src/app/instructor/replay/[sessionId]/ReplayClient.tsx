'use client';

import dynamic from 'next/dynamic';

const ReplayPlayer = dynamic(() => import('./ReplayPlayer'), {
  ssr: false,
});

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

interface ReplayClientProps {
  events: EditorEvent[];
  chatMessages: ChatMessage[];
  conversations: Conversation[];
  startTime: number;
  endTime: number;
  allowWebSearch: boolean;
}

export default function ReplayClient({
  events,
  chatMessages,
  conversations,
  startTime,
  endTime,
  allowWebSearch,
}: ReplayClientProps) {
  return (
    <ReplayPlayer
      events={events}
      chatMessages={chatMessages}
      conversations={conversations}
      startTime={startTime}
      endTime={endTime}
      allowWebSearch={allowWebSearch}
    />
  );
}
