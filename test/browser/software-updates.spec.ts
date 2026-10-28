import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version: pageVersion } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const root = 'https://github.com/rocos-sia/rocos-releases/releases';
const release = (version: string, component: 'app' | 'viz') => ({
  version, prerelease: version.includes('-'), source_repository: `rocos-sia/rocos-${component}`, tag: `v${version}`,
  published_at: '2026-10-28T10:00:00Z', release_url: `${root}/tag/${component}-v${version}`, notes: 'Release notes / 更新说明\n<script>alert(1)</script>',
  compatibility: { api_version: '3.0.0', shm_abi_version: null },
  assets: [{ os: 'linux', arch: component === 'app' ? 'amd64' : 'all', format: 'deb', size_bytes: 1048576,
    sha256: 'a'.repeat(64), signature_url: null, url: `${root}/download/${component}-v${version}/rocos-${component}_${version}.deb` }],
});
const manifest = (channel: 'stable' | 'internal', app: string | null = null, viz: string | null = null) => ({
  schema_version: 1, channel, updated_at: '2026-10-28T10:00:00Z',
  components: { app: app ? release(app, 'app') : null, viz: viz ? release(viz, 'viz') : null, ecm: null },
});
const panel = (page: Page) => page.locator('.teach-updates');
const row = (page: Page, component: string) => panel(page).locator(`[data-component="${component}"]`);

async function setup(page: Page, options: { channel?: 'stable' | 'internal'; language?: 'zh' | 'en'; connected?: boolean } = {}) {
  await page.addInitScript((options) => {
    if (!localStorage.getItem('rocos-updates-v1')) localStorage.setItem('rocos-updates-v1', JSON.stringify({ channel: options.channel ?? 'stable' }));
    localStorage.setItem('rocos-ui', JSON.stringify({ state: { language: options.language ?? 'zh' }, version: 0 }));
    if (options.connected) sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true }, version: 0 }));
  }, options);
  await page.routeWebSocket('**/ws/robot_state', (ws) => ws.send(JSON.stringify({ joint_states: [], robot_state: 'IDLE' })));
  const writes: string[] = [];
  await page.route('**/api/**', (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/robot/urdf') return route.fulfill({ contentType: 'text/xml', body: '<robot name="Fixture"><link name="base"/></robot>' });
    if (path === '/api/robot/info') return route.fulfill({ json: { success: true, code: 0, data: { joint_infos: [], controller: {
      app_version: new URL(route.request().url()).hostname === 'controller-b.test' ? '9.0.0' : '3.2.0-rc.9',
      build_commit: null, api_version: '3.0.0', shm_abi_version: 2, capabilities: [],
    } } } });
    return route.fulfill({ json: { success: true, code: 0, data: { has_owner: true, owner_client_id: 'other', joint_states: [], items: [] } } });
  });
  return writes;
}

