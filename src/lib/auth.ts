import { cache } from 'react';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db/db';
import { instructors } from '@/db/schema';

export const INSTRUCTOR_ROLES = ['instructor', 'administrator'] as const;

export type InstructorRole = (typeof INSTRUCTOR_ROLES)[number];

export function isInstructorRole(role: string | null | undefined): role is InstructorRole {
  return role === 'instructor' || role === 'administrator';
}

export function isAdministrator(user: { role: string | null | undefined } | null | undefined): boolean {
  return user?.role === 'administrator';
}

export const getInstructor = cache(async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_session')?.value;

  if (!userId) {
    return null;
  }

  const user = await db.query.instructors.findFirst({
    where: eq(instructors.id, userId),
  });

  if (!user || !isInstructorRole(user.role)) {
    return null;
  }

  return user;
});

export const getStudent = cache(async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_session')?.value;

  if (!userId) {
    return null;
  }

  const user = await db.query.instructors.findFirst({
    where: eq(instructors.id, userId),
  });

  if (!user || user.role !== 'student') {
    return null;
  }

  return user;
});
