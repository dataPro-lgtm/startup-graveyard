import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const DEFAULT_DOCKER_IMAGE = 'pgvector/pgvector:pg16';

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

export async function runCommand(command, args, options = {}) {
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

async function startDockerPostgres(dockerImage) {
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
    await stopDockerContainer(containerName);
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

async function stopDockerContainer(containerName) {
  await runCommand('docker', ['rm', '-f', containerName]).catch(() => {});
}

export async function applySqlDirectory(databaseUrl, directory) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const files = (await readdir(directory))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const sql = await readFile(path.join(directory, file), 'utf8');
      await pool.query(sql);
    }
    return files;
  } finally {
    await pool.end();
  }
}

export async function provisionIsolatedPostgres({
  baseConnectionString,
  databasePrefix = 'sg_it',
  dockerImage = DEFAULT_DOCKER_IMAGE,
} = {}) {
  let containerName = null;
  let adminUrl = baseConnectionString?.trim() ? getAdminUrl(baseConnectionString.trim()) : null;

  try {
    if (!adminUrl) {
      const docker = await startDockerPostgres(dockerImage);
      containerName = docker.containerName;
      adminUrl = docker.adminUrl;
    }

    await waitForDatabase(adminUrl);
    const databaseName = `${databasePrefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await createDatabase(adminUrl, databaseName);
    const databaseUrl = replaceDatabaseName(adminUrl, databaseName);

    return {
      adminUrl,
      containerName,
      databaseName,
      databaseUrl,
      async cleanup() {
        await dropDatabase(adminUrl, databaseName).catch((error) => {
          console.warn(
            `[pg-harness] drop database failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
        if (containerName) {
          await stopDockerContainer(containerName);
        }
      },
    };
  } catch (error) {
    if (containerName) {
      await stopDockerContainer(containerName);
    }
    throw error;
  }
}
