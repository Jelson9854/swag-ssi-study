'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Clock,
  Type,
  MessageSquare,
  FileEdit,
  ChevronLeft,
  PlayCircle
} from 'lucide-react';

const ViewClient = dynamic(() => import('./ViewClient'), {
  ssr: false,
});

interface ViewWrapperProps {
  session: {
    id: string;
    studentFirstName: string;
    studentLastName: string;
    studentEmail: string;
    startedAt: Date;
    lastSavedAt: Date | null;
  };
  assignment: {
    id: string;
    title: string;
  };
  stats: {
    totalEditorEvents: number;
    externalPasteAttempts: number;
    internalPastes: number;
    totalConversations: number;
    totalChatMessages: number;
    userMessages: number;
    assistantMessages: number;
    timeSpent: number;
    wordCount: number;
  };
  pasteRoutes: Array<{
    sourceArea: 'chat' | 'editor' | 'instruction' | 'external' | 'unknown';
    targetArea: 'editor' | 'chat';
    count: number;
  }>;
  latestSnapshot: { eventData: Record<string, unknown>[] } | null;
  submissions: Array<{
    id: number;
    eventData: Record<string, unknown>[];
    timestamp: Date;
    sequenceNumber: number;
  }>;
  events: Array<{
    id: number;
    eventType: string;
    eventData: unknown;
    timestamp: Date;
    sequenceNumber: number;
  }>;
  latestSubmission: {
    eventData: Record<string, unknown>[];
    timestamp: Date;
  } | null;
}

interface SubmissionWordBreakdown {
  submissionId: number | null;
  totalWords: number;
  userWords: number;
  gptWords: number;
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
      Object.entries(node as Record<string, unknown>).forEach(([key, child]) => {
        walk(child, key);
      });
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

export default function ViewWrapper({
  session,
  assignment,
  stats,
  pasteRoutes,
  latestSnapshot,
  submissions,
  events,
  latestSubmission,
}: ViewWrapperProps) {
  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [submissions]
  );
  const latestSubmissionId = sortedSubmissions.length > 0
    ? sortedSubmissions[sortedSubmissions.length - 1].id
    : null;
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(latestSubmissionId);
  const [selectedSubmissionWordBreakdown, setSelectedSubmissionWordBreakdown] =
    useState<SubmissionWordBreakdown | null>(null);

  useEffect(() => {
    setSelectedSubmissionId((current) => {
      if (current !== null && sortedSubmissions.some((submission) => submission.id === current)) {
        return current;
      }
      return latestSubmissionId;
    });
  }, [latestSubmissionId, sortedSubmissions]);

  const selectedSubmission = useMemo(
    () => (
      selectedSubmissionId !== null
        ? sortedSubmissions.find((submission) => submission.id === selectedSubmissionId) ?? null
        : null
    ),
    [selectedSubmissionId, sortedSubmissions]
  );

  const selectedSubmissionLabel = useMemo(() => {
    if (!selectedSubmission) {
      return sortedSubmissions.length > 0 ? 'selected submission' : 'final document';
    }
    const index = sortedSubmissions.findIndex((submission) => submission.id === selectedSubmission.id);
    return index >= 0 ? `Submission ${index + 1}` : 'selected submission';
  }, [selectedSubmission, sortedSubmissions]);

  const fallbackTotalWords = useMemo(() => {
    if (selectedSubmission) {
      return countWordsFromDocument(selectedSubmission.eventData);
    }

    const fallbackDocument = latestSubmission?.eventData || latestSnapshot?.eventData || [];
    return countWordsFromDocument(fallbackDocument);
  }, [selectedSubmission, latestSubmission, latestSnapshot]);

  const displayedWordBreakdown = useMemo<SubmissionWordBreakdown>(() => {
    if (
      selectedSubmissionWordBreakdown &&
      selectedSubmissionWordBreakdown.submissionId === selectedSubmissionId
    ) {
      return selectedSubmissionWordBreakdown;
    }

    return {
      submissionId: selectedSubmissionId,
      totalWords: fallbackTotalWords,
      userWords: fallbackTotalWords,
      gptWords: 0,
    };
  }, [fallbackTotalWords, selectedSubmissionId, selectedSubmissionWordBreakdown]);

