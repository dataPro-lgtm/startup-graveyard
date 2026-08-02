import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const webBaseUrl = process.env.E2E_WEB_BASE_URL;
const apiBaseUrl = process.env.E2E_API_BASE_URL;

async function activateSubscription(email: string, subscription: 'pro' | 'team') {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for browser release tests');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      `
      UPDATE users
      SET subscription = $2,
          billing_status = 'active',
          billing_interval = 'month'
      WHERE email = $1
      RETURNING id
      `,
      [email, subscription],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await pool.end();
  }
}

async function registerAdmin(email: string, password: string) {
  if (!apiBaseUrl) throw new Error('E2E_API_BASE_URL is required for browser release tests');
  if (!databaseUrl) throw new Error('DATABASE_URL is required for browser release tests');
  const response = await fetch(`${apiBaseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'Release Admin' }),
  });
  expect(response.status).toBe(201);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const promoted = await pool.query(
      `UPDATE users
       SET role = 'admin', admin_role = 'owner'
       WHERE email = $1`,
      [email],
    );
    expect(promoted.rowCount).toBe(1);
  } finally {
    await pool.end();
  }
}

async function registerUser(page: Page, baseUrl: string, displayName: string, email: string) {
  await page.goto(`${baseUrl}/auth/register`);
  await page.getByRole('textbox', { name: '昵称（可选）' }).fill(displayName);
  await page.getByRole('textbox', { name: '邮箱' }).fill(email);
  await page.getByRole('textbox', { name: '密码（至少 8 位）' }).fill('ReleaseGate123!');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('link', { name: displayName })).toBeVisible();
}

async function submitServerAction(page: Page, pathname: string, click: () => Promise<void>) {
  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return candidate.request().method() === 'POST' && url.pathname === pathname;
  });
  await Promise.all([response, click()]);
}

test('public research flow discovers and opens a grounded case', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'Learn from startup failure like it is a dataset, not a story archive.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation').getByText(/Page 1 of \d+, \d+ cases total/),
  ).toBeVisible();

  await page.getByRole('textbox', { name: 'Query' }).fill('Quibi');
  await page.getByRole('button', { name: 'Apply Filters' }).click();

  await expect(page).toHaveURL(/q=Quibi/);
  const caseLink = page.getByRole('link', { name: 'Quibi', exact: true });
  await expect(caseLink).toBeVisible();
  await caseLink.click();

  await expect(page).toHaveURL(/\/cases\/s\/quibi/);
  await expect(page.getByRole('heading', { name: 'Quibi', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '证据来源' })).toBeVisible();
  await expect(page.getByText('The New York Times', { exact: true })).toBeVisible();
});

test('pro research flow saves, exports, and publishes a public brief', async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `browser-release-${unique}@example.test`;
  const displayName = `Release Researcher ${unique.slice(-6)}`;
  const viewName = `Quibi release brief ${unique.slice(-6)}`;

  await page.goto('/auth/register');
  await page.getByRole('textbox', { name: '昵称（可选）' }).fill(displayName);
  await page.getByRole('textbox', { name: '邮箱' }).fill(email);
  await page.getByRole('textbox', { name: '密码（至少 8 位）' }).fill('ReleaseGate123!');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('link', { name: displayName })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      access: window.localStorage.getItem('sg_access'),
      refresh: window.localStorage.getItem('sg_refresh'),
    })),
  ).toEqual({ access: null, refresh: null });
  const authCookies = (await page.context().cookies()).filter((cookie) =>
    ['sg_access', 'sg_refresh'].includes(cookie.name),
  );
  expect(authCookies).toHaveLength(2);
  expect(authCookies.every((cookie) => cookie.httpOnly)).toBe(true);

  await activateSubscription(email, 'pro');
  await page.reload();
  await expect(page.getByText('Saved 0/30')).toBeVisible();

  await page.getByRole('textbox', { name: 'Query' }).fill('Quibi');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect(page).toHaveURL(/q=Quibi/);

  await page.getByRole('textbox', { name: 'View Name' }).fill(viewName);
  await page.getByRole('button', { name: 'Save Current View' }).click();
  await expect(page.getByText('Current research view saved.')).toBeVisible();

  await page.goto('/auth/account#saved-views');
  await expect(page.getByRole('heading', { name: '登录设备与会话' })).toBeVisible();
  await expect(page.getByText('当前设备', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '退出当前设备' })).toBeVisible();
  await expect(page.getByRole('link', { name: viewName, exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  await expect(page.getByText(/Exported Markdown brief:/)).toBeVisible();

  await page.getByRole('button', { name: 'Publish Brief Share' }).click();
  await expect(page.getByText(/Public brief page (created|refreshed)/)).toBeVisible();

  const previewLink = page.getByRole('link', { name: 'Preview Brief' });
  await expect(previewLink).toBeVisible();
  const sharePath = await previewLink.getAttribute('href');
  expect(sharePath).toMatch(/^\/research\/brief\/[a-z0-9]+$/);
  expect(webBaseUrl).toBeTruthy();
  await expect(page.getByText(`${webBaseUrl}${sharePath}`)).toBeVisible();

  await page.goto(sharePath!);
  await expect(page.getByRole('heading', { name: viewName, exact: true })).toBeVisible();
  await expect(page.getByText('Quibi', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: '下载 PDF Brief' })).toBeVisible();
});

