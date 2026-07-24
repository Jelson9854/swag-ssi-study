import { db } from '@/db/db';
import { assignments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import ContinueToEditorButton from '@/components/student/ContinueToEditorButton';
import InstructionEditor from '@/components/editor/InstructionEditor';

interface PageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function AssignmentAccessPage({ params }: PageProps) {
  const { shareToken } = await params;

  const cookieStore = await cookies();
  const pid = cookieStore.get('participant_pid')?.value;

  if (!pid) {
    redirect('/');
  }

  // Fetch assignment by share token
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.shareToken, shareToken),
  });

  if (!assignment) {
    notFound();
  }

  // Calculate time remaining
  const now = Date.now();
  const timeRemaining = assignment.deadline.getTime() - now;
  const isExpired = timeRemaining <= 0;
  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  // If deadline has passed, show expired message
  if (isExpired) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-sm p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] mb-2">
              {assignment.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
              <span>Due: {assignment.deadline.toLocaleDateString()}</span>
            </div>
          </div>

          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <svg className="w-16 h-16 mx-auto text-destructive mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-destructive mb-2">
              Submission Closed
            </h2>
            <p className="text-destructive/80">
              The deadline for this assignment has passed. New submissions are no longer accepted.
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-4">
              If you believe this is an error, please contact your instructor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-sm p-8">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] mb-2">
            {assignment.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
            <span>Due: {assignment.deadline.toLocaleDateString()}</span>
            <span className="text-[hsl(var(--primary))] font-medium">
              {daysRemaining > 0
                ? `${daysRemaining} days ${hoursRemaining} hours remaining`
                : hoursRemaining > 0
                  ? `${hoursRemaining} hours remaining`
                  : 'Due soon'}
            </span>
          </div>
        </div>

        <div className="mb-8 bg-[hsl(var(--muted))] rounded-lg p-6 border border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-3">
            Instructions
          </h2>
          <InstructionEditor initialContent={assignment.instructions} editable={false} />
        </div>

        <ContinueToEditorButton assignmentId={assignment.id} shareToken={shareToken} />
      </div>
    </div>
  );
}
