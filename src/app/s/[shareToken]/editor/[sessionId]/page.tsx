import { db } from '@/db/db';
import { assignments, studentSessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import EditorClient from '@/components/editor/EditorClient';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface EditorPageProps {
  params: Promise<{ shareToken: string; sessionId: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { shareToken, sessionId } = await params;

  // Fetch assignment
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.shareToken, shareToken),
  });

  if (!assignment) {
    notFound();
  }

  // Check if deadline has passed
  const isExpired = assignment.deadline.getTime() < Date.now();
  if (isExpired) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-2">
              {assignment.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
              <span>Due: {assignment.deadline.toLocaleDateString()}</span>
            </div>
          </div>

          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h2 className="text-xl font-semibold text-destructive mb-2">
                Submission Closed
              </h2>
              <p className="text-[hsl(var(--foreground))]">
                The deadline for this assignment has passed. The editor is no longer available.
              </p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-4">
                If you believe this is an error, please contact your instructor.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Fetch the specific student session
  const session = await db.query.studentSessions.findFirst({
    where: and(
      eq(studentSessions.id, sessionId),
      eq(studentSessions.assignmentId, assignment.id)
    ),
  });

  // If session doesn't exist or doesn't belong to this assignment, show 404
  if (!session) {
    notFound();
  }

  // Check if session is verified
  if (!session.isVerified) {
    // Redirect back to access page with error message
    redirect(`/s/${shareToken}?error=not-verified`);
  }

  // Check if user has valid session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(`student_session_${assignment.id}`);

  if (!sessionCookie || sessionCookie.value !== sessionId) {
    // No valid session cookie - redirect to login
    redirect(`/s/${shareToken}?error=login-required`);
  }

  return (
    <EditorClient
      sessionId={session.id}
      assignmentId={assignment.id}
      assignmentTitle={assignment.title}
      assignmentInstructions={assignment.instructions}
      assignmentCriteria={assignment.criteria}
      deadline={assignment.deadline}
      allowWebSearch={assignment.allowWebSearch ?? false}
      strictPasteBlocking={assignment.strictPasteBlocking ?? false}
    />
  );
}
