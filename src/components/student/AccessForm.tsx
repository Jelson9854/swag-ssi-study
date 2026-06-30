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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    role: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [hasExistingSession, setHasExistingSession] = useState<boolean | null>(null);
  const [surveyOpened, setSurveyOpened] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [passwordResetSentTo, setPasswordResetSentTo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchMe() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setCurrentUser(data.user);

        if (data.user?.role === 'student') {
          const checkRes = await fetch(`/api/student-sessions/check?shareToken=${shareToken}`);
          const checkData = await checkRes.json();
          if (mounted) setHasExistingSession(checkData.hasSession);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setIsChecking(false);
      }
    }

    fetchMe();
    return () => { mounted = false; };
  }, [shareToken]);

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
    setPasswordResetSentTo(null);

    try {
      const response = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
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

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    setPasswordResetSentTo(null);

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          shareToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send password reset email');
      }

      setPasswordResetSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send password reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <Card className="min-h-[200px] bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="!p-6 min-h-[200px] flex items-center">
          <div className="flex w-full items-start gap-4">
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
                The link will expire in 24 hours.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (passwordResetSentTo) {
    return (
      <Card className="min-h-[200px] bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="!p-6 min-h-[200px] flex items-center">
          <div className="flex w-full items-start gap-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Check Your Email
              </h3>
              <p className="text-blue-800 dark:text-blue-200 mb-3">
                If an account exists for <strong>{passwordResetSentTo}</strong>, we&apos;ve sent a password reset link.
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300/80 mb-4">
                Open the link in the email to choose a new password and return to this assignment.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPasswordResetSentTo(null);
                  setShowResetForm(false);
                  setError('');
                }}
              >
                Back to login
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isChecking) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--primary))]" />
      </div>
    );
  }

  if (!isChecking && currentUser?.role === 'student') {
    const displayName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email;

    if (hasExistingSession === false) {
      const surveyUrl = `https://virginiatech.qualtrics.com/jfe/form/SV_bvCtH2Sr4uVhEG2?userEmail=${encodeURIComponent(currentUser.email)}&assignmentId=${encodeURIComponent(assignmentId)}`;

      return (
        <Card className="bg-amber-50/50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700">
          <CardContent className="!p-6">
            <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200 mb-2">
              One quick step before you begin
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-300 mb-1">
              Please complete a short consent form before accessing this assignment.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mb-4">
              <strong>You can use SWAG either way</strong> — your consent only determines whether your usage data is included in the research analysis.
            </p>
            {error && (
              <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg mb-3">
                {error}
              </div>
            )}
            {!surveyOpened ? (
              <Button
                type="button"
                onClick={() => {
                  window.open(surveyUrl, '_blank', 'noopener,noreferrer');
                  setSurveyOpened(true);
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Open Consent Form
              </Button>
            ) : (
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
                    setIsLoading(false);
                  }
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isLoading ? 'Starting...' : 'Start Assignment'}
              </Button>
            )}
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 text-center">
              Signing in as {displayName}
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="min-h-[200px] bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
        <CardContent className="!p-6 min-h-[200px] flex items-center">
          <div className="flex w-full items-start gap-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-300 mb-2">
                Continue as {displayName}
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                We&apos;ll resume your session for this assignment.
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
                {isLoading ? 'Starting...' : 'Continue Assignment'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isChecking && (currentUser?.role === 'instructor' || currentUser?.role === 'administrator')) {
    const accountType = currentUser.role === 'administrator' ? 'Administrator' : 'Instructor';

    return (
      <Card className="min-h-[200px] bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
        <CardContent className="!p-6 min-h-[200px] flex items-center">
          <div className="flex w-full items-start gap-4">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
                {accountType} account detected
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
            setShowResetForm(false);
            setError('');
            setPasswordResetSentTo(null);
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
            setShowResetForm(false);
            setError('');
            setPasswordResetSentTo(null);
          }}
          className={mode === 'signup' ? 'shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}
        >
          Sign Up
        </Button>
      </div>

      {mode === 'login' && showResetForm ? (
        <form onSubmit={handlePasswordResetRequest} className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Reset your password</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Enter your account email and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="reset-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Email
            </label>
            <Input
              type="email"
              id="reset-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="your.email@example.com"
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
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </Button>

          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => {
              setShowResetForm(false);
              setError('');
              setPasswordResetSentTo(null);
            }}
          >
            Back to login
          </Button>
        </form>
      ) : mode === 'login' ? (
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

          <div className="flex justify-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 py-0 text-sm"
              onClick={() => {
                setShowResetForm(true);
                setError('');
                setPasswordResetSentTo(null);
              }}
            >
              Forgot password?
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="signup-first-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                First name
              </label>
              <Input
                type="text"
                id="signup-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-last-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Last name
              </label>
              <Input
                type="text"
                id="signup-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
                placeholder="Doe"
              />
            </div>
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
