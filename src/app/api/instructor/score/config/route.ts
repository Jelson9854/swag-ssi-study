import { NextResponse } from 'next/server';
import { getInstructor, isAdministrator } from '@/lib/auth';
import { getScoreConfig, saveScoreConfig } from '@/lib/score/config-store';

export const dynamic = 'force-dynamic';

// GET: the current SCORE taxonomy + few-shot config (global singleton).
export async function GET() {
  const instructor = await getInstructor();
  if (!instructor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const config = await getScoreConfig();
  return NextResponse.json({ config });
}

// PUT: replace the config (used by the taxonomy editor and JSON import).
export async function PUT(req: Request) {
  const instructor = await getInstructor();
  if (!instructor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // The taxonomy is a global singleton shared by every assignment/instructor, so
  // only administrators may change it (prevents cross-instructor tampering and
  // limits who can put free text into the classifier prompt).
  if (!isAdministrator(instructor)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only administrators can edit the SCORE taxonomy.' },
      { status: 403 }
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const incoming = (body as { config?: unknown })?.config ?? body;
  try {
    const config = await saveScoreConfig(incoming);
    return NextResponse.json({ config });
  } catch {
    return NextResponse.json(
      { error: 'invalid_config', message: 'The taxonomy needs at least one subtype with a code.' },
      { status: 400 }
    );
  }
}
