'use client';

import { useState } from 'react';

interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onUpdateTitle,
  onDeleteConversation,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const saveTitle = (id: string) => {
    if (editTitle.trim()) {
      onUpdateTitle(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="border-b border-[hsl(var(--border))]">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-[hsl(var(--accent))] text-sm transition-colors"
      >
        <span className="text-[hsl(var(--muted-foreground))]">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[hsl(var(--muted-foreground))]">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {/* Conversation list (collapsible) */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1 max-h-48 overflow-y-auto">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                className={`p-2 rounded cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30'
                    : 'bg-[hsl(var(--card))] hover:bg-[hsl(var(--accent))] border border-[hsl(var(--border))]'
                }`}
                onClick={() => !isEditing && onSelectConversation(conv.id)}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTitle(conv.id);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      className="text-sm border border-[hsl(var(--input))] rounded px-2 py-1 w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveTitle(conv.id)}
                        className="text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-2 py-1 rounded hover:bg-[hsl(var(--primary))]/90"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-2 py-1 rounded hover:bg-[hsl(var(--muted))]/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                        {conv.title}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(conv);
                        }}
                        className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                        title="Edit title"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                        className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                        title="Delete conversation"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
