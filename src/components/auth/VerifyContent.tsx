'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const shareToken = searchParams.get('shareToken');

  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<'instructor' | 'student' | null>(null);
  const [mode, setMode] = useState<'setup' | 'reset'>('setup');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setLinkError('No token provided');
        setIsVerifying(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          const data = await res.json();
          setEmail(data.email);
          setRole(data.role ?? null);
          setMode(data.mode === 'reset' ? 'reset' : 'setup');
          setIsVerifying(false);
        } else {
          const data = await res.json();
          setLinkError(data.error || 'Verification failed');
          setIsVerifying(false);
        }
      } catch {
        setLinkError('Verification failed');
        setIsVerifying(false);
      }
    }

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const resolvedRole = data.role ?? role;
        if (resolvedRole === 'student' && shareToken) {
          router.push(`/s/${shareToken}`);
          return;
        }

        if (resolvedRole === 'instructor') {
          router.push('/instructor/dashboard');
        } else {
          router.push('/student/dashboard');
        }
      } else {
        const data = await res.json();
        setFormError(data.error || 'Failed to set password');
      }
    } catch {
      setFormError('Failed to set password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Validating your link...</p>
        </div>
      </div>
    );
  }

  if (linkError) {
    const backHref = shareToken ? `/s/${shareToken}` : '/login';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            {linkError === 'No token provided' ? 'Invalid Link' : 'Link Expired or Invalid'}
          </h1>
          <p className="mt-2 text-gray-600">
            {linkError}
          </p>
          <a href={backHref} className="mt-4 inline-block text-blue-600 hover:underline">
            {shareToken ? 'Back to assignment' : 'Back to login'}
          </a>
        </div>
      </div>
    );
  }

  const isResetMode = mode === 'reset';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isResetMode ? 'Reset Your Password' : 'Set Your Password'}
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          {isResetMode ? 'Choose a new password for' : 'Email:'} <span className="font-medium">{email}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Re-enter password"
            />
          </div>

          {formError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {isSubmitting
              ? (isResetMode ? 'Resetting password...' : 'Setting password...')
              : (isResetMode ? 'Reset Password' : 'Complete Registration')}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          Password must be at least 8 characters and include uppercase, lowercase, and a number
        </p>
      </div>
    </div>
  );
}
