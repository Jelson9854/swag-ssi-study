import { NextResponse } from 'next/server';
import { getInstructor } from '@/lib/auth';

export async function GET() {
  const instructor = await getInstructor();

  if (!instructor) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: instructor });
}
