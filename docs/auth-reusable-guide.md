# 재사용 가능한 인증(Auth) 패턴 가이드

이 문서는 SWAG 프로젝트의 인증 구현 중 **다른 프로젝트에 그대로 가져가기 좋은 패턴**만 추린 것입니다.
(보안상 개선이 필요한 평문 세션 쿠키, rate limiting 부재 등은 의도적으로 제외했습니다.)

기술 스택 기준: **Next.js App Router + Drizzle ORM(Postgres) + bcryptjs + Zod**

---

## 핵심 설계 아이디어

> **회원가입은 매직 링크로 이메일을 검증하고, 로그인은 비밀번호로 한다.**

- **Signup**: 비밀번호를 바로 받지 않음 → 이메일로 인증 링크 발송 → 링크 클릭 후 비밀번호 설정
  - 이메일 소유권을 검증하므로, 별도의 "이메일 확인" 단계가 필요 없음
- **Login**: 검증 완료된 이메일 + 비밀번호로 직접 로그인
- **Password Reset**: 회원가입과 동일한 `/verify` 흐름을 재사용 (토큰 type만 다름)

---

## 1. 데이터 모델

```ts
// 모든 유저를 한 테이블에 저장 (역할은 role 컬럼으로 구분)
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  password: text('password'),              // bcrypt 해시. 미검증이면 null
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: text('role').notNull().default('user'),
  isVerified: boolean('is_verified').default(false).notNull(),
  createdAt: timestamp('created_at').notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

// 이메일 인증 + 비밀번호 재설정 토큰 (한 테이블에서 type으로 구분)
export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  token: text('token').unique().notNull(),
  type: text('type').notNull().default('verification'), // 'verification' | 'password_reset'
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').notNull(),
}, (table) => ({
  tokenIdx: index('auth_tokens_token_idx').on(table.token),
  emailIdx: index('auth_tokens_email_idx').on(table.email),
}));
```

**핵심 상태 규칙**
- `password = null` && `isVerified = false` → "가입 신청은 했으나 이메일 미검증" 상태
- `isVerified = true` && `password` 존재 → 정상 로그인 가능 유저

---

## 2. 비밀번호 유틸 (bcrypt + 강도 검증)

```ts
import bcrypt from 'bcryptjs'; // Vercel/Node 호환을 위해 bcrypt 대신 bcryptjs

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10); // saltRounds = 10
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8)     return { valid: false, error: 'Password must be at least 8 characters long' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must contain at least one uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, error: 'Password must contain at least one lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must contain at least one number' };
  return { valid: true };
}
```

> **적용 팁**: 클라이언트와 서버가 **같은 규칙**을 쓰도록 `validatePassword`를 양쪽에서 공유하세요.
> (원본은 클라가 "8자 이상"만 막아 UX 불일치가 있었습니다.)

---

## 3. 회원가입 흐름 (3단계)

### 1단계 — 인증 링크 요청 `POST /api/auth/send-magic-link`

```ts
// 1. Zod로 입력 검증
const parsed = signupSchema.parse(body);   // { email, firstName?, lastName?, passcode? }
const email = parsed.email.trim().toLowerCase();

// 2. (선택) passcode로 권한 역할 부여
let role = 'user';
if (passcode) {
  if (passcode === process.env.ADMIN_PASSCODE)      role = 'administrator';
  else if (passcode === process.env.STAFF_PASSCODE) role = 'staff';
  else return error(403, 'Invalid passcode');
}

// 3. 토큰 생성 + 저장 (만료 기본 24시간)
const token = crypto.randomBytes(32).toString('hex');
await db.insert(authTokens).values({
  id: crypto.randomUUID(), email, token, type: 'verification',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  used: false, createdAt: new Date(),
});

// 4. 유저 존재 여부 처리
//    - 이미 검증된 유저 → "로그인하세요" 에러
//    - 없으면 → 미검증 유저(password=null, isVerified=false) 생성

// 5. 매직 링크 발송: `${BASE_URL}/verify?token=${token}`
//    개발 모드면 콘솔에도 링크 출력 (이메일 설정 없이 테스트 가능)
```

### 2단계 — 링크 클릭 시 토큰 검증 `POST /api/auth/verify-token`

```ts
// 토큰이 미사용 && 미만료인지 확인. 여기서는 토큰을 소비하지 않음(읽기 전용)
const authToken = await db.query.authTokens.findFirst({
  where: and(
    eq(authTokens.token, token),
    eq(authTokens.used, false),
    gt(authTokens.expiresAt, new Date()),
  ),
});
if (!authToken) return error(401, 'Link expired or invalid');

// 화면에 보여줄 email, role, mode('setup' | 'reset') 반환
```

### 3단계 — 비밀번호 설정 `POST /api/auth/set-password`

