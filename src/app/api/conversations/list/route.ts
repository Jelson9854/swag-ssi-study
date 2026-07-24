import { db } from '@/db/db';
import { chatConversations, studentSessions } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response('Session ID is required', { status: 400 });
    }

    const cookieStore = await cookies();
    const pid = cookieStore.get('participant_pid')?.value;
    if (!pid) {
      return new Response('Unauthorized', { status: 401 });
    }

    const session = await db.query.studentSessions.findFirst({
      where: eq(studentSessions.id, sessionId),
    });
    if (!session || session.participantToken !== pid) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Fetch all conversations for this session, ordered by creation time
    const conversations = await db.query.chatConversations.findMany({
      where: eq(chatConversations.sessionId, sessionId),
      orderBy: [asc(chatConversations.createdAt)],
    });

    return Response.json({ conversations });
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
