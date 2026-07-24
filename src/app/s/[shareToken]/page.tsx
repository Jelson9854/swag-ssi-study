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

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-sm p-8">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] mb-2">
            {assignment.title}
          </h1>
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