test('stable empty channel, manual retry, offline App and current page version are explicit', async ({ page }) => {
  await setup(page);
  let requests = 0;
  await page.route('https://raw.githubusercontent.com/**', (route) => { requests++; return route.fulfill({ json: manifest('stable') }); });
  await page.goto('/#/settings?tab=updates');
  await expect(row(page, 'viz')).toContainText('该渠道暂无发布');
  await expect(row(page, 'viz')).toContainText(pageVersion);
  await expect(row(page, 'app')).toContainText('未连接控制器');
  await expect(panel(page)).not.toContainText('已是该渠道最新版本');
  await expect(panel(page)).toContainText('ECM 暂未接入更新');
  expect(requests).toBe(1);
  await panel(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(panel(page)).not.toContainText('正在检查');
});

test('combined channel compares App RCs, prefers final Viz, provides safe downloads and persists ignored notifications', async ({ page }) => {
  const writes = await setup(page, { channel: 'internal', connected: true });
  const requests: Record<string, string>[] = [];
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    requests.push(route.request().headers());
    return route.fulfill({ json: route.request().url().endsWith('/stable.json') ? manifest('stable', null, '4.0.0') : manifest('internal', '3.2.0-rc.10', '4.0.0-rc.9') });
  });
  await page.goto('/#/settings?tab=updates');
  await expect(row(page, 'app')).toContainText('有新版本');
  await expect(row(page, 'viz')).toContainText('4.0.0');
  await expect(row(page, 'viz')).not.toContainText('4.0.0-rc.9');
  await expect(page.locator('.teach-update-dot')).toBeVisible();
  await expect(page.locator('.ant-notification-notice')).toHaveCount(1);
  await expect(row(page, 'app').getByRole('link', { name: '下载安装包 App amd64 deb' })).toHaveAttribute('href', `${root}/download/app-v3.2.0-rc.10/rocos-app_3.2.0-rc.10.deb`);
  await expect(panel(page)).toContainText('安装包下载到浏览器所在电脑');
  await row(page, 'viz').locator('summary').click();
  await expect(row(page, 'viz')).toContainText('<script>alert(1)</script>');
  await expect(row(page, 'viz').locator('script')).toHaveCount(0);
  for (const component of ['viz', 'app']) await row(page, component).getByRole('button', { name: '忽略此版本' }).click();
  await expect(page.locator('.teach-update-dot')).toHaveCount(0);
  await page.reload();
  await expect(row(page, 'app')).toContainText('已忽略此版本提醒');
  await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
  expect(requests).toHaveLength(2);
  for (const headers of requests) { expect(headers['x-rocos-control-token']).toBeUndefined(); expect(headers['x-rocos-client-id']).toBeUndefined(); }
  // Existing connection startup requests control; updating never sends robot writes.
  expect(writes.every((url) => new URL(url).pathname === '/api/control/acquire')).toBe(true);
});

test('failed refresh retains the previous timestamp, avoids latest claims, and recovers on manual retry', async ({ page }) => {
  await setup(page, { channel: 'internal' });
  let response = 'ok';
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    if (response === 'html') return route.fulfill({ contentType: 'text/html', body: '<html>404</html>' });
    if (response === 'offline') return route.abort();
    return route.fulfill({ json: route.request().url().endsWith('/stable.json') ? manifest('stable') : manifest('internal', null, pageVersion) });
  });
  await page.goto('/#/settings?tab=updates');
  await expect(row(page, 'viz')).toContainText('已是该渠道最新版本');
  const previous = await panel(page).locator('.teach-update-time').innerText();
  for (const failure of ['html', 'offline']) {
    response = failure;
    await panel(page).getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(panel(page)).toContainText('检查更新失败');
    await expect(panel(page)).toContainText('历史查询结果');
    await expect(panel(page)).not.toContainText('已是该渠道最新版本');
    await expect(panel(page).locator('.teach-update-time')).toHaveText(previous);
  }
  await page.reload();
  await expect(panel(page)).toContainText('检查更新失败');
  await expect(panel(page)).not.toContainText('已是该渠道最新版本');
  await panel(page).getByText('正式版', { exact: true }).click();
  await panel(page).getByText('包含内测版', { exact: true }).click();
  await expect(panel(page)).toContainText('检查更新失败');
  await expect(panel(page)).not.toContainText('已是该渠道最新版本');
  response = 'ok';
  await panel(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(row(page, 'viz')).toContainText('已是该渠道最新版本');
  await expect(panel(page)).not.toContainText('检查更新失败');
});

test('switching channels cancels stale responses and retains the selected channel', async ({ page }) => {
  await setup(page);
  let first = true;
  let pending = false;
  let releaseFirst: (() => void) | undefined;
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const stable = route.request().url().endsWith('/stable.json');
    if (stable && first) {
      first = false; pending = true;
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      await route.fulfill({ json: manifest('stable', null, '99.0.0') }).catch(() => {});
    } else await route.fulfill({ json: stable ? manifest('stable') : manifest('internal', null, '4.0.0-rc.1') });
  });
  await page.goto('/#/settings?tab=updates');
  await expect.poll(() => pending).toBe(true);
  await panel(page).getByText('包含内测版', { exact: true }).click();
  await expect(row(page, 'viz')).toContainText('4.0.0-rc.1');
  releaseFirst!();
  await expect(row(page, 'viz')).not.toContainText('99.0.0');
  await page.reload();
  await expect(row(page, 'viz')).toContainText('4.0.0-rc.1');
  // Returning to a cancelled first check retries immediately, without a one-hour delay.
  await panel(page).getByText('正式版', { exact: true }).click();
  await expect(row(page, 'viz')).toContainText('该渠道暂无发布');
  await expect(row(page, 'viz')).not.toContainText('4.0.0-rc.1');
});

