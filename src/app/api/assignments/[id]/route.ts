import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { assignments, studentSessions, editorEvents, chatConversations, chatMessages } from '@/db/schema';
import { resolveAssignmentAiGuidance } from '@/lib/assignment-ai';
import { eq, and } from 'drizzle-orm';
import { getInstructor, isAdministrator } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get assignment details
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const instructor = await getInstructor();

    if (!instructor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assignmentWhere = isAdministrator(instructor)
      ? eq(assignments.id, id)
      : and(
          eq(assignments.id, id),
          eq(assignments.instructorId, instructor.id)
        );

    const assignment = await db.query.assignments.findFirst({
      where: assignmentWhere,
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error('Failed to get assignment:', error);
    return NextResponse.json({ error: 'Failed to get assignment' }, { status: 500 });
  }
}

// PUT - Update assignment
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const instructor = await getInstructor();

    if (!instructor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify assignment belongs to instructor
    const existingAssignment = await db.query.assignments.findFirst({
      where: and(
        eq(assignments.id, id),
        eq(assignments.instructorId, instructor.id)
      ),
    });

    if (!existingAssignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      instructions,
      criteria,
      customSystemPrompt,
      includeInstructionInPrompt,
      allowWebSearch,
      strictPasteBlocking,
      chatReadOnly,
    } = body;

    // Validate required fields
    if (!title || !instructions) {
      return NextResponse.json(
        { error: 'Title and instructions are required' },
        { status: 400 }
      );
    }

    // Update assignment
    await db
      .update(assignments)
      .set({
        title,
        instructions,
        criteria: typeof criteria === 'string' && criteria.trim() ? criteria : null,
        customSystemPrompt: resolveAssignmentAiGuidance(customSystemPrompt),
        includeInstructionInPrompt: includeInstructionInPrompt || false,
        allowWebSearch: allowWebSearch || false,
        strictPasteBlocking: strictPasteBlocking || false,
        chatReadOnly: chatReadOnly || false,
      })
      .where(eq(assignments.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update assignment:', error);
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
  }
}

// DELETE - Delete assignment and all related data
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const instructor = await getInstructor();

    if (!instructor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify assignment belongs to instructor
    const existingAssignment = await db.query.assignments.findFirst({
      where: and(
        eq(assignments.id, id),
        eq(assignments.instructorId, instructor.id)
      ),
    });

    if (!existingAssignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Get all student sessions for this assignment
    const sessions = await db
      .select({ id: studentSessions.id })
      .from(studentSessions)
      .where(eq(studentSessions.assignmentId, id));

    const sessionIds = sessions.map(s => s.id);

    // Delete in order due to foreign key constraints
    for (const sessionId of sessionIds) {
      // Get conversations for this session
      const conversations = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(eq(chatConversations.sessionId, sessionId));

      // Delete chat messages for each conversation
      for (const conv of conversations) {
        await db.delete(chatMessages).where(eq(chatMessages.conversationId, conv.id));
      }

      // Delete conversations
      await db.delete(chatConversations).where(eq(chatConversations.sessionId, sessionId));

      // Delete editor events
      await db.delete(editorEvents).where(eq(editorEvents.sessionId, sessionId));
    }

    // Delete student sessions
    await db.delete(studentSessions).where(eq(studentSessions.assignmentId, id));

    // Delete assignment
    await db.delete(assignments).where(eq(assignments.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete assignment:', error);
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 });
  }
}
