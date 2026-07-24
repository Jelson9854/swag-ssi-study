import PidEntryForm from '@/components/auth/PidEntryForm';

export default function Home() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-1">SWAG</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
          Enter your participant ID to continue.
        </p>
        <PidEntryForm />
      </div>
    </div>
  );
}