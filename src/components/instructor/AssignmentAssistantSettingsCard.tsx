'use client';

import { useId, useState } from 'react';
import { Brain, Globe, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ASSIGNMENT_AI_GUIDANCE_EXAMPLES,
  resolveAssignmentAiGuidance,
} from '@/lib/assignment-ai';

interface AssignmentAssistantSettingsCardProps {
  guidanceDefaultValue?: string | null;
  includeInstructionsDefaultChecked?: boolean;
  allowWebSearchDefaultChecked?: boolean;
  strictPasteBlockingDefaultChecked?: boolean;
}

export default function AssignmentAssistantSettingsCard({
  guidanceDefaultValue,
  includeInstructionsDefaultChecked = false,
  allowWebSearchDefaultChecked = false,
  strictPasteBlockingDefaultChecked = false,
}: AssignmentAssistantSettingsCardProps) {
  const guidanceId = useId();
  const includeInstructionsId = useId();
  const allowWebSearchId = useId();
  const strictPasteBlockingId = useId();
  const examplesPanelId = useId();
  const [showExamples, setShowExamples] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-[hsl(var(--primary))]" />
          <CardTitle>AI Assistant Settings</CardTitle>
        </div>
        <CardDescription>Configure how the AI helps students with this assignment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={guidanceId} className="text-sm font-medium text-[hsl(var(--foreground))]">
              How the AI should help <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowExamples((current) => !current)}
              aria-expanded={showExamples}
              aria-controls={examplesPanelId}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              title={showExamples ? 'Hide hints' : 'Show hints'}
            >
              <Info className="h-4 w-4" />
              <span className="text-xs font-medium">Hint</span>
              <span className="sr-only">{showExamples ? 'Hide hints' : 'Show hints'}</span>
            </button>
          </div>
          <Textarea
            id={guidanceId}
            name="customSystemPrompt"
            rows={5}
            required
            defaultValue={resolveAssignmentAiGuidance(guidanceDefaultValue)}
            className="min-h-[140px]"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            This tells the assistant what kind of support to give students during this assignment.
          </p>

          {showExamples ? (
            <div
              id={examplesPanelId}
              className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4"
            >
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                Hint examples you can paste or adapt
              </p>
              <div className="space-y-2">
                {ASSIGNMENT_AI_GUIDANCE_EXAMPLES.map((example) => (
                  <div
                    key={example}
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  >
                    {example}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id={includeInstructionsId}
              name="includeInstructionInPrompt"
              defaultChecked={includeInstructionsDefaultChecked}
              className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--input))] bg-[hsl(var(--background))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
            />
            <div className="space-y-1">
              <label
                htmlFor={includeInstructionsId}
                className="cursor-pointer text-sm font-medium text-[hsl(var(--foreground))] select-none"
              >
                Also give the AI the assignment instructions
              </label>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                When this is on, the AI uses both the guidance above and the assignment instructions, so its answers can stay closer to the task requirements.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4">
          <div className="mb-2 flex items-center gap-3">
            <input
              type="checkbox"
              id={allowWebSearchId}
              name="allowWebSearch"
              defaultChecked={allowWebSearchDefaultChecked}
              className="h-4 w-4 rounded border-[hsl(var(--input))] bg-[hsl(var(--background))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
            />
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <label
                htmlFor={allowWebSearchId}
                className="cursor-pointer select-none text-sm font-medium text-[hsl(var(--foreground))]"
              >
                Allow Web Search
              </label>
            </div>
          </div>
          <p className="ml-7 text-sm text-[hsl(var(--muted-foreground))]">
            Allows students to use real-time web search during their writing session.
            <br />
            <span className="mt-1 block text-xs font-semibold text-[hsl(var(--destructive))] opacity-80">
              Recommended only if external research is required.
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4">
          <div className="mb-2 flex items-center gap-3">
            <input
              type="checkbox"
              id={strictPasteBlockingId}
              name="strictPasteBlocking"
              defaultChecked={strictPasteBlockingDefaultChecked}
              className="h-4 w-4 rounded border-[hsl(var(--input))] bg-[hsl(var(--background))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
            />
            <label
              htmlFor={strictPasteBlockingId}
              className="cursor-pointer select-none text-sm font-medium text-[hsl(var(--foreground))]"
            >
              Strictly Block External Paste
            </label>
          </div>
          <p className="ml-7 text-sm text-[hsl(var(--muted-foreground))]">
            When enabled, external clipboard content is blocked before it can be inserted into the student editor.
            <br />
            <span className="mt-1 block text-xs font-semibold text-[hsl(var(--destructive))] opacity-80">
              Use this for assignments that require fully in-system drafting.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
