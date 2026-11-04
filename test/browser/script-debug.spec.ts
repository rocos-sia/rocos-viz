import { expect, test, type Page } from '@playwright/test';
import type { ScriptStatus } from '../../src/core/types';

const source = '-- Debug test\nlocal a = 1\na = a + 1\nprint(a)\n';

async function setup(page: Page, language = 'zh') {
  await page.addInitScript(({ source, language }) => {
    sessionStorage.setItem('rocos_client_id', 'debug-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true,
      isRobotEnabled: true, controlToken: 'debug-token', autoLoadModel: false }, version: 0 }));
    localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, themeMode: language === 'zh' ? 'light' : 'dark' }, version: 0 }));
    localStorage.setItem('rocos-teach-drafts', JSON.stringify({ state: { source }, version: 0 }));
  }, { source, language });
  const status: ScriptStatus = { state: 'EMPTY', filename: '', line: 0, script_id: '', error: '', motion_active: false, breakpoints: [] };
  const writes: { path: string; body: unknown }[] = [];
  let statusReads = 0;
  const telemetry = { joint_states: [], robot_state: 'IDLE', is_enabled: true };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown = { has_owner: true, owner_client_id: 'debug-client', heartbeat_interval_seconds: 1 };
    if (path === '/api/robot/state') data = telemetry;
    if (path === '/api/script/list') data = { scripts: ['program.lua', 'other.lua'] };
    if (path === '/api/script/download') return route.fulfill({ contentType: 'text/plain', body: source });
    if (path === '/api/script/status') { statusReads++; data = status; }
    if (path.startsWith('/api/script/') && request.method() === 'POST') {
      expect(request.headers()['x-rocos-control-token']).toBe('debug-token');
      expect(request.headers()['x-rocos-client-id']).toBe('debug-client');
      const body = request.postData() ? request.postDataJSON() : undefined;
      writes.push({ path, body });
      if (path.endsWith('/upload')) Object.assign(status, { state: 'LOADED', filename: body.filename, line: 0, script_id: 'script_1' });
      if (path.endsWith('/step')) Object.assign(status, { state: 'PAUSED', line: status.line ? status.line + 1 : 2 });
      if (path.endsWith('/run') || path.endsWith('/resume')) status.state = 'RUNNING';
      if (path.endsWith('/pause')) status.state = 'PAUSED';
      if (path.endsWith('/stop')) status.state = 'STOPPED';
      if (path.endsWith('/breakpoint/add')) status.breakpoints.push(body);
      if (path.endsWith('/breakpoint/remove')) status.breakpoints = status.breakpoints.filter(p => p.filename !== body.filename || p.line !== body.line);
      data = status;
    }
    await route.fulfill({ json: { success: true, code: 0, message: 'ok', data } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify(telemetry)));
  await page.goto('/#/programming');
  await expect.poll(() => statusReads).toBeGreaterThan(0);
  return { status, writes, reads: () => statusReads };
}

for (const language of ['zh', 'en']) {
  test(`breakpoints, initial step, stepping and execution line (${language})`, async ({ page }) => {
    const fixture = await setup(page, language);
    const editor = page.locator('.teach-code-editor');
    const step = page.getByRole('button', { name: language === 'zh' ? '单步执行' : 'Single step', exact: true });
    await expect(step).toBeEnabled();
    // The first gutter element is the invisible sizing spacer.
    await editor.locator('.cm-breakpoints .cm-gutterElement').nth(2).click();
    await expect.poll(() => fixture.status.breakpoints).toEqual([{ filename: 'program.lua', line: 2 }]);
    await expect(editor.locator('.cm-breakpoints')).toContainText('●');
    await step.click();
    await page.locator('.ant-popconfirm').getByRole('button', { name: /^(OK|确\s*定)$/ }).click();
    await expect(editor.locator('.cm-executionLine')).toHaveText('local a = 1');
    await expect(editor.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
    await step.click();
    await expect(editor.locator('.cm-executionLine')).toHaveText('a = a + 1');
    expect(fixture.writes.filter(w => w.path.endsWith('/upload'))).toEqual([{ path: '/api/script/upload', body: { filename: 'program.lua', source } }]);
    expect(fixture.writes.filter(w => w.path.endsWith('/step'))).toHaveLength(2);
    await expect(page.locator('.teach-programming')).toContainText('PAUSED · program.lua:3');
    await page.screenshot({ path: `test-results/lua-debug-${language}.png` });
    await editor.locator('.cm-breakpoints .cm-gutterElement').nth(2).click();
    await expect.poll(() => fixture.status.breakpoints).toEqual([]);
    // Keyboard users can toggle a breakpoint at the cursor with F9.
    await editor.locator('.cm-content').click();
    await page.keyboard.press('F9');
    await expect.poll(() => fixture.status.breakpoints.length).toBe(1);
    await page.getByRole('button', { name: language === 'zh' ? '恢复运行' : 'Resume', exact: true }).click();
    await expect(step).toBeDisabled();
    await page.locator('.teach-programming').getByRole('button', { name: language === 'zh' ? /^暂\s*停$/ : 'Pause', exact: true }).click();
    await expect(step).toBeEnabled();
    await page.getByRole('button', { name: language === 'zh' ? '运动停止' : 'Motion stop', exact: true }).click();
    await expect(editor.locator('.cm-executionLine')).toHaveCount(0);
    await expect(editor.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
  });
}

test('controller breakpoints and locations follow polling, file identity and disconnect', async ({ page }) => {
  const fixture = await setup(page);
  const editor = page.locator('.teach-code-editor');
  Object.assign(fixture.status, { state: 'PAUSED', filename: 'program.lua', line: 4,
    breakpoints: [{ filename: 'program.lua', line: 2 }, { filename: 'other.lua', line: 3 }] });
  await expect(editor.locator('.cm-executionLine')).toHaveText('print(a)');
  await page.getByRole('button', { name: 'other.lua', exact: true }).click();
  await expect(editor.locator('.cm-executionLine')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '单步执行', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'program.lua', exact: true }).click();
  await expect(editor.locator('.cm-executionLine')).toHaveText('print(a)');
  fixture.status.state = 'COMPLETED';
  await expect(editor.locator('.cm-executionLine')).toHaveCount(0);
  fixture.status.state = 'PAUSED';
  await expect(editor.locator('.cm-executionLine')).toHaveCount(1);
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnected(false);
  });
  await expect(editor.locator('.cm-executionLine')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '单步执行', exact: true })).toBeDisabled();
  const reads = fixture.reads();
  await page.waitForTimeout(650);
  expect(fixture.reads()).toBe(reads);
  expect(fixture.writes).toEqual([]);
});

test('rejected breakpoint changes stay unmarked; loss of control prevents writes', async ({ page }) => {
  const fixture = await setup(page);
  await page.route('**/api/script/breakpoint/add', route => route.fulfill({ json: { success: false, code: 1001, message: 'Invalid breakpoint' } }));
  const gutterLine = page.locator('.cm-breakpoints .cm-gutterElement').nth(2);
  await gutterLine.click();
  await expect(page.locator('.ant-message')).toContainText('Invalid breakpoint');
  await expect(gutterLine).toBeEmpty();
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setControlToken(null);
  });
  await expect(page.getByRole('button', { name: '单步执行', exact: true })).toBeDisabled();
  await gutterLine.click();
  expect(fixture.writes).toEqual([]);
});
