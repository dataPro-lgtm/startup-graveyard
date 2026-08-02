import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'db', 'migrations');
const migrationPattern = /^(\d{4})_[a-z0-9_]+\.sql$/;
const historicalDuplicateOrdinals = new Map([
  [
    '0033',
    new Set([
      '0033_platform_snapshot_scheduler_job.sql',
      '0033_team_workspace_recovery_playbook_reruns.sql',
    ]),
  ],
]);

const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
const errors = [];
const filesByOrdinal = new Map();

for (const file of files) {
  const match = migrationPattern.exec(file);
  if (!match) {
    errors.push(`${file}: expected NNNN_snake_case.sql`);
    continue;
  }

  const ordinal = match[1];
  const ordinalFiles = filesByOrdinal.get(ordinal) ?? [];
  ordinalFiles.push(file);
  filesByOrdinal.set(ordinal, ordinalFiles);
}

for (const [ordinal, ordinalFiles] of filesByOrdinal) {
  if (ordinalFiles.length === 1) continue;

  const allowed = historicalDuplicateOrdinals.get(ordinal);
  const matchesHistoricalException =
    allowed?.size === ordinalFiles.length && ordinalFiles.every((file) => allowed.has(file));
  if (!matchesHistoricalException) {
    errors.push(`${ordinal}: duplicate migration ordinal used by ${ordinalFiles.join(', ')}`);
  }
}

if (errors.length > 0) {
  console.error(`Migration validation failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${files.length} migrations (${historicalDuplicateOrdinals.size} exception).`,
  );
}
