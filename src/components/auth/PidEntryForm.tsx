'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function PidEntryForm() {
  const router = useRouter();
  const [pid, setPid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pid.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/pid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: pid.trim() }),
      });

      if (!res.ok) {
        throw new Error('Failed to continue');
      }

      const data = await res.json();
      router.push(data.role === 'admin' ? '/instructor/dashboard' : '/participant');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="pid" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
          Enter your PID
        </label>
        <input
          id="pid"
          type="text"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          autoFocus
          className="w-full h-11 px-3 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="e.g. P042"
        />
      </div>

      {error && (
        <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
          {error}
        </div>
      )}

      <Button type="submit" fullWidth disabled={loading || !pid.trim()}>
        {loading ? 'Continuing…' : 'Continue'}
      </Button>
    </form>
  );
}