  const handleSubmissionWordBreakdownChange = useCallback((next: SubmissionWordBreakdown | null) => {
    setSelectedSubmissionWordBreakdown(next);
  }, []);

  const sourceAreaLabel = (sourceArea: ViewWrapperProps['pasteRoutes'][number]['sourceArea']) => {
    if (sourceArea === 'instruction') return 'Instruction';
    if (sourceArea === 'external') return 'External';
    if (sourceArea === 'chat') return 'Chat';
    if (sourceArea === 'editor') return 'Editor';
    return 'Unknown';
  };

  const targetAreaLabel = (targetArea: ViewWrapperProps['pasteRoutes'][number]['targetArea']) => {
    return targetArea === 'chat' ? 'Chat' : 'Editor';
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))]/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/instructor/assignments/${assignment.id}`}>
                <Button variant="ghost" size="icon">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-heading font-semibold text-[hsl(var(--foreground))]">
                  {session.studentLastName}, {session.studentFirstName}
                </h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {assignment.title} • {session.studentEmail} • Last Saved: {session.lastSavedAt ? new Date(session.lastSavedAt).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>
            <Link href={`/instructor/replay/${session.id}`}>
              <Button>
                <PlayCircle className="w-4 h-4 mr-2" />
                Replay Session
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Time */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Time</CardTitle>
              <Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.floor(stats.timeSpent / (1000 * 60))}m {Math.floor((stats.timeSpent % (1000 * 60)) / 1000)}s
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Typing activity only
              </p>
            </CardContent>
          </Card>

          {/* Word Count */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Word Count</CardTitle>
              <Type className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {displayedWordBreakdown.userWords}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">User written</p>
                </div>
                <div className="h-8 w-px bg-[hsl(var(--border))]" />
                <div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {displayedWordBreakdown.gptWords}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">GPT generated</p>
                </div>
              </div>
              <div className="mt-3 border-t border-[hsl(var(--border))] pt-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[hsl(var(--muted-foreground))]">Total words</span>
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {displayedWordBreakdown.totalWords}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Based on {selectedSubmissionLabel}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Assistance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Assistance</CardTitle>
              <MessageSquare className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.userMessages} turns</div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {stats.totalChatMessages} messages in {stats.totalConversations} {stats.totalConversations === 1 ? 'conversation' : 'conversations'}
              </p>
            </CardContent>
          </Card>

          {/* Paste Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paste Activity</CardTitle>
              <FileEdit className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.internalPastes}</div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Internal</p>
                </div>
                <div className="h-8 w-px bg-[hsl(var(--border))]" />
                <div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.externalPasteAttempts}</div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">External</p>
                </div>
              </div>
              {pasteRoutes.length > 0 && (
                <div className="mt-3 border-t border-[hsl(var(--border))] pt-3 space-y-1.5">
                  {pasteRoutes.slice(0, 3).map((route) => (
                    <div
                      key={`${route.sourceArea}-${route.targetArea}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {sourceAreaLabel(route.sourceArea)} → {targetAreaLabel(route.targetArea)}
                      </span>
                      <span className="font-medium text-[hsl(var(--foreground))]">{route.count}</span>
                    </div>
                  ))}
                  {pasteRoutes.length > 3 && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      +{pasteRoutes.length - 3} more routes
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Final Document Preview */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-[hsl(var(--muted))]/30">
            <CardTitle>Final Document Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ViewClient
              finalDocument={
                latestSubmission?.eventData ||
                latestSnapshot?.eventData ||
                [{ type: 'paragraph', content: [] }]
              }
              submissions={submissions}
              events={events}
              selectedSubmissionId={selectedSubmissionId}
              onSelectSubmissionId={setSelectedSubmissionId}
              onSubmissionWordBreakdownChange={handleSubmissionWordBreakdownChange}
            />
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
