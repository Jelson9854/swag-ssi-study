import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { editorEvents } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { z } from 'zod';

const loadEventsSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = loadEventsSchema.parse(body);

    const maxSequenceResult = await db
      .select({
        maxSequenceNumber: sql<number>`coalesce(max(${editorEvents.sequenceNumber}), -1)`,
      })
      .from(editorEvents)
      .where(eq(editorEvents.sessionId, validated.sessionId));
    const maxSequenceNumber = Number(maxSequenceResult[0]?.maxSequenceNumber ?? -1);

    // Get the latest snapshot event for this session
    const latestSnapshot = await db.query.editorEvents.findFirst({
      where: and(
        eq(editorEvents.sessionId, validated.sessionId),
        eq(editorEvents.eventType, 'snapshot')
      ),
      orderBy: [desc(editorEvents.timestamp), desc(editorEvents.sequenceNumber)],
    });

    if (!latestSnapshot) {
      return NextResponse.json(
        {
          snapshot: null,
          maxSequenceNumber,
        },
        { status: 200 }
      );
    }

    // Return the snapshot data
    return NextResponse.json(
      {
        snapshot: latestSnapshot.eventData || null,
        maxSequenceNumber,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Load events error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to load events' },
      { status: 500 }
    );
  }
}
