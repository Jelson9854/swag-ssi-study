'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Mail, AlertTriangle } from 'lucide-react';

interface AccessFormProps {
  assignmentId: string;
  shareToken: string;
}

export default function AccessForm({ assignmentId, shareToken }: AccessFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<{ name?: string | null; email: string; role: string } | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchMe() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (mounted) {
          setCurrentUser(data.user);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    }

    fetchMe();
    return () => {
      mounted = false;
    };
  }, []);

  const startSession = async () => {
    const response = await fetch('/api/student-sessions/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignmentId,
        shareToken,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to start session');
    }

    const { sessionId } = await response.json();
    router.push(`/s/${shareToken}/editor/${sessionId}`);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Login failed');
      }

      const data = await response.json();
      if (data.user?.role !== 'student') {
        throw new Error('Please log in with a student account.');
      }

      await startSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          shareToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send verification email');
      }

      setVerificationSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Check Your Email
              </h3>
              <p className="text-blue-800 dark:text-blue-200 mb-3">
                We&apos;ve sent a verification link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300/80">
                Click the link in the email to set your password and access the assignment.
                The link will expire in 15 minutes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isChecking && currentUser?.role === 'student') {
    return (
      <Card className="bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-300 mb-2">
                Continue as {currentUser.name || currentUser.email}
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                We&apos;ll start your session for this assignment.
              </p>
              {error && (
                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg mb-3">
                  {error}
                </div>
              )}
              <Button
                type="button"
                disabled={isLoading}
                onClick={async () => {
                  setError('');
                  setIsLoading(true);
                  try {
                    await startSession();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to start session');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isLoading ? 'Starting...' : 'Start Assignment'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isChecking && currentUser?.role === 'instructor') {
    return (
      <Card className="bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
                Instructor account detected
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Please log out and sign in with a student account to access this assignment.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {/* Toggle buttons */}
      <div className="grid grid-cols-2 gap-2 mb-8 p-1 bg-[hsl(var(--muted))] rounded-lg">
        <Button
          type="button"
          variant={mode === 'login' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => {
            setMode('login');
            setError('');
          }}
          className={mode === 'login' ? 'shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}
        >
          Login
        </Button>
        <Button
          type="button"
          variant={mode === 'signup' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => {
            setMode('signup');
            setError('');
          }}
          className={mode === 'signup' ? 'shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}
        >
          Sign Up
        </Button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Email
            </label>
            <Input
              type="email"
              id="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your.email@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Password
            </label>
            <Input
              type="password"
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Your password"
            />
          </div>

          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="signup-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Name
            </label>
            <Input
              type="text"
              id="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Enter your full name"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Email
            </label>
            <Input
              type="email"
              id="signup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your.email@example.com"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              You&apos;ll receive a verification email to set your password
            </p>
          </div>

          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Processing...' : 'Sign Up'}
          </Button>
        </form>
      )}
    </div>
  );
}


