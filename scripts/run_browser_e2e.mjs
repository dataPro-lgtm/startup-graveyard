import { spawn } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applySqlDirectory,
  provisionIsolatedPostgres,
} from '../services/api/scripts/postgres_test_harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoDir, 'db', 'migrations');
const seedsDir = path.join(repoDir, 'db', 'seed');
const webBuildDir = path.join(repoDir, 'apps', 'web', '.next');

async function stageStandaloneWebAssets() {
  const target = path.join(webBuildDir, 'standalone', 'apps', 'web', '.next', 'static');
  await rm(target, { recursive: true, force: true });
  await cp(path.join(webBuildDir, 'static'), target, { recursive: true });
}

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate an E2E port'));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function run(command, args, env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoDir,
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} interrupted by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function runRequired(command, args, env) {
  const exitCode = await run(command, args, env);
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${exitCode}`);
  }
}

async function main() {
  const usesExternalCluster = Boolean(process.env.TEST_DATABASE_URL?.trim());
  console.log(
    usesExternalCluster
      ? '[browser-e2e] using TEST_DATABASE_URL cluster as base'
      : '[browser-e2e] starting temporary Docker Postgres...',
  );

  const database = await provisionIsolatedPostgres({
    baseConnectionString: process.env.TEST_DATABASE_URL,
    databasePrefix: 'sg_e2e',
  });

  try {
    console.log(`[browser-e2e] isolated database: ${database.databaseName}`);
    const migrations = await applySqlDirectory(database.databaseUrl, migrationsDir);
    const seeds = await applySqlDirectory(database.databaseUrl, seedsDir);
    console.log(
      `[browser-e2e] applied ${migrations.length} migrations and ${seeds.length} seed files`,
    );

    const [apiPort, webPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);
    const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    const webBaseUrl = `http://127.0.0.1:${webPort}`;
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: database.databaseUrl,
      PORT: String(apiPort),
      E2E_API_PORT: String(apiPort),
      E2E_WEB_PORT: String(webPort),
      E2E_API_BASE_URL: apiBaseUrl,
      E2E_WEB_BASE_URL: webBaseUrl,
      API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_SITE_URL: webBaseUrl,
      WEB_BASE_URL: webBaseUrl,
      ADMIN_API_KEY: 'browser-e2e-admin-key',
      JWT_SECRET: 'browser-e2e-secret-that-is-longer-than-forty-eight-bytes',
      AUTH_COOKIE_SECURE: 'false',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRO_PRICE_ID: '',
      STRIPE_TEAM_PRICE_ID: '',
    };

    console.log(`[browser-e2e] building API and Web for ${webBaseUrl}`);
    await runRequired('pnpm', ['--filter', '@sg/shared', 'build'], env);
    await runRequired('pnpm', ['--filter', '@sg/api', 'build'], env);
    await runRequired('pnpm', ['--filter', '@sg/web', 'build'], env);
    await stageStandaloneWebAssets();

    console.log('[browser-e2e] running Playwright release gate...');
    process.exitCode = await run('pnpm', ['exec', 'playwright', 'test'], env);
  } finally {
    console.log(`[browser-e2e] dropping isolated database: ${database.databaseName}`);
    if (database.containerName) {
      console.log(`[browser-e2e] stopping temporary container: ${database.containerName}`);
    }
    await database.cleanup();
  }
}

main().catch((error) => {
  console.error(`[browser-e2e] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