test('mobile public navigation stays within the viewport and hides operations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ops Dashboard' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Review Queue' })).toHaveCount(0);

  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
});

test('copilot degradation keeps citations relevant without an AI provider', async ({ page }) => {
  await page.goto('/copilot');
  await page.getByRole('textbox').fill('Quibi 和流媒体创业失败的主要共同模式是什么？请给出引用。');
  await page.getByRole('button', { name: '开始研究' }).click();

  await expect(page.getByText(/当前未启用可用的 AI 服务/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quibi', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quirky', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'QuickRide', exact: true })).toHaveCount(0);
});

test('team owner and member complete invitation and shared research flow', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  expect(webBaseUrl).toBeTruthy();
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerEmail = `team-owner-${unique}@example.test`;
  const memberEmail = `team-member-${unique}@example.test`;
  const workspaceName = `Release Team ${unique.slice(-6)}`;
  const viewName = `Shared Quibi view ${unique.slice(-6)}`;

  await registerUser(page, webBaseUrl!, 'Release Owner', ownerEmail);
  await activateSubscription(ownerEmail, 'team');
  await page.reload();
  await page.goto('/auth/account');
  await expect(page.getByText('Saved 0/120')).toBeVisible();

  await page.getByRole('textbox', { name: '工作区名称' }).fill(workspaceName);
  await page.getByRole('button', { name: '创建 Team Workspace' }).click();
  await expect(
    page.getByText('团队工作区已创建。现在可以邀请成员并共享案例 / Saved Views。'),
  ).toBeVisible();
  await page.locator('input[placeholder="teammate@example.com"]').fill(memberEmail);
  await page.getByRole('button', { name: '发送邀请' }).click();
  await expect(page.getByText(memberEmail, { exact: true })).toBeVisible();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  try {
    await registerUser(memberPage, webBaseUrl!, 'Release Member', memberEmail);
    await memberPage.goto(`${webBaseUrl}/auth/account`);
    await memberPage.getByRole('button', { name: '接受邀请' }).click();
    await expect(memberPage.getByText('当前套餐：Team。', { exact: false })).toBeVisible();
    await expect(
      memberPage.getByText('当前有效权限来自团队工作区', { exact: false }),
    ).toBeVisible();

    await memberPage.goto(`${webBaseUrl}/cases/s/quibi`);
    await memberPage.getByRole('button', { name: '加入 Watchlist' }).click();
    await expect(memberPage.getByText('已加入 Watchlist')).toBeVisible();
    await memberPage.getByRole('button', { name: `共享到 ${workspaceName}` }).click();
    await expect(memberPage.getByText('已共享到团队工作区。')).toBeVisible();

    await memberPage.goto(`${webBaseUrl}/`);
    await memberPage.getByRole('textbox', { name: 'Query' }).fill('Quibi');
    await memberPage.getByRole('button', { name: 'Apply Filters' }).click();
    await memberPage.getByRole('textbox', { name: 'View Name' }).fill(viewName);
    await memberPage.getByRole('button', { name: 'Save Current View' }).click();
    await expect(memberPage.getByText('Current research view saved.')).toBeVisible();

    await memberPage.goto(`${webBaseUrl}/auth/account#saved-views`);
    await expect(memberPage.getByText(viewName, { exact: true })).toBeVisible();
    await memberPage.getByRole('button', { name: 'Share to Team' }).click();
    await expect(memberPage.getByText('Saved view shared to the Team Workspace.')).toBeVisible();
  } finally {
    await memberContext.close();
  }

  await page.reload();
  await expect(page.getByText(memberEmail, { exact: true })).toBeVisible();
  await expect(page.getByText(viewName, { exact: true })).toBeVisible();
  await expect(page.getByText('Quibi', { exact: true }).first()).toBeVisible();
});