```ts
// 1. 비밀번호 강도 검증
const v = validatePassword(password);
if (!v.valid) return error(400, v.error);

// 2. 토큰 재검증 후 used=true로 소비(consume)
await db.update(authTokens).set({ used: true }).where(eq(authTokens.id, authToken.id));

// 3. 해싱 후 유저 활성화
const hashed = await hashPassword(password);
await db.update(users)
  .set({ password: hashed, isVerified: true, lastLoginAt: new Date() })
  .where(eq(users.id, user.id));

// 4. 세션 쿠키 설정 → 가입 직후 자동 로그인 상태로 진입
```

---

## 4. 로그인 `POST /api/auth/login`

```ts
const { email, password } = loginSchema.parse(body);

const user = await db.query.users.findFirst({ where: eq(users.email, email) });
if (!user) return error(401, 'Invalid email or password');

// 미검증 계정 차단
if (!user.isVerified || !user.password)
  return error(401, 'Account not verified. Please check your email.');

// 비밀번호 검증 (실패 시 이메일/비번 구분 없이 동일 메시지 → enumeration 방지)
if (!(await verifyPassword(password, user.password)))
  return error(401, 'Invalid email or password');

await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
setSessionCookie(user.id);
```

---

## 5. 비밀번호 재설정 `POST /api/auth/request-password-reset`

```ts
const SUCCESS_MESSAGE = 'If an account exists for that email, we sent a password reset link.';

const user = await db.query.users.findFirst({ where: eq(users.email, email) });

// ★ 계정 존재 여부와 무관하게 항상 같은 성공 메시지 반환 (email enumeration 방지)
if (!user || !user.isVerified || !user.password)
  return ok({ message: SUCCESS_MESSAGE });

// 기존 미사용 reset 토큰 무효화 후 새 토큰 발급 (만료 15분 — 가입용보다 짧게)
await db.update(authTokens).set({ used: true }).where(and(
  eq(authTokens.email, email),
  eq(authTokens.type, 'password_reset'),
  eq(authTokens.used, false),
));
// ... 새 token 발급 후 `/verify?token=...` 링크 발송 (set-password 흐름 재사용)

return ok({ message: SUCCESS_MESSAGE });
```

---

## 6. UI 패턴 (단일 폼에서 모드 토글)

하나의 클라이언트 컴포넌트가 `mode` state로 화면을 전환합니다.

```tsx
const [mode, setMode] = useState<'login' | 'signup'>('login');
const [showResetForm, setShowResetForm] = useState(false);
const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
```

- 상단 **Login / Sign Up 토글 버튼**
- **Login 폼**: 이메일 + 비밀번호 + "Forgot password?" 링크
- **Signup 폼**: 이름 + 이메일 + (선택) 권한 passcode
- **이메일 발송 후**: 폼을 숨기고 "Check your email" 안내 박스로 전환 (`emailSentTo`로 분기)
- **비밀번호 설정 페이지**(`/verify`): `setup`/`reset` 모드를 한 컴포넌트가 공유

서버 컴포넌트(login 페이지)에서 **이미 세션 쿠키가 있으면 역할별 대시보드로 리다이렉트**:

```tsx
const userId = (await cookies()).get('user_session')?.value;
if (userId) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role === 'administrator' || user?.role === 'staff') redirect('/admin');
  if (user?.role === 'user') redirect('/dashboard');
}
```

---

## 7. (선택) 이메일 도메인 제한

특정 도메인(@company.com 등)만 가입을 허용하고 싶을 때:

```ts
// 환경변수로 on/off 및 허용 도메인 목록 관리
export function isEmailDomainAllowed(email: string): boolean {
  if (!isEmailDomainRestrictionEnabled()) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return Boolean(domain && getAllowedEmailDomains().includes(domain));
}
```

- `ALLOWED_EMAIL_DOMAINS=company.com,company.org`
- `EMAIL_DOMAIN_RESTRICTION_ENABLED=false` 로 비활성화 가능

---

## 적용 체크리스트

- [ ] `users` / `auth_tokens` 테이블 생성 (위 1번)
- [ ] bcryptjs 설치, `validatePassword` 를 **클라/서버 공유** 모듈로 배치
- [ ] 5개 API 라우트: `send-magic-link`, `verify-token`, `set-password`, `login`, `request-password-reset`
- [ ] 토큰은 `crypto.randomBytes(32).toString('hex')`, 가입 24h / 재설정 15m 만료
- [ ] 로그인·재설정 실패 메시지는 **enumeration 방지**용으로 모호하게 통일
- [ ] 개발 모드에서 매직 링크를 콘솔에 출력 (이메일 미설정 환경 테스트용)

> ⚠️ **세션은 별도 검토 필요**: 원본은 `user_session` 쿠키에 평문 user ID를 저장합니다.
> 운영 환경에서는 서명된 세션(JWT, iron-session) 또는 서버측 세션 테이블 사용을 권장합니다.
