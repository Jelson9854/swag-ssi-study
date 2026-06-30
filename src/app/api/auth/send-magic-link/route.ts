import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { authTokens, instructors } from '@/db/schema';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import type { InstructorRole } from '@/lib/auth';
import { getAllowedEmailDomainsLabel, isEmailDomainAllowed } from '@/lib/email-domain';

const signupSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  passcode: z.string().optional(),
  shareToken: z.string().optional(),
});

const configuredVerificationTtlMinutes = Number.parseInt(process.env.VERIFICATION_TOKEN_TTL_MINUTES || '', 10);
const VERIFICATION_TOKEN_TTL_MINUTES =
  Number.isFinite(configuredVerificationTtlMinutes) && configuredVerificationTtlMinutes > 0
    ? configuredVerificationTtlMinutes
    : 24 * 60;
const VERIFICATION_TOKEN_EXPIRES_LABEL = process.env.VERIFICATION_TOKEN_EXPIRES_LABEL || '24 hours';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = signupSchema.parse(body);
    const email = parsed.email.trim().toLowerCase();
    const { firstName, lastName, passcode, shareToken } = parsed;

    const trimmedPasscode = passcode?.trim();
    const instructorPasscode = process.env.INSTRUCTOR_PASSCODE;
    const administratorPasscode = process.env.ADMINISTRATOR_PASSCODE || process.env.ADMIN_PASSCODE;
    let role: InstructorRole | 'student' = 'student';

    if (trimmedPasscode) {
      if (!isEmailDomainAllowed(email)) {
        return NextResponse.json(
          { error: `Only ${getAllowedEmailDomainsLabel()} email addresses are allowed` },
          { status: 403 }
        );
      }

      if (administratorPasscode && trimmedPasscode === administratorPasscode) {
        role = 'administrator';
      } else if (instructorPasscode && trimmedPasscode === instructorPasscode) {
        role = 'instructor';
      } else {
        return NextResponse.json(
          { error: 'Invalid instructor or administrator passcode' },
          { status: 403 }
        );
      }
    }

    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);

    // Save token to database
    await db.insert(authTokens).values({
      id: tokenId,
      email,
      token,
      expiresAt,
      used: false,
      createdAt: new Date(),
    });

    // Check if user exists
    const existingUser = await db.query.instructors.findFirst({
      where: (instructors, { eq }) => eq(instructors.email, email),
    });

    // If user exists and is already verified, they should use login instead
    if (existingUser?.isVerified) {
      return NextResponse.json(
        { error: 'Account already exists. Please use login instead.' },
        { status: 400 }
      );
    }

    if (existingUser && existingUser.role !== role) {
      return NextResponse.json(
        { error: 'Account already exists with a different role.' },
        { status: 400 }
      );
    }

    // Create new user if doesn't exist
    if (!existingUser) {
      await db.insert(instructors).values({
        id: crypto.randomUUID(),
        email,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        role,
        isVerified: false,
        createdAt: new Date(),
      });
    } else if ((firstName || lastName) && (!existingUser.firstName || !existingUser.lastName)) {
      await db
        .update(instructors)
        .set({
          firstName: firstName ?? existingUser.firstName,
          lastName: lastName ?? existingUser.lastName,
        })
        .where(eq(instructors.id, existingUser.id));
    }

    const resolvedFirstName = (firstName?.trim() || existingUser?.firstName || '').trim();
    const resolvedLastName = (lastName?.trim() || existingUser?.lastName || '').trim();
    const recipientName = [resolvedFirstName, resolvedLastName].filter(Boolean).join(' ') || email.split('@')[0];

    // Build magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030';
    const magicLink = `${baseUrl}/verify?token=${token}${shareToken ? `&shareToken=${encodeURIComponent(shareToken)}` : ''}`;

    const sendVerificationEmail = async () => {
      if (role === 'student') {
        const { sendStudentVerificationEmail } = await import('@/lib/email');
        await sendStudentVerificationEmail({
          to: email,
          magicLink,
          studentName: recipientName,
          expiresIn: VERIFICATION_TOKEN_EXPIRES_LABEL,
        });
        return;
      }

      const { sendMagicLink } = await import('@/lib/email');
      await sendMagicLink({
        to: email,
        magicLink,
        expiresIn: VERIFICATION_TOKEN_EXPIRES_LABEL,
      });
    };

    // In development, log the link; in production, send email
    if (process.env.NODE_ENV === 'development') {
      console.log('\n========================================');
      console.log('EMAIL VERIFICATION LINK (Development Mode)');
      console.log('========================================');
      console.log(`Email: ${email}`);
      console.log(`Link: ${magicLink}`);
      console.log('========================================\n');
      
      // 개발 모드에서도 실제 이메일 발송 테스트 (GMAIL_USER가 설정되어 있으면)
      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        console.log('📧 Gmail SMTP로 실제 이메일 발송 중...');
        try {
          await sendVerificationEmail();
          console.log('✅ 이메일 발송 성공!');
        } catch (error) {
          console.error('❌ 이메일 발송 실패:', error);
        }
      }
    } else {
      // Send verification email via Gmail
      await sendVerificationEmail();
    }

    return NextResponse.json({
      success: true,
      message: 'Verification link sent to your email',
      // Only include link in development for testing
      ...(process.env.NODE_ENV === 'development' && { link: magicLink }),
    });
  } catch (error) {
    console.error('Magic link error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send login link' },
      { status: 500 }
    );
  }
}
