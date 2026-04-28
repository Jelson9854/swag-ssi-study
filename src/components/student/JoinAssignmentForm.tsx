'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function JoinAssignmentForm() {
  const router = useRouter();
  const [shareInput, setShareInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const extractShareToken = (value: string) => {
    const trimmed = value.trim();
    const match = trimmed.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) {
      return match[1];
    }
    return trimmed || null;
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsJoining(true);

    try {
      const shareToken = extractShareToken(shareInput);
      if (!shareToken) {
        throw new Error('Please enter a valid share link or token.');
      }

      router.push(`/s/${shareToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join assignment.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <form onSubmit={handleJoin} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="shareLink" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Share link or token
        </label>
        <Input
          id="shareLink"
          type="text"
          value={shareInput}
          onChange={(e) => setShareInput(e.target.value)}
          placeholder="https://.../s/abc123 or abc123"
        />
      </div>
      {error && (
        <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}
      <Button
        type="submit"
        disabled={isJoining}
        className="w-full sm:w-auto"
      >
        {isJoining ? 'Joining...' : 'Join Assignment'}
      </Button>
    </form>
  );
}
