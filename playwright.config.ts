import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 18180);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3200);
const workerHealthPort = Number(process.env.E2E_WORKER_HEALTH_PORT ?? 18181);
const schedulerHealthPort = Number(process.env.E2E_SCHEDULER_HEALTH_PORT ?? 18182);
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;
const webBaseUrl = process.env.E2E_WEB_BASE_URL ?? `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/playwright',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: `RUNTIME_HEALTH_PORT=${workerHealthPort} pnpm --filter @sg/api start:worker`,
      url: `http://127.0.0.1:${workerHealthPort}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `RUNTIME_HEALTH_PORT=${schedulerHealthPort} pnpm --filter @sg/api start:scheduler`,
      url: `http://127.0.0.1:${schedulerHealthPort}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @sg/api start',
      url: `${apiBaseUrl}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `HOSTNAME=127.0.0.1 PORT=${webPort} node apps/web/.next/standalone/apps/web/server.js`,
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
