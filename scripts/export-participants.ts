import { db } from '../src/db/db';
import { assignments, studentSessions } from '../src/db/schema';
import { eq, asc } from 'drizzle-orm';
import { writeFileSync } from 'fs';

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function main() {
  const assignmentId = process.argv[2];
  const outPath = process.argv[3];

  if (!assignmentId) {
    console.error('Usage: tsx scripts/export-participants.ts <assignmentId> [outputPath]');
    console.error('  outputPath omitted → writes CSV to stdout');
    process.exit(1);
  }

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
  });

  if (!assignment) {
    console.error(`Assignment not found: ${assignmentId}`);
    process.exit(1);
  }

  const sessions = await db
    .select({
      participantToken: studentSessions.participantToken,
      studentFirstName: studentSessions.studentFirstName,
      studentLastName: studentSessions.studentLastName,
      studentEmail: studentSessions.studentEmail,
      startedAt: studentSessions.startedAt,
      lastSavedAt: studentSessions.lastSavedAt,
    })
    .from(studentSessions)
    .where(eq(studentSessions.assignmentId, assignmentId))
    .orderBy(asc(studentSessions.participantToken));

  const header = 'participant_token,first_name,last_name,email,started_at,last_saved_at';
  const rows = sessions.map((s) =>
    [
      s.participantToken,
      s.studentFirstName,
      s.studentLastName,
      s.studentEmail,
      s.startedAt.toISOString(),
      s.lastSavedAt ? s.lastSavedAt.toISOString() : '',
    ]
      .map(csvCell)
      .join(',')
  );
  const csv = [header, ...rows].join('\r\n') + '\r\n';

  if (outPath) {
    writeFileSync(outPath, csv, 'utf-8');
    console.error(`Wrote ${sessions.length} participants → ${outPath}`);
    console.error(`Assignment: ${assignment.title}`);
  } else {
    process.stdout.write(csv);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
