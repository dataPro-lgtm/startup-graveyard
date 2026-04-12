import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(apiDir, '..', '..');
const migrationsDir = path.join(repoDir, 'db', 'migrations');
const dockerImage = 'pgvector/pgvector:pg16';

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function replaceDatabaseName(connectionString, databaseName) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function getAdminUrl(baseConnectionString) {
  return replaceDatabaseName(baseConnectionString, 'postgres');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${stderr || stdout}`));
    });
  });
}

async function startDockerPostgres() {
  const containerName = `sg-pg-test-${randomUUID().slice(0, 8)}`;
  await runCommand('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    containerName,
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-e',
    'POSTGRES_DB=postgres',
    '-p',
    '127.0.0.1::5432',
    dockerImage,
  ]);

  const portResult = await runCommand('docker', ['port', containerName, '5432/tcp']);
  const mapping = portResult.stdout.trim().split(':').pop();
  if (!mapping) {
    throw new Error(`Unable to resolve mapped port for ${containerName}`);
  }

  return {
    adminUrl: `postgresql://postgres:postgres@127.0.0.1:${mapping}/postgres`,
    containerName,
  };
}

async function waitForDatabase(adminUrl) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const pool = new Pool({ connectionString: adminUrl });
    try {
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch {
      await pool.end().catch(() => {});
      if (attempt === 30) {
        throw new Error(`Database did not become ready: ${adminUrl}`);
      }
      await sleep(1000);
    }
  }
}

async function createDatabase(adminUrl, databaseName) {
  const pool = new Pool({ connectionString: adminUrl });
  try {
    await pool.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(adminUrl, databaseName) {
  const pool = new Pool({ connectionString: adminUrl });
  try {
    await pool.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );
    await pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function applyMigrations(testDatabaseUrl) {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

async function runVitest(testDatabaseUrl) {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'vitest', 'run', 'src/postgresIntegration.pg.test.ts'],
      {
        cwd: apiDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          TEST_DATABASE_URL: testDatabaseUrl,
          DATABASE_URL: testDatabaseUrl,
        },
      },
    );
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function stopDockerContainer(containerName) {
  await runCommand('docker', ['rm', '-f', containerName]).catch(() => {});
}

async function main() {
  let containerName = null;
  let adminUrl = process.env.TEST_DATABASE_URL?.trim()
    ? getAdminUrl(process.env.TEST_DATABASE_URL.trim())
    : null;

  if (!adminUrl) {
    console.log('[pg-test] starting temporary Docker Postgres...');
    const docker = await startDockerPostgres();
    containerName = docker.containerName;
    adminUrl = docker.adminUrl;
  } else {
    console.log('[pg-test] using TEST_DATABASE_URL cluster as base');
  }

  const databaseName = `sg_it_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const testDatabaseUrl = replaceDatabaseName(adminUrl, databaseName);

  try {
    console.log(`[pg-test] waiting for database: ${adminUrl}`);
    await waitForDatabase(adminUrl);

    console.log(`[pg-test] creating isolated database: ${databaseName}`);
    await createDatabase(adminUrl, databaseName);

    console.log('[pg-test] applying migrations...');
    await applyMigrations(testDatabaseUrl);

    console.log('[pg-test] running vitest...');
    const exitCode = await runVitest(testDatabaseUrl);
    process.exitCode = exitCode;
  } finally {
    console.log(`[pg-test] dropping isolated database: ${databaseName}`);
    await dropDatabase(adminUrl, databaseName).catch((error) => {
      console.warn(`[pg-test] drop database failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (containerName) {
      console.log(`[pg-test] stopping temporary container: ${containerName}`);
      await stopDockerContainer(containerName);
    }
  }
}

main().catch((error) => {
  console.error(`[pg-test] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
