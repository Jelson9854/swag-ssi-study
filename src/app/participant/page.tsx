import { db } from '@/db/db';
import { assignments, studentSessions, editorEvents } from '@/db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Card } from '@/components/ui/card';
import EmptyStateCard from '@/components/ui/EmptyStateCard';
import { Button } from '@/components/ui/button';

export default async function ParticipantAssignmentsPage() {
  const cookieStore = await cookies();
  const pid = cookieStore.get('participant_pid')?.value;

  if (!pid) {
    redirect('/');
  }

  const allAssignments = await db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      deadline: assignments.deadline,
      shareToken: assignments.shareToken,
    })
    .from(assignments)
    .orderBy(desc(assignments.createdAt));

  // This participant's sessions, keyed by assignmentId, for Last Active / Last Submission.
  const sessions = await db
    .select({
      sessionId: studentSessions.id,
      assignmentId: studentSessions.assignmentId,
      startedAt: studentSessions.startedAt,
      lastLoginAt: studentSessions.lastLoginAt,
    })
    .from(studentSessions)
    .where(eq(studentSessions.participantToken, pid));

  const sessionIds = sessions.map(s => s.sessionId);
  const submissionTimes = sessionIds.length > 0
    ? await db
        .select({
          sessionId: editorEvents.sessionId,
          lastSubmissionAt: sql<Date>`max(${editorEvents.timestamp})`,
        })
        .from(editorEvents)
        .where(and(
          inArray(editorEvents.sessionId, sessionIds),
          eq(editorEvents.eventType, 'submission')
        ))
        .groupBy(editorEvents.sessionId)
    : [];

  const submissionMap = new Map(submissionTimes.map(st => [st.sessionId, st.lastSubmissionAt]));
  const sessionByAssignment = new Map(sessions.map(s => [s.assignmentId, s]));

  const rows = allAssignments.map(assignment => {
    const session = sessionByAssignment.get(assignment.assignmentId);
    return {
      ...assignment,
      sessionId: session?.sessionId ?? null,
      lastActiveAt: session ? (session.lastLoginAt ?? session.startedAt) : null,
      lastSubmissionAt: session ? (submissionMap.get(session.sessionId) ?? null) : null,
    };
  });

  const formatDateTime = (value: Date | null) => {
    if (!value) {
      return '—';
    }
    return new Date(value).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">SWAG</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Participant Dashboard</p>
            </div>
            <span className="text-sm text-[hsl(var(--muted-foreground))]">{pid}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Assignments</h2>

          {rows.length === 0 ? (
            <EmptyStateCard
              minHeightClass="min-h-[160px]"
              titleClassName="text-base font-normal text-[hsl(var(--muted-foreground))]"
              title="No assignments yet"
              description="Check back once your researcher has created one."
              descriptionClassName="text-sm"
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[hsl(var(--muted)/0.5)] border-b border-[hsl(var(--border))]">
                    <tr>
                      <th className="px-6 py-3 font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider text-xs">
                        Title
                      </th>
                      <th className="px-6 py-3 font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider text-xs">
                        Deadline
                      </th>
                      <th className="px-6 py-3 font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider text-xs">
                        Last Active
                      </th>
                      <th className="px-6 py-3 font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider text-xs">
                        Last Submission
                      </th>
                      <th className="px-6 py-3 font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider text-xs text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {rows.map((row) => {
                      const isOverdue = new Date(row.deadline) < new Date();
                      return (
                        <tr key={row.assignmentId} className="group hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                          <td className="px-6 py-4 font-medium text-[hsl(var(--foreground))]">
                            {row.title}
                          </td>
                          <td className="px-6 py-4">
                            <span className={isOverdue ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}>
                              {new Date(row.deadline).toLocaleDateString()}
                              {isOverdue && ' (Overdue)'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-[hsl(var(--muted-foreground))]">
                            {formatDateTime(row.lastActiveAt)}
                          </td>
                          <td className="px-6 py-4 text-[hsl(var(--muted-foreground))]">
                            {formatDateTime(row.lastSubmissionAt)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link href={`/s/${row.shareToken}`}>
                              <Button size="sm">{row.sessionId ? 'Continue' : 'Start'}</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
