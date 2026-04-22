import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { assignments, studentSessions } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getInstructor } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const instructor = await getInstructor();

  if (!instructor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const assignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, id), eq(assignments.instructorId, instructor.id)),
  });

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  const sessions = await db
    .select({
      participantToken: studentSessions.participantToken,
      studentFirstName: studentSessions.studentFirstName,
      studentLastName: studentSessions.studentLastName,
      studentEmail: studentSessions.studentEmail,
      startedAt: studentSessions.startedAt,
      lastSavedAt: studentSessions.lastSavedAt,
    })
    .from(studentSessions)
    .where(eq(studentSessions.assignmentId, id))
    .orderBy(asc(studentSessions.participantToken));

  const header = 'participant_token,first_name,last_name,email,started_at,last_saved_at\r\n';
  const rows = sessions.map((s) => {
    const cols = [
      s.participantToken,
      s.studentFirstName,
      s.studentLastName,
      s.studentEmail,
      s.startedAt.toISOString(),
      s.lastSavedAt ? s.lastSavedAt.toISOString() : '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    return cols.join(',');
  });

  const csv = header + rows.join('\r\n');
  const safeTitle = assignment.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${safeTitle}_participants_${date}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
