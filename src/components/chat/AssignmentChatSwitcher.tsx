'use client';

import { useEffect, useState } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronDown, Check, Eye } from 'lucide-react';
import ChatMessages from './ChatMessages';

interface ParticipantAssignment {
  sessionId: string;
  assignmentId: string;
  title: string;
  startedAt: string;
}

interface ReadOnlyMessage {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
}

interface AssignmentChatSwitcherProps {
  currentAssignmentId?: string;
  onViewingChange: (isViewingOther: boolean) => void;
}

// Lets a participant peek at another assignment's chat history (read-only).
// Selecting "Current assignment" hands control back to ChatPanel's normal
// live view.
export default function AssignmentChatSwitcher({ currentAssignmentId, onViewingChange }: AssignmentChatSwitcherProps) {
  const [assignments, setAssignments] = useState<ParticipantAssignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<'current' | string>('current');
  const [readOnlyMessages, setReadOnlyMessages] = useState<ReadOnlyMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  useEffect(() => {
    fetch('/api/participant/assignments')
      .then((res) => (res.ok ? res.json() : { assignments: [] }))
      .then((data) => setAssignments(data.assignments || []))
      .catch(() => setAssignments([]));
  }, []);

  useEffect(() => {
    onViewingChange(selectedAssignmentId !== 'current');
  }, [selectedAssignmentId, onViewingChange]);

  const otherAssignments = assignments.filter((a) => a.assignmentId !== currentAssignmentId);

  if (otherAssignments.length === 0) {
    return null;
  }

  async function handleSelect(value: 'current' | string) {
    setSelectedAssignmentId(value);

    if (value === 'current') {
      setReadOnlyMessages([]);
      return;
    }

    const target = assignments.find((a) => a.assignmentId === value);
    if (!target) return;

    setIsLoadingMessages(true);
    try {
      const listRes = await fetch('/api/conversations/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: target.sessionId }),
      });
      const { conversations } = listRes.ok ? await listRes.json() : { conversations: [] };

      const allMessages: ReadOnlyMessage[] = [];
      for (const conv of conversations || []) {
        const msgRes = await fetch('/api/conversations/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: conv.id }),
        });
        if (msgRes.ok) {
          const { messages } = await msgRes.json();
          allMessages.push(...messages);
        }
      }
      setReadOnlyMessages(allMessages);
    } catch {
      setReadOnlyMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  const isViewingOther = selectedAssignmentId !== 'current';
  const selectedTitle = isViewingOther
    ? assignments.find((a) => a.assignmentId === selectedAssignmentId)?.title
    : null;

  return (
    <div className={`border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 ${isViewingOther ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      <div className="px-4 py-2 shrink-0">
        <Listbox value={selectedAssignmentId} onChange={handleSelect}>
          <div className="relative">
            <ListboxButton className="w-full px-3 py-1.5 text-sm border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-left flex items-center justify-between gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
              <span className="truncate">
                {isViewingOther ? `Viewing: ${selectedTitle}` : 'Current assignment'}
              </span>
              <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
            </ListboxButton>
            <ListboxOptions className="absolute left-0 mt-2 max-h-60 w-full overflow-auto rounded-md bg-[hsl(var(--popover))] py-1 text-sm shadow-md ring-1 ring-[hsl(var(--border))] z-10 focus:outline-none">
              <ListboxOption
                value="current"
                className="cursor-pointer select-none px-3 py-2 hover:bg-[hsl(var(--accent))] text-[hsl(var(--popover-foreground))]"
              >
                {({ selected }) => (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Current assignment</span>
                    {selected && <Check className="w-4 h-4 text-[hsl(var(--primary))]" />}
                  </div>
                )}
              </ListboxOption>
              {otherAssignments.map((a) => (
                <ListboxOption
                  key={a.assignmentId}
                  value={a.assignmentId}
                  className="cursor-pointer select-none px-3 py-2 hover:bg-[hsl(var(--accent))] text-[hsl(var(--popover-foreground))]"
                >
                  {({ selected }) => (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{a.title}</span>
                      {selected && <Check className="w-4 h-4 text-[hsl(var(--primary))] shrink-0" />}
                    </div>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>
      </div>

      {isViewingOther && (
        <>
          <div className="flex items-center gap-1.5 px-4 pb-2 text-xs text-[hsl(var(--muted-foreground))] shrink-0">
            <Eye className="w-3.5 h-3.5" />
            Read-only — switch back to Current assignment to chat.
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-[hsl(var(--border))]">
            {isLoadingMessages ? (
              <div className="p-4 text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>
            ) : (
              <ChatMessages messages={readOnlyMessages} enableCopy={false} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
