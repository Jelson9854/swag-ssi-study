import { db } from '@/db/db';
import { studentSessions } from '@/db/schema';
import { eq, max } from 'drizzle-orm';

function formatToken(n: number): string {
  return `P-${String(n).padStart(3, '0')}`;
}

export async function generateNextParticipantToken(assignmentId: string): Promise<string> {
  const result = await db
    .select({ maxToken: max(studentSessions.participantToken) })
    .from(studentSessions)
    .where(eq(studentSessions.assignmentId, assignmentId));

  const maxToken = result[0]?.maxToken;
  if (!maxToken) {
    return formatToken(1);
  }

  const match = maxToken.match(/^P-(\d+)$/);
  const current = match ? parseInt(match[1], 10) : 0;
  return formatToken(current + 1);
}
