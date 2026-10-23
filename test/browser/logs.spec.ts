import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const warning = { id: 'test:1', timestamp: '2026-10-23T01:08:01.467+08:00', level: 'warn', module: 'Hardware', code: -2310, message: 'Joint 1 velocity exceeded the limit.' };

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(({ offline, native }) => {
    if (!offline) sessionStorage.setItem('rocos-connection', JSON.stringify({ state: {
      host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: false,
    }, version: 0 }));
    const sources: EventSource[] = [];
    Object.assign(window, { logSources: sources });
    class FakeEventSource extends EventTarget {
      url: string;
      closed = false;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        super(); this.url = url;
        sources.push(this as unknown as EventSource);
        setTimeout(() => this.onopen?.(), 0);
      }
      close() { this.closed = true; }
    }
    if (!native) Object.assign(window, { EventSource: FakeEventSource });
  }, { offline: testInfo.title.startsWith('offline'), native: testInfo.title.startsWith('native') });
  await page.route('**/api/**', (route) => {
    if (new URL(route.request().url()).pathname === '/api/logs') {
      return route.fulfill({ json: { success: true, data: { events: [warning], next_id: warning.id, has_more: false, gap: null } } });
    }
    return route.fulfill({ json: { success: true, data: { joint_states: [], has_owner: false } } });
  });
  await page.routeWebSocket('**/ws/robot_state', (socket) => socket.send(JSON.stringify({ joint_states: [] })));
});

test('shows backend errors, deduplicates SSE replay, reports gaps and closes on disconnect', async ({ page }) => {
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.locator('.teach-log-line')).toHaveCount(1);
  await expect(page.locator('.teach-log-line')).toContainText('Hardware');
  await expect(page.locator('.teach-log-line')).toContainText('-2310');
  const sourceUrl = await page.evaluate(() => (window as unknown as { logSources: { url: string }[] }).logSources.at(-1)?.url);
  expect(sourceUrl).toContain('/api/logs/stream?after=test%3A1');
  await page.evaluate((event) => {
    const source = (window as unknown as { logSources: EventTarget[] }).logSources.at(-1)!;
    source.dispatchEvent(new MessageEvent('log', { data: JSON.stringify(event) }));
    source.dispatchEvent(new MessageEvent('log', { data: JSON.stringify({ ...event, id: 'test:2', level: 'error', message: 'Hardware command failed.' }) }));
    source.dispatchEvent(new MessageEvent('gap', { data: JSON.stringify({ reason: 'buffer_overrun' }) }));
  }, warning);
  await expect(page.locator('.teach-log-line')).toHaveCount(2);
  await expect(page.getByText('Hardware command failed.', { exact: true })).toBeVisible();
  await expect(page.getByText('控制器重启或缓存溢出，部分日志记录不可用。')).toBeVisible();
  await page.screenshot({ path: 'test-results/logs-connected.png', fullPage: true });
  await page.getByRole('link', { name: '总览', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().reset();
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { logSources: { closed: boolean }[] }).logSources.every((source) => source.closed))).toBe(true);
});

test('shows a query failure and allows refresh retry', async ({ page }) => {
  await page.route('**/api/logs?*', (route) => route.fulfill({ status: 503, json: { success: false, message: 'Diagnostics service unavailable' } }));
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.getByText('Diagnostics service unavailable')).toBeVisible();
  await page.unroute('**/api/logs?*');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('.teach-log-line')).toHaveCount(1);
});

