import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('user_session');

  // Get the proper base URL from headers or environment
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get('x-forwarded-proto') ?? 'https';
  const forwardedHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');

  let baseUrl: string;
  if (forwardedHost) {
    baseUrl = `${forwardedProto}://${forwardedHost}`;
  } else {
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030';
  }

  return NextResponse.redirect(new URL('/login', baseUrl));
}
