'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import dynamic from 'next/dynamic';
import DeleteAssignmentButton from '../DeleteAssignmentButton';
import { ChevronLeft, Save, Globe, Brain, FileText } from 'lucide-react';

const InstructionEditor = dynamic(
  () => import('@/components/editor/InstructionEditor'),
  { ssr: false, loading: () => <div className="p-4 text-[hsl(var(--muted-foreground))]">Loading editor...</div> }
);

interface Assignment {
  id: string;
  title: string;
  instructions: string;
  deadline: Date;
  customSystemPrompt: string | null;
  includeInstructionInPrompt: boolean;
  allowWebSearch: boolean;
}

export default function EditAssignmentPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string>('');

  useEffect(() => {
    async function fetchAssignment() {
      try {
        const res = await fetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Failed to load assignment');
        }
        const data = await res.json();
        setAssignment(data);
        setInstructions(data.instructions || '');
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
    const data = {
      title: formData.get('title') as string,
      instructions: instructions, // Use state value from editor
      deadline: formData.get('deadline') as string,
      customSystemPrompt: formData.get('customSystemPrompt') as string || null,
      includeInstructionInPrompt: formData.get('includeInstructionInPrompt') === 'on',
      allowWebSearch: formData.get('allowWebSearch') === 'on',
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/instructor/assignments/${assignmentId}`}>
              <Button variant="ghost" size="icon" className="hover:bg-[hsl(var(--muted))]">
                <ChevronLeft className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold font-heading text-[hsl(var(--foreground))]">Edit Assignment</h1>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

          {/* AI Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-[hsl(var(--primary))]" />
                <CardTitle>AI Assistant Settings</CardTitle>
              </div>
              <CardDescription>Configure how the AI helps students with this assignment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="customSystemPrompt" className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Custom System Prompt (Optional)
                </label>
                <Textarea
                  id="customSystemPrompt"
                  name="customSystemPrompt"
                  rows={4}
                  defaultValue={assignment.customSystemPrompt || ''}
                  placeholder="Override the default system prompt for this specific assignment..."
                />
              </div>

              <div className="flex items-center gap-3 p-3 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--muted))]/20">
                <input
                  type="checkbox"
                  id="includeInstructionInPrompt"
                  name="includeInstructionInPrompt"
                  defaultChecked={assignment.includeInstructionInPrompt}
                  className="h-4 w-4 text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))] border-[hsl(var(--input))] rounded bg-[hsl(var(--background))]"
                />
                <label htmlFor="includeInstructionInPrompt" className="text-sm font-medium text-[hsl(var(--foreground))] cursor-pointer select-none">
                  Include instructions in system prompt
                </label>
              </div>

              {/* Web Search Toggle */}
              <div className="p-4 bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))] rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    id="allowWebSearch"
                    name="allowWebSearch"
                    defaultChecked={assignment.allowWebSearch}
                    className="h-4 w-4 text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))] border-[hsl(var(--input))] rounded bg-[hsl(var(--background))]"
                  />
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    <label htmlFor="allowWebSearch" className="text-sm font-medium text-[hsl(var(--foreground))] cursor-pointer select-none">
                      Allow Web Search
                    </label>
                  </div>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] ml-7">
                  Allows students to use real-time web search during their writing session.
                  <br />
                  <span className="text-[hsl(var(--destructive))] opacity-80 text-xs font-semibold mt-1 block">
                    Recommended only if external research is required.
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

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