test('daily cache expiry rechecks and switching controllers immediately invalidates the App comparison', async ({ page }) => {
  await setup(page, { channel: 'internal', connected: true });
  let count = 0;
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    count++;
    return route.fulfill({ json: route.request().url().endsWith('/stable.json') ? manifest('stable') : manifest('internal', '3.2.0-rc.10') });
  });
  await page.goto('/#/settings?tab=updates');
  await expect(row(page, 'app')).toContainText('有新版本');
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnection('controller-b.test', '8080');
    useConnectionStore.getState().setConnected(true);
  });
  await expect(row(page, 'app')).toContainText('9.0.0');
  await expect(row(page, 'app')).toContainText('当前版本高于该渠道');
  await expect(row(page, 'app')).not.toContainText('3.2.0-rc.9');
  await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('rocos-updates-v1')!);
    saved.cache.internal.checkedAt = Date.now() - 25 * 60 * 60 * 1000;
    saved.attempts.internal = saved.cache.internal.checkedAt;
    localStorage.setItem('rocos-updates-v1', JSON.stringify(saved));
  });
  await page.reload();
  await expect.poll(() => count).toBe(4);
  await expect(panel(page)).not.toContainText('正在检查');
});

test('ignoring one version still notifies for a later version and opens the update tab', async ({ page }) => {
  await setup(page, { channel: 'internal' });
  let available = '4.0.0-rc.1';
  await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ json: route.request().url().endsWith('/stable.json') ? manifest('stable') : manifest('internal', null, available) }));
  await page.goto('/#/dashboard');
  await page.getByRole('button', { name: '查看更新', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\?tab=updates$/);
  await expect(row(page, 'viz')).toContainText(available);
  await row(page, 'viz').getByRole('button', { name: '忽略此版本' }).click();
  await expect(page.locator('.teach-update-dot')).toHaveCount(0);
  available = '4.0.0-rc.2';
  await panel(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(row(page, 'viz')).toContainText(available);
  await expect(page.locator('.teach-update-dot')).toBeVisible();
  await expect(page.locator('.ant-notification-notice')).toContainText(available);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('rocos-updates-v1')!).notified.length);
  await panel(page).getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(panel(page)).not.toContainText('正在检查');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rocos-updates-v1')!).notified.length)).toBe(before);
});

test('request timeout is recoverable and does not report up to date', async ({ page }) => {
  await setup(page);
  await page.route('https://raw.githubusercontent.com/**', () => {});
  await page.goto('/#/settings?tab=updates');
  await expect(panel(page)).toContainText('查询超时', { timeout: 12_000 });
  await expect(panel(page).getByRole('button', { name: '检查更新', exact: true })).toBeEnabled();
  await expect(panel(page)).not.toContainText('已是该渠道最新版本');
});

for (const language of ['zh', 'en'] as const) {
  test(`update screen fits narrow layouts and preserves the dashboard (${language})`, async ({ page }) => {
    await setup(page, { channel: 'internal', language });
    await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ json: route.request().url().endsWith('/stable.json') ? manifest('stable') : manifest('internal', '3.3.0-rc.1', '3.2.0-rc.1') }));
    await page.goto('/#/settings?tab=updates');
    await expect(row(page, 'viz')).toContainText(language === 'zh' ? '有新版本' : 'Update available');
    await page.screenshot({ path: `test-results/software-updates-${language}.png` });
    await page.setViewportSize({ width: 1024, height: 900 });
    expect(await panel(page).evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/software-updates-narrow-${language}.png` });
    await page.locator('.teach-sidebar a[href="#/dashboard"]').click();
    await expect(page.locator('.teach-dashboard > .teach-card')).toHaveCount(7);
  });
}
