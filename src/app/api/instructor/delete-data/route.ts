import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { assignments, studentSessions, chatConversations, chatMessages, editorEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getInstructor } from '@/lib/auth';

export async function DELETE() {
  try {
    const instructor = await getInstructor();

    if (!instructor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const instructorAssignments = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.instructorId, instructor.id));

    for (const { id: assignmentId } of instructorAssignments) {
      const sessions = await db
        .select({ id: studentSessions.id })
        .from(studentSessions)
        .where(eq(studentSessions.assignmentId, assignmentId));

      for (const { id: sessionId } of sessions) {
        const conversations = await db
          .select({ id: chatConversations.id })
          .from(chatConversations)
          .where(eq(chatConversations.sessionId, sessionId));

        for (const conv of conversations) {
          await db.delete(chatMessages).where(eq(chatMessages.conversationId, conv.id));
        }

        await db.delete(chatConversations).where(eq(chatConversations.sessionId, sessionId));
        await db.delete(editorEvents).where(eq(editorEvents.sessionId, sessionId));
      }

      await db.delete(studentSessions).where(eq(studentSessions.assignmentId, assignmentId));
    }

    await db.delete(assignments).where(eq(assignments.instructorId, instructor.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete instructor data:', error);
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 });
  }
}
