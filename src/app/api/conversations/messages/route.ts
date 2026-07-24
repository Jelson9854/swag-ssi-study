import { db } from '@/db/db';
import { chatMessages, chatConversations, studentSessions } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response('Conversation ID is required', { status: 400 });
    }

    const cookieStore = await cookies();
    const pid = cookieStore.get('participant_pid')?.value;
    if (!pid) {
      return new Response('Unauthorized', { status: 401 });
    }

    const conversation = await db.query.chatConversations.findFirst({
      where: eq(chatConversations.id, conversationId),
    });
    if (!conversation) {
      return new Response('Not found', { status: 404 });
    }

    const session = await db.query.studentSessions.findFirst({
      where: eq(studentSessions.id, conversation.sessionId),
    });
    if (!session || session.participantToken !== pid) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Fetch all messages for this conversation, ordered by sequence
    const messages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.conversationId, conversationId),
      orderBy: [asc(chatMessages.sequenceNumber)],
    });

    // Format messages for client
    const formattedMessages = messages.map((msg) => ({
      id: `msg_${msg.id}`,
      role: msg.role,
      content: msg.content,
    }));

    return Response.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