test('admin boundary blocks anonymous access and publishes a review-ready case', async ({
  page,
}) => {
  test.setTimeout(60_000);
  expect(webBaseUrl).toBeTruthy();
  const anonymous = await fetch(`${webBaseUrl}/admin/dashboard`, { redirect: 'manual' });
  expect(anonymous.status).toBeGreaterThanOrEqual(300);
  expect(anonymous.status).toBeLessThan(400);
  expect(anonymous.headers.get('location')).toContain('/admin/login?reason=session_required');

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `release-admin-${unique}@example.test`;
  const adminPassword = 'ReleaseAdmin123!';
  await registerAdmin(adminEmail, adminPassword);
  const slug = `release-gate-${unique
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(-20)}`;
  const companyName = `Release Gate ${unique.slice(-6)}`;

  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: '管理员邮箱' }).fill(adminEmail);
  await page.getByLabel('密码').fill(adminPassword);
  await page.getByRole('button', { name: '进入运营控制台' }).click();
  await expect(page).toHaveURL(/\/admin\/reviews/);
  await expect(page.getByRole('heading', { name: '审核队列' })).toBeVisible();
  await page.getByRole('textbox', { name: 'slug（唯一，小写）' }).fill(slug);
  await page.getByRole('textbox', { name: '公司名' }).fill(companyName);
  await page
    .getByRole('textbox', { name: '摘要' })
    .fill('A production release case used to verify evidence-gated publishing.');
  await page.getByRole('combobox', { name: '行业 key' }).fill('saas');
  await page
    .getByRole('combobox', { name: '主失败原因 key（可选）' })
    .selectOption('product_market_fit');
  await submitServerAction(page, '/admin/reviews', () =>
    page.getByRole('button', { name: '创建并进入审核' }).click(),
  );
  await page.goto('/admin/reviews');

  let reviewCard = page.locator('article').filter({ hasText: companyName });
  await submitServerAction(page, '/admin/reviews', () =>
    reviewCard.getByRole('button', { name: '通过', exact: true }).click(),
  );
  await page.goto('/admin/reviews');
  reviewCard = page.locator('article').filter({ hasText: companyName });
  await expect(reviewCard.getByRole('button', { name: '通过', exact: true })).toBeVisible();

  reviewCard = page.locator('article').filter({ hasText: companyName });
  const casePath = await reviewCard
    .locator('a[href^="/admin/cases/"]')
    .first()
    .getAttribute('href');
  expect(casePath).toMatch(/^\/admin\/cases\/[0-9a-f-]+$/);
  await page.goto(casePath!);

  const evidenceSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: '证据来源' }),
  });
  await evidenceSection.getByRole('textbox', { name: 'sourceType' }).fill('news');
  await evidenceSection
    .getByRole('textbox', { name: 'title', exact: true })
    .fill('Release evidence');
  await evidenceSection
    .getByRole('textbox', { name: 'url', exact: true })
    .fill('https://example.com/release-evidence');
  await submitServerAction(page, casePath!, () =>
    evidenceSection.getByRole('button', { name: '提交证据' }).click(),
  );
  await page.goto(casePath!);

  const factorSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: '失败因子' }),
  });
  await factorSection.getByRole('combobox', { name: 'level1Key' }).selectOption('market');
  await factorSection.getByRole('combobox', { name: 'level2Key' }).fill('product_market_fit');
  await factorSection.getByRole('spinbutton', { name: 'weight（0–100，默认 1）' }).fill('90');
  await submitServerAction(page, casePath!, () =>
    factorSection.getByRole('button', { name: '提交因子' }).click(),
  );

  await page.goto('/admin/reviews');
  reviewCard = page.locator('article').filter({ hasText: companyName });
  await expect(
    reviewCard.getByText('发布检查：证据 1 条，失败因子 1 个，可发布。', { exact: true }).first(),
  ).toBeVisible();
  await submitServerAction(page, '/admin/reviews', () =>
    reviewCard.getByRole('button', { name: '通过', exact: true }).click(),
  );

  await page.goto(`/cases/s/${slug}`);
  await expect(page.getByRole('heading', { name: companyName })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Release evidence' }).first()).toBeVisible();

  const logout = await page.request.post('/admin/logout', { maxRedirects: 0 });
  expect(logout.status()).toBe(303);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/login\?reason=session_required/);
});
