import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySqlDirectory, provisionIsolatedPostgres } from './postgres_test_harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(apiDir, '..', '..');
const migrationsDir = path.join(repoDir, 'db', 'migrations');

async function runVitest(testDatabaseUrl) {
  return await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'vitest', 'run', 'src/postgresIntegration.pg.test.ts'], {
      cwd: apiDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL: testDatabaseUrl,
      },
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const usesExternalCluster = Boolean(process.env.TEST_DATABASE_URL?.trim());
  console.log(
    usesExternalCluster
      ? '[pg-test] using TEST_DATABASE_URL cluster as base'
      : '[pg-test] starting temporary Docker Postgres...',
  );

  const database = await provisionIsolatedPostgres({
    baseConnectionString: process.env.TEST_DATABASE_URL,
    databasePrefix: 'sg_it',
  });

  try {
    console.log(`[pg-test] creating isolated database: ${database.databaseName}`);
    console.log('[pg-test] applying migrations...');
    await applySqlDirectory(database.databaseUrl, migrationsDir);

    console.log('[pg-test] running vitest...');
    process.exitCode = await runVitest(database.databaseUrl);
  } finally {
    console.log(`[pg-test] dropping isolated database: ${database.databaseName}`);
    if (database.containerName) {
      console.log(`[pg-test] stopping temporary container: ${database.containerName}`);
    }
    await database.cleanup();
  }
}

main().catch((error) => {
  console.error(`[pg-test] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
