import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { isAdminPid } from '@/lib/auth';

const pidSchema = z.object({
  pid: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pid } = pidSchema.parse(body);

    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    };

    if (isAdminPid(pid)) {
      cookieStore.set('admin_pid', pid, cookieOptions);
      return NextResponse.json({ role: 'admin' });
    }

    cookieStore.set('participant_pid', pid, cookieOptions);
    return NextResponse.json({ role: 'participant' });
  } catch {
    return NextResponse.json({ error: 'Invalid PID' }, { status: 400 });
  }
}
