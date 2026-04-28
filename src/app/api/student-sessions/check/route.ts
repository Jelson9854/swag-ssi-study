import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db/db';
import { assignments, instructors, studentSessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shareToken = searchParams.get('shareToken');

    if (!shareToken) {
      return NextResponse.json({ hasSession: false });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_session')?.value;

    if (!userId) {
      return NextResponse.json({ hasSession: false });
    }

    const user = await db.query.instructors.findFirst({
      where: eq(instructors.id, userId),
    });

    if (!user || user.role !== 'student') {
      return NextResponse.json({ hasSession: false });
    }

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.shareToken, shareToken),
    });

    if (!assignment) {
      return NextResponse.json({ hasSession: false });
    }

    const existingSession = await db.query.studentSessions.findFirst({
      where: and(
        eq(studentSessions.assignmentId, assignment.id),
        eq(studentSessions.userId, user.id)
      ),
    });

    return NextResponse.json({ hasSession: !!existingSession });
  } catch {
    return NextResponse.json({ hasSession: false });
  }
}
