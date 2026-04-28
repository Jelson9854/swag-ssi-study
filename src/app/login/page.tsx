import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db/db';
import { instructors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import LoginForm from '@/components/auth/LoginForm';

export default async function LoginPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_session')?.value;

  if (userId) {
    const user = await db.query.instructors.findFirst({
      where: eq(instructors.id, userId),
    });

    if (user?.role === 'instructor') redirect('/instructor/dashboard');
    if (user?.role === 'student') redirect('/student/dashboard');
  }

  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS || 'vt.edu';
  return <LoginForm allowedDomains={allowedDomains} />;
}
