import { expect, test } from '@playwright/test';

test('offline routes and preview actions never issue controller requests', async ({ page }) => {
  const calls: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { if (/\/api\//.test(request.url())) calls.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/dashboard');
  await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible();
  await expect(page.locator('.teach-controlbar').getByRole('button', { name: '运动停止' })).toBeDisabled();
  await page.locator('.teach-sidebar').getByRole('link', { name: '手动示教' }).click();
  await page.getByRole('button', { name: 'J1 +', exact: true }).click();
  await expect(page.locator('.teach-state-column .teach-joint-row').first()).toContainText('1.00');
  await expect(page.getByRole('heading', { name: '运动控制', exact: true })).toBeVisible();
  await expect(page.locator('.teach-jog-card .teach-preview-joint')).toBeVisible();
  await expect(page.locator('.teach-jog-card .teach-preview-cartesian')).toBeVisible();
  await expect(page.locator('.teach-jog-card .teach-preview-null')).toBeVisible();
  await page.getByRole('button', { name: '记录当前点' }).click();
  await expect(page.getByRole('tab', { name: '示教点 (4)' })).toBeVisible();
  await page.getByRole('tab', { name: '精确控制' }).click();
  await expect(page.locator('.teach-control-fieldset button').first()).toBeDisabled();
  await page.locator('.teach-sidebar').getByRole('link', { name: '程序编程' }).click();
  await page.getByRole('tab', { name: /图形化编辑/ }).click();
  await expect(page.locator('.teach-generated')).toContainText('PREVIEW ONLY');
  await expect(page.getByRole('treeitem', { name: '循环', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程' }).click();
  expect((await download).suggestedFilename()).toBe('rocos-project.json');
  await page.locator('.teach-sidebar').getByRole('link', { name: '运行调试' }).click();
  await expect(page.getByRole('heading', { name: '运行调试', exact: true })).toBeVisible();
  await page.locator('.teach-sidebar').getByRole('link', { name: 'IO 与设备' }).click();
  await page.getByRole('switch', { name: 'outputs 0', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'outputs 0', exact: true })).toBeChecked();
  await page.locator('.teach-sidebar').getByRole('link', { name: '监控诊断' }).click();
  await expect(page.locator('.teach-chart-grid canvas').first()).toBeVisible();
  await page.locator('.teach-sidebar').getByRole('link', { name: '系统设置' }).click();
  await page.getByRole('button', { name: '界面语言' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [1920, 1024, 390]) {
  test(`responsive layouts preserve stop controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : width === 1920 ? 1200 : 844 });
    const headings: Record<string, string> = { dashboard: '总览', teaching: '手动示教', programming: '程序编程', execution: '运行调试', devices: 'IO 与设备', diagnostics: '监控诊断', settings: '系统设置' };
    for (const route of ['dashboard', 'teaching', 'programming', 'execution', 'devices', 'diagnostics', 'settings']) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('h1')).toHaveText(headings[route]);
      await expect(page.locator('.teach-controlbar').getByRole('button', { name: '运动停止' })).toBeInViewport();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, route).toBe(false);
      if (width === 1920 && route === 'dashboard') await page.screenshot({ path: 'test-results/dashboard-1920.png' });
    }
    await page.goto('/#/teaching');
    await expect(page.locator('h1')).toHaveText('手动示教');
    await expect(page.locator('.teach-scene-canvas canvas')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/teach-${width}.png` });
  });
}

test('controller session survives navigation; releasing and leaving jog sends stop', async ({ page }) => {
  const commands: string[] = [];
  let sockets = 0;
  await page.addInitScript(() => {
    sessionStorage.setItem('rocos_client_id', 'ui-test-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, isRobotEnabled: true, controlToken: 'ui-test-token' }, version: 0 }));
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/jog/')) commands.push(path);
    if (path === '/api/robot/urdf') return route.fulfill({ contentType: 'text/xml', body: '<robot name="test"><link name="base"/></robot>' });
    await route.fulfill({ json: { success: true, code: 0, message: 'ok', data: { has_owner: true, owner_client_id: 'ui-test-client', heartbeat_interval_seconds: 1, scripts: [] } } });
  });
  await page.routeWebSocket('**/ws/robot_state', (socket) => {
    sockets++;
    socket.send(JSON.stringify({ is_enabled: true, robot_state: 'IDLE', work_mode: 'position', joint_states: Array.from({ length: 7 }, (_, i) => ({ name: `joint_${i + 1}`, position: 0, velocity: 0, torque: 0, status: 2 })), flange: { position: { x: 0, y: 0, z: 0.5 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }));
  });
  await page.goto('/#/teaching');
  const jog = page.locator('.teach-jog-card .jog-btn').first();
  await expect(jog).toBeEnabled();
  const bounds = await jog.boundingBox();
  await page.mouse.move(bounds!.x + 15, bounds!.y + 15);
  await page.mouse.down();
  await expect.poll(() => commands.filter((p) => p.endsWith('/joint')).length).toBeGreaterThan(0);
  await page.mouse.up();
  await expect.poll(() => commands.filter((p) => p.endsWith('/stop')).length).toBeGreaterThan(0);
  const initialSockets = sockets; // React StrictMode mounts effects twice in development.
  commands.length = 0;
  await jog.focus();
  await page.keyboard.down('Space');
  await expect.poll(() => commands.filter((p) => p.endsWith('/joint')).length).toBeGreaterThan(0);
  await page.locator('.teach-sidebar').getByRole('link', { name: '程序编程' }).click();
  await page.keyboard.up('Space');
  await expect.poll(() => commands.filter((p) => p.endsWith('/stop')).length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: '程序库', exact: true })).toBeVisible();
  expect(sockets).toBe(initialSockets);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '上传并运行' })).toBeDisabled();
});
