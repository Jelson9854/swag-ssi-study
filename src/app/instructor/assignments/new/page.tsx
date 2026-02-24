'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText, Brain, Globe } from 'lucide-react';

const InstructionEditor = dynamic(
  () => import('@/components/editor/InstructionEditor'),
  { ssr: false, loading: () => <div className="p-4 text-[hsl(var(--muted-foreground))]">Loading editor...</div> }
);

export default function NewAssignmentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string>('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get('title') as string,
      instructions: instructions,
      deadline: formData.get('deadline') as string,
      customSystemPrompt: formData.get('customSystemPrompt') as string || null,
      includeInstructionInPrompt: formData.get('includeInstructionInPrompt') === 'on',
      allowWebSearch: formData.get('allowWebSearch') === 'on',
      strictPasteBlocking: formData.get('strictPasteBlocking') === 'on',
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

  // Default deadline: 7 days from now at 11:59 PM (local time)
  const defaultDeadlineDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  defaultDeadlineDate.setHours(23, 59, 0, 0);
  const year = defaultDeadlineDate.getFullYear();
  const month = String(defaultDeadlineDate.getMonth() + 1).padStart(2, '0');
  const day = String(defaultDeadlineDate.getDate()).padStart(2, '0');
  const hours = String(defaultDeadlineDate.getHours()).padStart(2, '0');
  const minutes = String(defaultDeadlineDate.getMinutes()).padStart(2, '0');
  const defaultDeadline = `${year}-${month}-${day}T${hours}:${minutes}`;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <BackLink href="/instructor/dashboard" label="Back" />
            <h1 className="text-xl font-bold font-heading text-[hsl(var(--foreground))]">New Assignment</h1>
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
                    defaultValue={defaultDeadline}
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
                  placeholder="You are a helpful writing assistant for students. Help them brainstorm ideas, structure their essays, and improve their writing."
                />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Leave empty to use the default system prompt.
                </p>
              </div>

              <div className="flex items-center gap-3 p-3 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--muted))]/20">
                <input
                  type="checkbox"
                  id="includeInstructionInPrompt"
                  name="includeInstructionInPrompt"
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

              {/* Strict Paste Blocking Toggle */}
              <div className="p-4 bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))] rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    id="strictPasteBlocking"
                    name="strictPasteBlocking"
                    className="h-4 w-4 text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))] border-[hsl(var(--input))] rounded bg-[hsl(var(--background))]"
                  />
                  <label htmlFor="strictPasteBlocking" className="text-sm font-medium text-[hsl(var(--foreground))] cursor-pointer select-none">
                    Strictly Block External Paste
                  </label>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] ml-7">
                  When enabled, external clipboard content is blocked before it can be inserted into the student editor.
                  <br />
                  <span className="text-[hsl(var(--destructive))] opacity-80 text-xs font-semibold mt-1 block">
                    Use this for assignments that require fully in-system drafting.
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

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
