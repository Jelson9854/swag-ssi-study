'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function ContinueToEditorButton({ assignmentId, shareToken }: { assignmentId: string; shareToken: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/student-sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start session');
      }

      const data = await res.json();
      router.push(`/s/${shareToken}/editor/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
          {error}
        </div>
      )}
      <Button onClick={handleClick} disabled={loading} fullWidth>
        {loading ? 'Loading…' : 'Continue'}
      </Button>
    </div>
  );
}
