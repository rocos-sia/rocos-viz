import { expect, test, type Page } from '@playwright/test';

async function controller(page: Page, initial = 'STOPPED', owner: string | null = 'ui', releaseFails = false) {
  const calls: string[] = [];
  let state = initial;
  let enabled = initial === 'RCI' || initial === 'SERVOING';
  let token = 'ui-token';
  let emit = () => {};
  let loseEnableResponse = false;
  let loseReleaseResponse = false;
  const rci = () => ({ enabled, closing: state === 'STOPPING', control_active: state === 'SERVOING' || state === 'STOPPING', robot_state: state, last_control: null });
  const snapshot = () => ({ robot_state: state, rci: rci(), is_enabled: true, work_mode: 'position', timestamp: Date.now() / 1000,
    joint_states: Array.from({ length: 6 }, (_, id) => ({ id, name: `joint_${id + 1}`, position: 0, velocity: 0, torque: 0, status: 2 })),
    flange: { position: { x: 0, y: 0, z: 0.5 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
  await page.addInitScript(({ owner }) => {
    sessionStorage.setItem('rocos_client_id', 'ui');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: false, controlToken: owner === 'ui' ? 'ui-token' : null }, version: 0 }));
  }, { owner });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') calls.push(path);
    let data: unknown = {};
    let code = 0;
    if (path === '/api/robot/state') data = snapshot();
    else if (path.startsWith('/api/control/')) {
      if (path.endsWith('/acquire')) {
        if (owner) code = 3008;
        else { owner = 'ui'; token = 'new-token'; }
      }
      if (path.endsWith('/takeover')) { owner = 'ui'; token = 'new-token'; enabled = false; state = 'STOPPED'; emit(); }
      if (path.endsWith('/release')) { if (releaseFails) code = 500; else owner = null; }
      if (path.endsWith('/heartbeat') && route.request().headers()['x-rocos-control-token'] !== token) code = 3007;
      data = { token, has_owner: !!owner, owner_client_id: owner, owner_name: owner, owner_ip: '192.0.2.10', heartbeat_interval_seconds: 1 };
    } else if (path.startsWith('/api/robot/rci/')) {
      if (path.endsWith('/enable')) { enabled = true; state = 'RCI'; }
      if (path.endsWith('/disable')) { enabled = false; state = 'STOPPED'; }
      if (path.endsWith('/stop')) state = 'RCI';
      data = rci(); emit();
    } else if (path === '/api/script/list') data = { scripts: [] };
    if ((loseEnableResponse && path === '/api/robot/rci/enable') ||
        (loseReleaseResponse && path === '/api/control/release')) return route.abort('failed');
    await route.fulfill({ json: { success: code === 0, code, message: code ? 'test failure' : 'ok', data } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => {
    emit = () => socket.send(JSON.stringify(snapshot()));
    emit();
  });
  await page.goto('/#/dashboard');
  await expect(page.getByTestId('rci-status')).not.toContainText('状态未知');
  return { calls, loseResponses: () => { loseEnableResponse = true; loseReleaseResponse = true; }, fault: () => { state = 'ERROR_STATE'; enabled = false; emit(); },
    allowRelease: () => { releaseFails = false; }, owner: () => owner,
    move: () => { state = 'SERVOING'; emit(); } };
}

test('RCI enter releases HTTP control and keeps the telemetry connection', async ({ page }) => {
  const mock = await controller(page);
  await page.getByRole('button', { name: 'RCI 开关' }).click();
  await expect(page.getByRole('button', { name: 'RCI 开关' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => mock.owner()).toBe(null);
  await expect(page.getByTestId('rci-status')).toContainText('只读监控');
  await expect(page.locator('.teach-topbar')).toContainText('已连接');
  await expect(page.getByRole('button', { name: '已使能', exact: true })).toBeDisabled();
  mock.move();
  await expect(page.getByTestId('rci-status')).toContainText('外部程序控制中');
  await page.locator('.teach-controlbar').getByRole('button', { name: '停止', exact: true }).click();
  expect(mock.calls).toContain('/api/robot/rci/stop');
  await expect(page.getByTestId('rci-status')).toContainText('只读监控');
  await page.screenshot({ path: 'test-results/rci-ready.png' });
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts';
    const { useUIStore } = await import(path);
    useUIStore.setState({ themeMode: 'dark', language: 'en' });
  });
  await expect(page.getByTestId('rci-status')).toContainText('read-only monitoring');
  await page.screenshot({ path: 'test-results/rci-ready-dark-en.png' });
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts';
    const { useUIStore } = await import(path);
    useUIStore.setState({ themeMode: 'light', language: 'zh' });
  });
  await page.getByRole('button', { name: 'RCI 开关' }).click();
  await expect(page.getByTestId('rci-status')).toContainText('已关闭');
  await expect.poll(() => mock.owner()).toBe('ui');
  expect(mock.calls).not.toContain('/api/control/takeover');
});

