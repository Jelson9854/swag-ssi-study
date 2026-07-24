import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db/db';
import { assignments, studentSessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

const startSchema = z.object({
  assignmentId: z.string().uuid().optional(),
  shareToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const pid = cookieStore.get('participant_pid')?.value;

    if (!pid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assignmentId, shareToken } = startSchema.parse(body);

    if (!assignmentId && !shareToken) {
      return NextResponse.json({ error: 'Assignment ID or share token is required' }, { status: 400 });
    }

    const assignment = await db.query.assignments.findFirst({
      where: assignmentId ? eq(assignments.id, assignmentId) : eq(assignments.shareToken, shareToken || ''),
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const existingSession = await db.query.studentSessions.findFirst({
      where: and(
        eq(studentSessions.assignmentId, assignment.id),
        eq(studentSessions.participantToken, pid)
      ),
    });

    let sessionId = existingSession?.id;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      await db.insert(studentSessions).values({
        id: sessionId,
        assignmentId: assignment.id,
        participantToken: pid,
        isVerified: true,
        startedAt: new Date(),
        lastSavedAt: null,
        lastLoginAt: new Date(),
      });
    } else {
      await db
        .update(studentSessions)
        .set({ lastLoginAt: new Date() })
        .where(eq(studentSessions.id, sessionId));
    }

    return NextResponse.json({
      success: true,
      sessionId,
      shareToken: assignment.shareToken,
    });
  } catch (error) {
    console.error('Failed to start student session:', error);
    return NextResponse.json(
      { error: 'Failed to start session' },
      { status: 500 }
    );
  }
}
