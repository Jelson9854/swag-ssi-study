'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText, ListChecks } from 'lucide-react';
import AssignmentAssistantSettingsCard from '@/components/instructor/AssignmentAssistantSettingsCard';
import { resolveAssignmentAiGuidance } from '@/lib/assignment-ai';

const InstructionEditor = dynamic(
  () => import('@/components/editor/InstructionEditor'),
  { ssr: false, loading: () => <div className="p-4 text-[hsl(var(--muted-foreground))]">Loading editor...</div> }
);

export default function NewAssignmentPage() {
  const router = useRouter();
  const criteriaToggleId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string>('');
  const [criteria, setCriteria] = useState<string>('');
  const [useCriteria, setUseCriteria] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const trimmedCriteria = criteria.trim();
    const data = {
      title: formData.get('title') as string,
      instructions: instructions,
      criteria: useCriteria && trimmedCriteria ? criteria : null,
      customSystemPrompt: resolveAssignmentAiGuidance(formData.get('customSystemPrompt') as string | null),
      includeInstructionInPrompt: formData.get('includeInstructionInPrompt') === 'on',
      allowWebSearch: formData.get('allowWebSearch') === 'on',
      strictPasteBlocking: formData.get('strictPasteBlocking') === 'on',
      chatReadOnly: formData.get('chatReadOnly') === 'on',
    };

    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'Failed to create assignment');
      }

      router.replace('/instructor/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <BackLink href="/instructor/dashboard" label="Back" />
            <h1 className="text-xl font-bold font-heading text-[hsl(var(--foreground))]">New Assignment</h1>
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
            <CardContent className="space-y-6">
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
                  placeholder="e.g., AI Ethics Essay"
                />
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Instructions <span className="text-[hsl(var(--destructive))]">*</span>
                </label>
                <div className="border border-[hsl(var(--input))] rounded-md overflow-hidden bg-[hsl(var(--background))]">
                  <InstructionEditor
                    initialContent=""
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

            </CardContent>
          </Card>

          <AssignmentAssistantSettingsCard />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link href="/instructor/dashboard">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Assignment'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
