import { redirect } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
import DeleteAccountButton from './DeleteAccountButton';
import { Button } from '@/components/ui/button';
import { getInstructor } from '@/lib/auth';

export default async function SettingsPage() {
  const instructor = await getInstructor();

  if (!instructor) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-heading text-[hsl(var(--foreground))]">SWAG</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Account Settings</p>
            </div>
            <div className="flex items-center gap-4">
              <BackLink href="/instructor/dashboard" label="Back to Dashboard" />
              <form action="/api/pid/logout" method="POST">
                <Button
                  type="submit"
                  variant="ghost"
                  className="text-sm text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] font-medium"
                >
                  Logout
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Account Information */}
          <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-6">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">
              Account Information
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-[hsl(var(--muted-foreground))]">PID</label>
                <p className="text-[hsl(var(--foreground))]">{instructor.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Role</label>
                <p className="text-[hsl(var(--foreground))] capitalize">{instructor.role}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Member Since</label>
                <p className="text-[hsl(var(--foreground))]">
                  {new Date(instructor.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              {instructor.lastLoginAt && (
                <div>
                  <label className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Last Login</label>
                  <p className="text-[hsl(var(--foreground))]">
                    {new Date(instructor.lastLoginAt).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--destructive))]/30 p-6">
            <h2 className="text-lg font-semibold text-[hsl(var(--destructive))] mb-2">
              Danger Zone
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
              Once you delete your account, there is no going back. This will permanently delete your account,
              all your assignments, and all student data.
            </p>
            <DeleteAccountButton />
          </div>
        </div>
      </main>
    </div>
  );
}
