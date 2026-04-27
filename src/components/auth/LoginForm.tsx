'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface LoginFormProps {
  allowedDomains: string;
}

export default function LoginForm({ allowedDomains }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [signupEmailSentTo, setSignupEmailSentTo] = useState<string | null>(null);
  const [resetEmailSentTo, setResetEmailSentTo] = useState<string | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<'pending' | 'consented' | 'declined'>('pending');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.user?.role === 'instructor') {
        router.push('/instructor/dashboard');
      } else {
        router.push('/student/dashboard');
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Login failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setSignupEmailSentTo(null);
    setResetEmailSentTo(null);

    try {
      const response = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          passcode: passcode.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification link');
      }

      setMessage({
        type: 'success',
        text: 'Check your email for a verification link!',
      });
      setSignupEmailSentTo(email.trim());
      setFirstName('');
      setLastName('');
      setEmail('');
      setPasscode('');
      setSurveyStatus('pending');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setResetEmailSentTo(null);

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send password reset link');
      }

      setResetEmailSentTo(email.trim());
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const emailPlaceholder = `you@${allowedDomains.split(',')[0]}`;
  const domainText = allowedDomains.split(',').map(d => `@${d}`).join(', ');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-0 sm:border shadow-none sm:shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">SWAG</CardTitle>
          <CardDescription>
            Student Writing with Accountable Generative AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Toggle between Login and Signup */}
          <div className="grid grid-cols-2 gap-2 mb-8 p-1 bg-[hsl(var(--muted))] rounded-lg">
            <Button
              type="button"
              variant={mode === 'login' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                setMode('login');
                setShowResetForm(false);
                setMessage(null);
                setSignupEmailSentTo(null);
                setResetEmailSentTo(null);
                setSurveyStatus('pending');
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
                setMessage(null);
                setSignupEmailSentTo(null);
                setResetEmailSentTo(null);
              }}
              className={mode === 'signup' ? 'shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}
            >
              Sign Up
            </Button>
          </div>

          {mode === 'login' && showResetForm ? (
            resetEmailSentTo ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10 p-4 text-sm">
                  <p className="font-medium text-green-900 dark:text-green-300">Check your email</p>
                  <p className="mt-1 text-green-800 dark:text-green-200">
                    If an account exists for <strong>{resetEmailSentTo}</strong>, we&apos;ve sent a password reset link.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() => {
                    setShowResetForm(false);
                    setMessage(null);
                    setResetEmailSentTo(null);
                  }}
                >
                  Back to login
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordResetRequest} className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Reset your password</h2>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Enter the email address you used for SWAG and we&apos;ll send you a reset link.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="reset-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Email
                  </label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={emailPlaceholder}
                  />
                </div>

                {message?.type === 'error' && (
                  <div className="p-3 rounded-md text-sm bg-destructive/10 text-destructive">
                    {message.text}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>

                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() => {
                    setShowResetForm(false);
                    setMessage(null);
                    setResetEmailSentTo(null);
                  }}
                >
                  Back to login
                </Button>
              </form>
            )
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Email
                </label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={emailPlaceholder}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Password
                </label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {message?.type === 'error' && (
                <div
                  className="p-3 rounded-md text-sm bg-destructive/10 text-destructive"
                >
                  {message.text}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Log In'}
              </Button>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 py-0 text-sm"
                  onClick={() => {
                    setShowResetForm(true);
                    setMessage(null);
                    setResetEmailSentTo(null);
                  }}
                >
                  Forgot password?
                </Button>
              </div>
            </form>
          ) : signupEmailSentTo ? (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10 p-4 text-sm">
              <p className="font-medium text-green-900 dark:text-green-300">Check your email</p>
              <p className="mt-1 text-green-800 dark:text-green-200">
                We&apos;ve sent a verification link to <strong>{signupEmailSentTo}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="signup-first-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    First Name
                  </label>
                  <Input
                    id="signup-first-name"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="signup-last-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Last Name
                  </label>
                  <Input
                    id="signup-last-name"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="signup-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Email
                </label>
                <Input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={emailPlaceholder}
                />
                <p className="text-[0.8rem] text-[hsl(var(--muted-foreground))]">
                  We&apos;ll send you a verification link to set your password
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="signup-passcode" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Instructor Passcode <span className="text-[hsl(var(--muted-foreground))] font-normal">(Optional)</span>
                </label>
                <Input
                  id="signup-passcode"
                  name="passcode"
                  type="password"
                  autoComplete="off"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="For instructors only"
                />
              </div>

              {message?.type === 'error' && (
                <div
                  className="p-3 rounded-md text-sm bg-destructive/10 text-destructive"
                >
                  {message.text}
                </div>
              )}

              <div
                className={`rounded-lg border-2 p-4 text-sm transition-colors ${
                  surveyStatus === 'pending'
                    ? 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/20'
                    : surveyStatus === 'consented'
                    ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/15'
                    : 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/40'
                }`}
              >
                {surveyStatus === 'pending' && (
                  <>
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Required: User Study Consent Form
                    </p>
                    <p className="mt-1 text-amber-800 dark:text-amber-300">
                      Please open the consent form before signing up. If you agree to participate, you&apos;ll also be asked to fill out a short demographic survey.
                    </p>
                    <p className="mt-2 text-amber-800 dark:text-amber-300">
                      <strong>You can use SWAG either way</strong> — your consent only determines whether your usage data is included in the research analysis.
                    </p>
                  </>
                )}

                {surveyStatus === 'consented' && (
                  <>
                    <p className="font-semibold text-green-900 dark:text-green-200">
                      Thank you for joining the research study
                    </p>
                    <p className="mt-1 text-green-800 dark:text-green-300">
                      Your SWAG usage data will be included in our research analysis. You&apos;re all set to sign up below.
                    </p>
                  </>
                )}

                {surveyStatus === 'declined' && (
                  <>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      You&apos;ve declined research participation
                    </p>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">
                      That&apos;s totally fine — you can use SWAG normally. Your usage data will <strong>not</strong> be analyzed for research.
                    </p>
                  </>
                )}

                <a
                  href="https://virginiatech.qualtrics.com/jfe/form/SV_bvCtH2Sr4uVhEG2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-2 inline-block font-medium underline ${
                    surveyStatus === 'pending'
                      ? 'text-amber-900 dark:text-amber-200'
                      : surveyStatus === 'consented'
                      ? 'text-green-900 dark:text-green-200'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {surveyStatus === 'pending' ? 'Open survey in a new tab →' : 'Re-open survey'}
                </a>

                <fieldset className="mt-3 space-y-2">
                  <legend
                    className={`text-xs font-medium uppercase tracking-wide ${
                      surveyStatus === 'pending'
                        ? 'text-amber-900 dark:text-amber-200'
                        : surveyStatus === 'consented'
                        ? 'text-green-900 dark:text-green-200'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Which option did you choose?
                  </legend>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="survey-status"
                      checked={surveyStatus === 'consented'}
                      onChange={() => setSurveyStatus('consented')}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-green-600"
                    />
                    <span className="text-sm text-[hsl(var(--foreground))]">
                      I <strong>consented</strong> and finished the demographic survey.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="survey-status"
                      checked={surveyStatus === 'declined'}
                      onChange={() => setSurveyStatus('declined')}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-slate-500"
                    />
                    <span className="text-sm text-[hsl(var(--foreground))]">
                      I <strong>declined</strong> research participation.
                    </span>
                  </label>
                </fieldset>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || surveyStatus === 'pending'}
              >
                {isLoading
                  ? 'Sending...'
                  : surveyStatus === 'pending'
                  ? 'Open the consent form to continue'
                  : 'Send Verification Link'}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t border-[hsl(var(--border))] pt-6">
          <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
            Only <span className="font-medium text-[hsl(var(--foreground))]">{domainText}</span> email addresses are allowed
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
