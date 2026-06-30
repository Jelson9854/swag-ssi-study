import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { assignments } from '@/db/schema';
import { resolveAssignmentAiGuidance } from '@/lib/assignment-ai';
import { randomUUID } from 'crypto';
import { getInstructor } from '@/lib/auth';

function generateShareToken(): string {
  // Generate a URL-friendly token
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

export async function POST(request: Request) {
  try {
    const instructor = await getInstructor();

    if (!instructor) {
      return NextResponse.json(
        { error: 'Instructor not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      title,
      instructions,
      criteria,
      deadline,
      customSystemPrompt,
      includeInstructionInPrompt,
      allowWebSearch,
      strictPasteBlocking,
    } = body;

    // Validate required fields
    if (!title || !instructions || !deadline) {
      return NextResponse.json(
        { error: 'Title, instructions, and deadline are required' },
        { status: 400 }
      );
    }

    // Parse deadline
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid deadline format' },
        { status: 400 }
      );
    }

    const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'http';
    const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    const baseUrl = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030');

    // Create assignment
    const assignmentId = randomUUID();
    const shareToken = generateShareToken();

    await db.insert(assignments).values({
      id: assignmentId,
      title,
      instructions,
      criteria: typeof criteria === 'string' && criteria.trim() ? criteria : null,
      deadline: deadlineDate,
      shareToken,
      instructorId: instructor.id,
      customSystemPrompt: resolveAssignmentAiGuidance(customSystemPrompt),
      includeInstructionInPrompt: includeInstructionInPrompt || false,
      allowWebSearch: allowWebSearch || false,
      strictPasteBlocking: strictPasteBlocking || false,
      createdAt: new Date(),
    });

    return NextResponse.json({
      id: assignmentId,
      shareToken,
      shareUrl: `${baseUrl}/s/${shareToken}`,
    });
  } catch (error) {
    console.error('Failed to create assignment:', error);
    return NextResponse.json(
      { error: 'Failed to create assignment' },
      { status: 500 }
    );
  }
}