test('offline logs stay marked as demo and make no diagnostic requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/logs')) requests.push(request.url()); });
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.getByText('示例工作空间已初始化')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '日志', exact: true }).getByText('示例数据', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByRole('button', { name: '查看最新日志文件', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下载日志文件', exact: true })).toBeDisabled();
});

const logFile = '[2026-10-23 17:10:15.969] [Hardware] [info]   Parsed drive: id=0, joint=joint_1\n'
  + '[2026-10-23 17:10:16.001] [Robot] [warn]   Joint limit warning\n'
  + '[2026-10-23 17:10:17.002] [Robot] [error]   Stop rejected\n'
  + '<script>window.logFileInjected = true</script>\n';
const fileHeaders = {
  'Content-Disposition': 'attachment; filename="rocos-app_2026-10-23.log"',
  'X-Rocos-Log-Snapshot-Time': '2026-10-23T17:10:18.000+08:00',
};

test('previews INFO logs as safe text, colors only levels and downloads the original file', async ({ page }) => {
  await page.route('**/api/logs/file/latest', (route) => {
    expect(route.request().headers().accept).toBe('text/plain');
    expect(route.request().headers()['x-control-token']).toBeUndefined();
    return route.fulfill({ contentType: 'text/plain; charset=utf-8', headers: fileHeaders, body: logFile });
  });
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await page.getByRole('button', { name: '查看最新日志文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '控制器最新日志文件', exact: true });
  await expect(dialog.getByText('rocos-app_2026-10-23.log', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('2026-10-23T17:10:18.000+08:00');
  await expect(dialog.locator('pre')).toContainText(logFile.trim());
  await expect(dialog.locator('.teach-log-level-info')).toHaveText('[info]');
  await expect(dialog.locator('.teach-log-level-warn')).toHaveText('[warn]');
  await expect(dialog.locator('.teach-log-level-error')).toHaveText('[error]');
  expect(await dialog.locator('.teach-log-level-info').evaluate((node) => getComputedStyle(node).color))
    .not.toBe(await dialog.locator('pre').evaluate((node) => getComputedStyle(node).color));
  expect(await page.evaluate(() => 'logFileInjected' in window)).toBe(false);
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载日志文件', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('rocos-app_2026-10-23.log');
  expect(await readFile((await download.path())!, 'utf8')).toBe(logFile);
  await page.screenshot({ path: 'test-results/log-file-preview-zh.png', fullPage: true });
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts';
    const { useUIStore } = await import(path);
    useUIStore.getState().toggleLanguage();
  });
  await expect(page.getByRole('dialog', { name: 'Latest controller log file', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Download log file', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/log-file-preview-en.png', fullPage: true });
});

test('bounds large previews while downloading the complete file', async ({ page }) => {
  const largeFile = logFile + 'x'.repeat(300 * 1024) + '\nEND OF FULL FILE\n';
  await page.route('**/api/logs/file/latest', (route) => route.fulfill({ contentType: 'text/plain', headers: fileHeaders, body: largeFile }));
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await page.getByRole('button', { name: '查看最新日志文件', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('仅预览前 256 KiB，下载日志文件可查看完整内容。')).toBeVisible();
  await expect(dialog.locator('pre')).not.toContainText('END OF FULL FILE');
  expect((await dialog.locator('pre').textContent())!.length).toBeLessThanOrEqual(256 * 1024 + 1);
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载日志文件', exact: true }).click();
  const download = await downloadEvent;
  expect(await readFile((await download.path())!, 'utf8')).toBe(largeFile);
});

test('reports file errors and refreshes to a new snapshot including an empty file', async ({ page }) => {
  await page.route('**/api/logs/file/latest', (route) => route.fulfill({ status: 404, json: { success: false, message: 'Log file snapshot is unavailable' } }));
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await page.getByRole('button', { name: '查看最新日志文件', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Log file snapshot is unavailable')).toBeVisible();
  await page.route('**/api/logs/file/latest', (route) => route.fulfill({ contentType: 'text/plain', headers: fileHeaders, body: '' }));
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(dialog.getByText('日志文件为空')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.route('**/api/logs/file/latest', (route) => route.fulfill({ contentType: 'text/html', body: '<html>nginx</html>' }));
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Expected text/plain');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.route('**/api/logs/file/latest', (route) => route.fulfill({ status: 503, json: { success: false, message: 'Diagnostics service is stopping' } }));
  await page.getByRole('button', { name: '下载日志文件', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Diagnostics service is stopping');
});

test('disconnect closes a pending file preview and cancels the request', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/logs/file/latest', async (route) => {
    await pending;
    await route.fulfill({ contentType: 'text/plain', body: logFile }).catch(() => {});
  });
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  const requested = page.waitForRequest('**/api/logs/file/latest');
  await page.getByRole('button', { name: '查看最新日志文件', exact: true }).click();
  const request = await requested;
  const cancelled = page.waitForEvent('requestfailed', (failed) => failed === request);
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().reset();
  });
  release();
  await cancelled;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看最新日志文件', exact: true })).toBeDisabled();
});

test('native EventSource parses the App log event format', async ({ page }) => {
  await page.route('**/api/logs/stream?*', (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: ': connected\n\nid: test:2\nevent: log\ndata: ' + JSON.stringify({
      ...warning, id: 'test:2', level: 'error', module: 'Robot', message: 'Controller command failed.',
    }) + '\n\n',
  }));
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.getByText('Controller command failed.', { exact: true })).toBeVisible();
  await expect(page.locator('.teach-log-line')).toHaveCount(2);
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts';
    const { useUIStore } = await import(path);
    useUIStore.getState().toggleLanguage();
  });
  await expect(page.getByText('Controller warnings and errors · up to 200 recent records')).toBeVisible();
});

test('teaching and diagnostics share records and one subscription across navigation', async ({ page }) => {
  await page.goto('/#/teaching');
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.getByText(warning.message, { exact: true })).toBeVisible();
  const teachingRow = await page.locator('.teach-log-line').allTextContents();
  await page.evaluate(() => {
    const source = (window as unknown as { logSources: EventTarget[] }).logSources.at(-1)!;
    source.dispatchEvent(new MessageEvent('log', { data: JSON.stringify({
      id: 'test:2', timestamp: '2026-10-23T01:08:02.467+08:00', level: 'error',
      module: 'Robot', code: -2311, message: 'Shared controller error.',
    }) }));
  });
  await expect(page.locator('.teach-log-line')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/logs-teaching-shared.png', fullPage: true });
  await page.getByRole('link', { name: '监控诊断', exact: true }).click();
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.locator('.teach-log-line')).toHaveCount(2);
  expect((await page.locator('.teach-log-line').allTextContents())[0]).toBe(teachingRow[0]);
  await expect(page.getByText('Shared controller error.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { logSources: { closed: boolean }[] }).logSources.filter((s) => !s.closed).length)).toBe(1);
  await page.getByRole('link', { name: '总览', exact: true }).click();
  await page.evaluate(() => {
    const source = (window as unknown as { logSources: EventTarget[] }).logSources.at(-1)!;
    source.dispatchEvent(new MessageEvent('log', { data: JSON.stringify({
      id: 'test:3', timestamp: '2026-10-23T01:08:03.467+08:00', level: 'warn',
      module: 'Robot', code: null, message: 'Received away from log pages.',
    }) }));
  });
  await page.getByRole('link', { name: '手动示教', exact: true }).click();
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.getByText('Shared controller error.', { exact: true })).toBeVisible();
  await expect(page.getByText('Received away from log pages.', { exact: true })).toBeVisible();
  await expect(page.locator('.teach-log-line')).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { logSources: unknown[] }).logSources.length)).toBe(1);
});
