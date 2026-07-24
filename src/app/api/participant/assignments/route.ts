import { db } from '@/db/db';
import { studentSessions, assignments } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { cookies } from 'next/headers';

// Lists every assignment this participant (by PID) has a session for, so the
// chat panel can offer a "view another assignment's chat" dropdown.
export async function GET() {
  const cookieStore = await cookies();
  const pid = cookieStore.get('participant_pid')?.value;

  if (!pid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rows = await db
    .select({
      sessionId: studentSessions.id,
      assignmentId: assignments.id,
      title: assignments.title,
      startedAt: studentSessions.startedAt,
    })
    .from(studentSessions)
    .innerJoin(assignments, eq(studentSessions.assignmentId, assignments.id))
    .where(eq(studentSessions.participantToken, pid))
    .orderBy(desc(studentSessions.startedAt));

  return Response.json({ assignments: rows });
}
