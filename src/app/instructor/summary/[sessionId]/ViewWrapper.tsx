'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Clock,
  Type,
  MessageSquare,
  FileEdit,
  ChevronLeft,
  PlayCircle,
  Info,
} from 'lucide-react';

const ViewClient = dynamic(() => import('./ViewClient'), {
  ssr: false,
});

interface ViewWrapperProps {
  session: {
    id: string;
    participantToken: string;
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
  recentUserInput: {
    content: string;
    timestamp: Date;
  } | null;
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

interface SubmissionContributionMetrics {
  submissionId: number | null;
  ha: number;
  hd: number;
  gp: number;
  gd: number;
  hcr: number | null;
  her: number | null;
  isExact: boolean;
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

const formatDurationWithHours = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
};

const formatContributionPercentage = (value: number | null): string => {
  if (value === null) {
    return 'N/A';
  }

  return `${(value * 100).toFixed(1)}%`;
};

const formatContributionCount = (value: number, isExact: boolean): string => {
  if (!isExact) {
    return 'N/A';
  }

  return value.toLocaleString();
};

const buildContributionMetricTooltipHtml = (
  metric: 'hcr' | 'her',
  contributionMetrics: SubmissionContributionMetrics
): string => {
  const title = metric === 'hcr' ? 'Human Contribution Ratio (HCR)' : 'Human Edit Ratio (HER)';
  const description = metric === 'hcr'
    ? 'How much of the final essay remains human-written after subtracting later deletions.'
    : 'How much of the total writing and editing activity was done by the student.';
  const formula = metric === 'hcr'
    ? '(HA - HD) / ((HA - HD) + (GP - GD))'
    : '(HA + HD + GD) / (HA + HD + GP + GD)';
  const availabilityNote = contributionMetrics.isExact
    ? ''
    : '<div style="margin-top:8px;color:hsl(var(--muted-foreground));">Exact edit logs are unavailable for this submission, so current values cannot be computed.</div>';

  return `
    <div style="max-width:280px;">
      <div style="font-weight:600;">${title}</div>
      <div style="margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground));">
        ${description}
      </div>
      <div style="margin-top:8px;font-size:11px;color:hsl(var(--muted-foreground));">
        Formula:
        <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:hsl(var(--foreground));">
          ${formula}
        </span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid hsl(var(--border));font-size:11px;line-height:1.5;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <span><strong>HA</strong>: Human-added words</span>
          <span style="min-width:48px;text-align:right;font-variant-numeric:tabular-nums;color:hsl(var(--foreground));">${formatContributionCount(contributionMetrics.ha, contributionMetrics.isExact)}</span>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <span><strong>HD</strong>: Human-written words later deleted</span>
          <span style="min-width:48px;text-align:right;font-variant-numeric:tabular-nums;color:hsl(var(--foreground));">${formatContributionCount(contributionMetrics.hd, contributionMetrics.isExact)}</span>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <span><strong>GP</strong>: Words pasted from ChatGPT</span>
          <span style="min-width:48px;text-align:right;font-variant-numeric:tabular-nums;color:hsl(var(--foreground));">${formatContributionCount(contributionMetrics.gp, contributionMetrics.isExact)}</span>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <span><strong>GD</strong>: ChatGPT-origin words later deleted</span>
          <span style="min-width:48px;text-align:right;font-variant-numeric:tabular-nums;color:hsl(var(--foreground));">${formatContributionCount(contributionMetrics.gd, contributionMetrics.isExact)}</span>
        </div>
      </div>
      ${availabilityNote}
    </div>
  `.trim();
};

export default function ViewWrapper({
  session,
  assignment,
  stats,
  pasteRoutes,
  recentUserInput,
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
  const [selectedSubmissionContributionMetrics, setSelectedSubmissionContributionMetrics] =
    useState<SubmissionContributionMetrics | null>(null);

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

  const handleSubmissionContributionMetricsChange = useCallback((next: SubmissionContributionMetrics | null) => {
    setSelectedSubmissionContributionMetrics(next);
  }, []);

  const displayedContributionMetrics = useMemo(() => {
    if (
      selectedSubmissionContributionMetrics &&
      selectedSubmissionContributionMetrics.submissionId === selectedSubmissionId
    ) {
      return selectedSubmissionContributionMetrics;
    }

    return {
      submissionId: selectedSubmissionId,
      ha: 0,
      hd: 0,
      gp: 0,
      gd: 0,
      hcr: null,
      her: null,
      isExact: false,
    };
  }, [selectedSubmissionContributionMetrics, selectedSubmissionId]);

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

  const selectedSubmissionElapsedMs = useMemo(() => {
    const startedAtMs = new Date(session.startedAt).getTime();
    const endAtMs = selectedSubmission
      ? new Date(selectedSubmission.timestamp).getTime()
      : latestSubmission
        ? new Date(latestSubmission.timestamp).getTime()
        : null;

    if (!Number.isFinite(startedAtMs) || endAtMs === null || !Number.isFinite(endAtMs)) {
      return null;
    }

    return Math.max(0, endAtMs - startedAtMs);
  }, [latestSubmission, selectedSubmission, session.startedAt]);

  const recentUserInputPreview = useMemo(() => {
    if (!recentUserInput) return null;
    const normalized = recentUserInput.content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return {
        text: '(empty message)',
        timestamp: new Date(recentUserInput.timestamp).toLocaleString(),
      };
    }
    return {
      text: truncateText(normalized, 80),
      timestamp: new Date(recentUserInput.timestamp).toLocaleString(),
    };
  }, [recentUserInput]);

  const contributionTooltipHtml = useMemo(() => ({
    hcr: buildContributionMetricTooltipHtml('hcr', displayedContributionMetrics),
    her: buildContributionMetricTooltipHtml('her', displayedContributionMetrics),
  }), [displayedContributionMetrics]);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Tooltip
        id="summary-contribution-metric-tooltip"
        place="top"
        className="z-50 max-w-[320px] !bg-[hsl(var(--popover))] !text-[hsl(var(--popover-foreground))] !border !border-[hsl(var(--border))] !rounded-md shadow-md text-xs px-3 py-2"
      />
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
                <h1 className="text-xl font-heading font-semibold text-[hsl(var(--foreground))] font-mono">
                  {session.participantToken}
                </h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {assignment.title} • Last Saved: {session.lastSavedAt ? new Date(session.lastSavedAt).toLocaleString() : 'Never'}
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
              {selectedSubmissionElapsedMs !== null && (
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))] pt-2">
                  Total elapsed (incl. idle): {formatDurationWithHours(selectedSubmissionElapsedMs)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Word Count */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Word Count</CardTitle>
              <Type className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 divide-x divide-[hsl(var(--border))]">
                <div className="pr-3">
                  <div className="text-xl font-bold text-[hsl(var(--foreground))] lg:text-2xl">
                    {displayedWordBreakdown.totalWords}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Total words</p>
                </div>
                <div className="px-3">
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 lg:text-2xl">
                    {displayedWordBreakdown.userWords}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">User written</p>
                </div>
                <div className="pl-3">
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400 lg:text-2xl">
                    {displayedWordBreakdown.gptWords}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">GPT generated</p>
                </div>
              </div>
              <div className="mt-3 border-t border-[hsl(var(--border))] pt-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                    <span>Human Contribution Ratio</span>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]"
                      aria-label="Explain Human Contribution Ratio"
                      data-tooltip-id="summary-contribution-metric-tooltip"
                      data-tooltip-html={contributionTooltipHtml.hcr}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {formatContributionPercentage(displayedContributionMetrics.hcr)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                    <span>Human Edit Ratio</span>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]"
                      aria-label="Explain Human Edit Ratio"
                      data-tooltip-id="summary-contribution-metric-tooltip"
                      data-tooltip-html={contributionTooltipHtml.her}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {formatContributionPercentage(displayedContributionMetrics.her)}
                  </span>
                </div>
                {!displayedContributionMetrics.isExact && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Exact edit logs unavailable
                  </p>
                )}
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
              {recentUserInputPreview && (
                <div className="mt-2 border-t border-[hsl(var(--border))] pt-2">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Recent user input ({recentUserInputPreview.timestamp})
                  </p>
                  <p className="text-xs text-[hsl(var(--foreground))] mt-1 break-words">
                    {recentUserInputPreview.text}
                  </p>
                </div>
              )}
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
              onSubmissionContributionMetricsChange={handleSubmissionContributionMetricsChange}
            />
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
