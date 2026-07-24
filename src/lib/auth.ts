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

function getAdminPids(): string[] {
  return (process.env.ADMIN_PIDS || '')
    .split(',')
    .map((pid) => pid.trim())
    .filter(Boolean);
}

export function isAdministrator(user: { role: string | null | undefined } | null | undefined): boolean {
  return user?.role === 'administrator';
}

export function isAdminPid(pid: string): boolean {
  return getAdminPids().includes(pid);
}

/** Admin identity, resolved from the `admin_pid` cookie against ADMIN_PIDS.
 * Auto-creates/reuses an `instructors` row keyed by the PID so existing
 * pages/queries that join on instructors.id (owner name/email, etc.) keep
 * working unchanged. */
export const getInstructor = cache(async () => {
  const cookieStore = await cookies();
  const pid = cookieStore.get('admin_pid')?.value;

  if (!pid || !isAdminPid(pid)) {
    return null;
  }

  let user = await db.query.instructors.findFirst({
    where: eq(instructors.id, pid),
  });

  if (!user) {
    [user] = await db
      .insert(instructors)
      .values({
        id: pid,
        email: `${pid}@pid.local`,
        firstName: pid,
        role: 'administrator',
        isVerified: true,
        createdAt: new Date(),
      })
      .returning();
  }

  if (!isInstructorRole(user.role)) {
    return null;
  }

  return user;
});

/** Participant identity, resolved from the `participant_pid` cookie. Unlike
 * instructors, participants have no shared identity row — the PID itself
 * (studentSessions.participantToken) is the identity, scoped per assignment. */
export const getParticipantPid = cache(async () => {
  const cookieStore = await cookies();
  return cookieStore.get('participant_pid')?.value || null;
});
