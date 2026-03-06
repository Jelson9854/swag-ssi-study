import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@/db/db';
import { authTokens, instructors } from '@/db/schema';

const passwordResetSchema = z.object({
  email: z.string().email(),
  shareToken: z.string().min(1).optional(),
});

const SUCCESS_MESSAGE = 'If an account exists for that email, we sent a password reset link.';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, shareToken } = passwordResetSchema.parse(body);

    const user = await db.query.instructors.findFirst({
      where: eq(instructors.email, email),
    });

    if (!user || !user.isVerified || !user.password) {
      return NextResponse.json({
        success: true,
        message: SUCCESS_MESSAGE,
      });
    }

    await db
      .update(authTokens)
      .set({ used: true })
      .where(
        and(
          eq(authTokens.email, email),
          eq(authTokens.type, 'password_reset'),
          eq(authTokens.used, false)
        )
      );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(authTokens).values({
      id: crypto.randomUUID(),
      email,
      token,
      type: 'password_reset',
      expiresAt,
      used: false,
      createdAt: new Date(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030';
    const resetLink = `${baseUrl}/verify?token=${token}${user.role === 'student' && shareToken ? `&shareToken=${encodeURIComponent(shareToken)}` : ''}`;

    const sendResetEmail = async () => {
      const { sendPasswordResetEmail } = await import('@/lib/email');
      await sendPasswordResetEmail({
        to: email,
        resetLink,
      });
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('\n========================================');
      console.log('PASSWORD RESET LINK (Development Mode)');
      console.log('========================================');
      console.log(`Email: ${email}`);
      console.log(`Link: ${resetLink}`);
      console.log('========================================\n');

      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        console.log('📧 Gmail SMTP로 실제 이메일 발송 중...');
        try {
          await sendResetEmail();
          console.log('✅ 이메일 발송 성공!');
        } catch (error) {
          console.error('❌ 이메일 발송 실패:', error);
        }
      }
    } else {
      await sendResetEmail();
    }

    return NextResponse.json({
      success: true,
      message: SUCCESS_MESSAGE,
    });
  } catch (error) {
    console.error('Password reset request error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send password reset link' },
      { status: 500 }
    );
  }
}
