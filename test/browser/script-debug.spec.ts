import { expect, test, type Page } from '@playwright/test';
import type { ScriptStatus } from '../../src/core/types';

const source = '-- Debug test\nlocal a = 1\na = a + 1\nprint(a)\n';

async function setup(page: Page, language = 'zh', library: {
  scripts?: string[];
  failures?: number;
  gate?: Promise<void>;
  controlToken?: string | null;
} = {}) {
  const controlToken = library.controlToken === undefined ? 'debug-token' : library.controlToken;
  await page.addInitScript(({ source, language, controlToken }) => {
    sessionStorage.setItem('rocos_client_id', 'debug-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true,
      isRobotEnabled: true, controlToken, autoLoadModel: false }, version: 0 }));
    localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, themeMode: language === 'zh' ? 'light' : 'dark' }, version: 0 }));
    localStorage.setItem('rocos-teach-drafts', JSON.stringify({ state: { source }, version: 0 }));
  }, { source, language, controlToken });
  const status: ScriptStatus = { state: 'EMPTY', filename: '', line: 0, script_id: '', error: '', motion_active: false, breakpoints: [] };
  const writes: { path: string; body: unknown }[] = [];
  let statusReads = 0;
  let listReads = 0;
  const telemetry = { joint_states: [], robot_state: 'IDLE', is_enabled: true };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown = { has_owner: true, owner_client_id: 'debug-client', heartbeat_interval_seconds: 1 };
    if (path === '/api/robot/state') data = telemetry;
    if (path === '/api/script/list') {
      listReads++;
      expect(request.headers()['x-rocos-control-token']).toBeUndefined();
      expect(request.headers()['x-rocos-client-id']).toBeUndefined();
      data = { scripts: library.scripts ?? ['program.lua', 'other.lua'] };
      await library.gate;
      if (listReads <= (library.failures ?? 0)) return route.fulfill({ status: 503, json: { success: false, code: 1004, message: 'Starting script service' } });
    }
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
  return { status, writes, reads: () => statusReads, listReads: () => listReads };
}

test('first visit loads controller scripts without control rights and preserves the local draft', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const scripts = ['hello_world.lua', 'examples/机器人状态.lua'];
  const fixture = await setup(page, 'zh', { scripts, gate, controlToken: null });
  await expect(page.locator('.teach-file-list')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('main').getByRole('status')).toContainText('正在加载控制器脚本');
  release();
  await expect(page.locator('.teach-file-list button')).toHaveText(scripts);
  await expect(page.locator('.cm-content')).toContainText('-- Debug test');
  await page.route('**/api/script/download?*', route => {
    expect(new URL(route.request().url()).searchParams.get('filename')).toBe(scripts[1]);
    return route.fulfill({ contentType: 'text/plain', body: '-- Controller source\nprint("hello")\n' });
  });
  await page.getByRole('button', { name: scripts[1], exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('-- Controller source');
  expect(fixture.writes).toEqual([]);
});

test('a failed initial list request retries automatically; successful empty lists are explicit', async ({ page }) => {
  const library = { failures: 100, scripts: [] };
  const fixture = await setup(page, 'en', library);
  await expect(page.locator('.teach-programming')).toContainText('Starting script service');
  const failedReads = fixture.listReads();
  library.failures = 0;
  await expect(page.locator('.teach-file-list')).toContainText('No Lua scripts on the controller');
  expect(fixture.listReads()).toBeGreaterThan(failedReads);
  await expect(page.locator('.teach-programming .ant-alert')).toHaveCount(0);
  const reads = fixture.listReads();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(fixture.listReads).toBeGreaterThan(reads);
  expect(fixture.writes).toEqual([]);
});

test('switching controller discards an in-flight script list and reconnect reloads it', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const library: { scripts: string[]; gate?: Promise<void> } = { scripts: ['old-controller.lua'], gate };
  const fixture = await setup(page, 'zh', library);
  await expect.poll(fixture.listReads).toBeGreaterThan(0);
  library.scripts = ['new-controller.lua'];
  library.gate = undefined;
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnection('192.0.2.10', '8080');
  });
  await expect(page.locator('.teach-file-list button')).toHaveText(['new-controller.lua']);
  release();
  await expect(page.getByRole('button', { name: 'old-controller.lua', exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnected(false);
  });
  await expect(page.getByRole('button', { name: 'new-controller.lua', exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnected(true);
  });
  await expect(page.locator('.teach-file-list button')).toHaveText(['new-controller.lua']);
  expect(fixture.writes).toEqual([]);
});

for (const language of ['zh', 'en']) {
  test(`breakpoints, initial step, stepping and execution line (${language})`, async ({ page }) => {
    const fixture = await setup(page, language);
    const editor = page.locator('.teach-code-editor');
    const step = page.getByRole('button', { name: language === 'zh' ? '单步执行' : 'Single step', exact: true });
    await expect(step).toBeEnabled();
    const debug = page.getByRole('group', { name: language === 'zh' ? '程序调试' : 'Script debugging' });
    await expect(debug.getByRole('button')).toHaveCount(4);
    for (const button of await debug.getByRole('button').all()) {
      await expect(button).toHaveText('');
      await button.locator('..').hover();
      await expect(page.getByRole('tooltip')).toHaveText(await button.getAttribute('aria-label') ?? '');
    }
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
    await expect(editor.locator('.cm-executionLine')).toHaveCSS('background-color', language === 'zh' ? 'rgb(253, 230, 138)' : 'rgb(107, 83, 27)');
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
