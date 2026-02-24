'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface DeleteAssignmentButtonProps {
  assignmentId: string;
}

export default function DeleteAssignmentButton({ assignmentId }: DeleteAssignmentButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.replace('/instructor/dashboard');
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete assignment');
      }
    } catch {
      alert('Failed to delete assignment');
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[hsl(var(--destructive))] font-medium">Are you sure?</span>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Yes, Delete'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowConfirm(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]/50 hover:border-[hsl(var(--destructive))]"
      onClick={() => setShowConfirm(true)}
    >
      <Trash2 className="w-4 h-4 mr-2" />
      Delete Assignment
    </Button>
  );
}
