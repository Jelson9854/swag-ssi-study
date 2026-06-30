'use client';

import { useState, useEffect, useId } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import dynamic from 'next/dynamic';
import DeleteAssignmentButton from '../DeleteAssignmentButton';
import { ChevronLeft, Save, FileText, ListChecks } from 'lucide-react';
import AssignmentAssistantSettingsCard from '@/components/instructor/AssignmentAssistantSettingsCard';
import { resolveAssignmentAiGuidance } from '@/lib/assignment-ai';

const InstructionEditor = dynamic(
  () => import('@/components/editor/InstructionEditor'),
  { ssr: false, loading: () => <div className="p-4 text-[hsl(var(--muted-foreground))]">Loading editor...</div> }
);

interface Assignment {
  id: string;
  title: string;
  instructions: string;
  criteria: string | null;
  deadline: Date;
  instructorId: string | null;
  customSystemPrompt: string;
  includeInstructionInPrompt: boolean;
  allowWebSearch: boolean;
  strictPasteBlocking: boolean;
}

export default function EditAssignmentPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;
  const criteriaToggleId = useId();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string>('');
  const [criteria, setCriteria] = useState<string>('');
  const [useCriteria, setUseCriteria] = useState(false);

  useEffect(() => {
    async function fetchAssignment() {
      try {
        const [res, meRes] = await Promise.all([
          fetch(`/api/assignments/${assignmentId}`),
          fetch('/api/auth/me'),
        ]);
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Failed to load assignment');
        }
        const data = await res.json();
        const meData = meRes.ok ? await meRes.json() : null;

        if (data.instructorId !== meData?.user?.id) {
          setError('Only the owner can edit this assignment.');
          setAssignment(null);
          return;
        }

        setAssignment({
          ...data,
          customSystemPrompt: resolveAssignmentAiGuidance(data.customSystemPrompt),
          includeInstructionInPrompt: Boolean(data.includeInstructionInPrompt),
          allowWebSearch: Boolean(data.allowWebSearch),
          strictPasteBlocking: Boolean(data.strictPasteBlocking),
        });
        setInstructions(data.instructions || '');
        setCriteria(data.criteria || '');
        setUseCriteria(Boolean(data.criteria));
      } catch {
        setError('Failed to load assignment');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAssignment();
  }, [assignmentId, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const trimmedCriteria = criteria.trim();
    const data = {
      title: formData.get('title') as string,
      instructions: instructions, // Use state value from editor
      criteria: useCriteria && trimmedCriteria ? criteria : null,
      deadline: formData.get('deadline') as string,
      customSystemPrompt: resolveAssignmentAiGuidance(formData.get('customSystemPrompt') as string | null),
      includeInstructionInPrompt: formData.get('includeInstructionInPrompt') === 'on',
      allowWebSearch: formData.get('allowWebSearch') === 'on',
      strictPasteBlocking: formData.get('strictPasteBlocking') === 'on',
    };

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'Failed to update assignment');
      }

      router.push(`/instructor/assignments/${assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
        <div className="text-[hsl(var(--muted-foreground))]">Loading...</div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
        <div className="text-[hsl(var(--destructive))]">{error || 'Assignment not found'}</div>
      </div>
    );
  }

  // Format deadline for datetime-local input
  const deadlineValue = new Date(assignment.deadline).toISOString().slice(0, 16);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="hover:bg-[hsl(var(--muted))]" onClick={() => router.back()}>
              <ChevronLeft className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
            </Button>
            <h1 className="text-xl font-bold font-heading text-[hsl(var(--foreground))]">Edit Assignment</h1>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/30 text-[hsl(var(--destructive))] px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[hsl(var(--primary))]" />
                <CardTitle>Assignment Details</CardTitle>
              </div>
              <CardDescription>Basic information and instructions for students.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6 pt-0">
              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Title <span className="text-[hsl(var(--destructive))]">*</span>
                </label>
                <Input
                  type="text"
                  id="title"
                  name="title"
                  required
                  defaultValue={assignment.title}
                  placeholder="e.g. History Essay #1"
                />
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Instructions <span className="text-[hsl(var(--destructive))]">*</span>
                </label>
                <div className="border border-[hsl(var(--input))] rounded-md overflow-hidden bg-[hsl(var(--background))]">
                  {/* Pass theme safe bg if component supports it, otherwise wrapper handles it */}
                  <InstructionEditor
                    initialContent={assignment.instructions}
                    onChange={setInstructions}
                    editable={true}
                  />
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Supported Markdown: **bold**, *italic*, # headings, - lists.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={criteriaToggleId}
                    checked={useCriteria}
                    onChange={(event) => setUseCriteria(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--input))] bg-[hsl(var(--background))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
                  />
                  <div className="space-y-1">
                    <label htmlFor={criteriaToggleId} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
                      <ListChecks className="h-4 w-4 text-[hsl(var(--primary))]" />
                      Use Criteria
                    </label>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Optionally provide a rubric or evaluation criteria. The editor opens only when this is enabled.
                    </p>
                  </div>
                </div>

                {useCriteria ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[hsl(var(--foreground))]">
                      Criteria
                    </label>
                    <div className="border border-[hsl(var(--input))] rounded-md overflow-hidden bg-[hsl(var(--background))]">
                      <InstructionEditor
                        initialContent={criteria}
                        onChange={setCriteria}
                        editable={true}
                      />
                    </div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Use headings or bullet lists to define what good work should include.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <label htmlFor="deadline" className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Deadline <span className="text-[hsl(var(--destructive))]">*</span>
                </label>
                <div className="w-full sm:w-1/2">
                  <Input
                    type="datetime-local"
                    id="deadline"
                    name="deadline"
                    required
                    defaultValue={deadlineValue}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <AssignmentAssistantSettingsCard
            guidanceDefaultValue={assignment.customSystemPrompt}
            includeInstructionsDefaultChecked={assignment.includeInstructionInPrompt}
            allowWebSearchDefaultChecked={assignment.allowWebSearch}
            strictPasteBlockingDefaultChecked={assignment.strictPasteBlocking}
          />

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <DeleteAssignmentButton assignmentId={assignmentId} />
            <div className="flex gap-3">
              <Link href={`/instructor/assignments/${assignmentId}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