test('RCI takeover requires confirmation and cancellation sends no takeover', async ({ page }) => {
  const mock = await controller(page, 'SERVOING', 'program');
  await page.getByRole('button', { name: 'RCI 开关' }).click();
  await expect(page.getByRole('dialog')).toContainText('program / 192.0.2.10');
  await page.getByRole('button', { name: /取\s*消/, exact: true }).click();
  expect(mock.calls).not.toContain('/api/control/takeover');
  await expect(page.getByTestId('rci-status')).toContainText('外部程序控制中');
  await page.getByRole('button', { name: 'RCI 开关' }).click();
  await page.screenshot({ path: 'test-results/rci-confirm.png' });
  await page.getByRole('button', { name: '抢占并退出 RCI', exact: true }).click();
  await expect(page.getByTestId('rci-status')).toContainText('已关闭');
  expect(mock.calls.filter(p => p === '/api/control/takeover')).toHaveLength(1);
});

test('RCI release failure stays read-only and retries without disconnecting', async ({ page }) => {
  const mock = await controller(page, 'STOPPED', 'ui', true);
  await page.getByRole('button', { name: 'RCI 开关' }).click();
  await expect(page.getByTestId('rci-status')).toContainText('释放待确认');
  await expect(page.getByRole('button', { name: '已使能', exact: true })).toBeDisabled();
  mock.allowRelease();
  await expect.poll(() => mock.owner()).toBe(null);
  await expect(page.getByTestId('rci-status')).toContainText('只读监控');
});

test('reconnect in RCI is read-only and ERROR turns the bar red', async ({ page }) => {
  const mock = await controller(page, 'RCI', null);
  expect(mock.calls).not.toContain('/api/control/acquire');
  mock.fault();
  await expect(page.getByTestId('rci-status')).toHaveClass(/is-error/);
  await expect(page.getByRole('button', { name: 'RCI 开关' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'RCI 开关' })).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: 'test-results/rci-error.png' });
});


test('lost enable and release responses reconcile against controller state', async ({ page }) => {
  const mock = await controller(page);
  mock.loseResponses();
  await page.getByRole('button', { name: 'RCI 开关' }).click();
  await expect.poll(() => mock.owner()).toBe(null);
  await expect(page.getByTestId('rci-status')).toContainText('只读监控');
  await expect(page.getByRole('button', { name: 'RCI 开关' })).toBeEnabled();
  expect(mock.calls.filter(p => p === '/api/robot/rci/enable')).toHaveLength(1);
  expect(mock.calls).not.toContain('/api/control/takeover');
});

test('restored HTTP credentials are released when reconnecting in RCI', async ({ page }) => {
  const mock = await controller(page, 'RCI', 'ui');
  await expect.poll(() => mock.owner()).toBe(null);
  expect(mock.calls).not.toContain('/api/control/acquire');
  await expect(page.getByTestId('rci-status')).toContainText('只读监控');
});

test('entering RCI is disabled outside STOPPED', async ({ page }) => {
  const mock = await controller(page, 'IDLE');
  await expect(page.getByRole('button', { name: 'RCI 开关' })).toBeDisabled();
  expect(mock.calls).not.toContain('/api/robot/rci/enable');
});
