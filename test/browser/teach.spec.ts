import { expect, test } from '@playwright/test';

test('offline routes and preview actions never issue controller requests', async ({ page }) => {
  const calls: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { if (/\/api\//.test(request.url())) calls.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/dashboard');
  await expect(page.getByRole('main', { name: '总览', exact: true })).toBeVisible();
  await expect(page.locator('.teach-controlbar').getByRole('button', { name: '停止', exact: true })).toBeDisabled();
  await expect(page.locator('.teach-topbar button')).toHaveCount(0);
  await expect(page.locator('.teach-controlbar').getByRole('button', { name: '未使能', exact: true })).toBeDisabled();
  await page.locator('.teach-sidebar').getByRole('link', { name: '手动示教' }).click();
  await page.getByRole('button', { name: 'J1 +', exact: true }).click();
  await expect(page.locator('.teach-state-column .teach-joint-row').first()).toContainText('1.00');
  await expect(page.getByRole('heading', { name: '运动控制', exact: true })).toBeVisible();
  await expect(page.locator('.teach-jog-card .teach-preview-joint')).toBeVisible();
  await page.getByRole('radiogroup', { name: '点动空间' }).getByText('笛卡尔点动', { exact: true }).click();
  await expect(page.locator('.teach-jog-card .teach-preview-cartesian')).toBeVisible();
  await expect(page.locator('.teach-tools-card')).toHaveCount(0);
  await expect(page.locator('.teach-topbar')).toContainText('TCP_01');
  await expect(page.locator('.teach-topbar')).toContainText('Workpiece_01');
  await page.getByRole('button', { name: 'X +', exact: true }).click();
  await expect(page.locator('.teach-state-column .teach-pose-grid > div').first()).toContainText('426.318');
  await expect(page.locator('.teach-preview-cartesian')).not.toContainText('426.318');
  await page.getByRole('button', { name: '记录当前点' }).click();
  await expect(page.getByRole('tab', { name: '示教点 (4)' })).toBeVisible();
  await page.getByRole('tab', { name: '精确控制' }).click();
  await expect(page.locator('.precise-actions button').first()).toBeDisabled();
  await page.locator('.teach-sidebar').getByRole('link', { name: '程序编程' }).click();
  await page.getByRole('tab', { name: /图形化编辑/ }).click();
  await expect(page.locator('.teach-generated')).toContainText('PREVIEW ONLY');
  await expect(page.getByRole('treeitem', { name: '循环', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程' }).click();
  expect((await download).suggestedFilename()).toBe('rocos-project.json');
  await page.locator('.teach-sidebar').getByRole('link', { name: '运行调试' }).click();
  await expect(page.getByRole('main', { name: '运行调试', exact: true })).toBeVisible();
  await page.locator('.teach-sidebar').getByRole('link', { name: 'IO 与设备' }).click();
  await page.getByRole('switch', { name: 'outputs 0', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'outputs 0', exact: true })).toBeChecked();
  await page.locator('.teach-sidebar').getByRole('link', { name: '监控诊断' }).click();
  await expect(page.locator('.teach-chart-grid canvas').first()).toBeVisible();
  await page.locator('.teach-sidebar').getByRole('link', { name: '系统设置' }).click();
  await page.locator('.teach-sidebar').getByRole('link', { name: '系统设置' }).click();
  await page.getByRole('radiogroup', { name: '界面语言' }).getByText('English', { exact: true }).click();
  await expect(page.getByRole('main', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Controller connection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  await expect(page.getByLabel('IP Address', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [1920, 1024, 390]) {
  test(`responsive layouts preserve stop controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : width === 1920 ? 1200 : 844 });
    const headings: Record<string, string> = { dashboard: '总览', teaching: '手动示教', programming: '程序编程', execution: '运行调试', devices: 'IO 与设备', diagnostics: '监控诊断', settings: '系统设置' };
    for (const route of ['dashboard', 'teaching', 'programming', 'execution', 'devices', 'diagnostics', 'settings']) {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole('main')).toHaveAccessibleName(headings[route]);
      const content = page.locator(`main > .teach-${route}`);
      await expect(content).toBeVisible();
      const unusedHeight = await content.evaluate((el) => {
        const main = el.parentElement!;
        const style = getComputedStyle(main);
        return main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - el.getBoundingClientRect().height;
      });
      expect(Math.abs(unusedHeight), `${route} fills the workspace`).toBeLessThanOrEqual(1);
      await expect(page.locator('.teach-controlbar').getByRole('button', { name: '停止', exact: true })).toBeInViewport();
      await expect(page.locator('.teach-controlbar').getByRole('button', { name: '未使能', exact: true })).toBeInViewport();
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        return document.documentElement.scrollWidth > window.innerWidth
          || document.documentElement.scrollHeight > window.innerHeight
          || main.scrollHeight > main.clientHeight + 1
          || main.scrollWidth > main.clientWidth + 1;
      });
      expect(overflow, route).toBe(false);
      if (width === 1920 && route === 'dashboard') await page.screenshot({ path: 'test-results/dashboard-1920.png' });
    }
    await page.goto('/#/teaching');
    await expect(page.getByRole('main')).toHaveAccessibleName('手动示教');
    await expect(page.locator('.teach-scene-canvas canvas')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/teach-${width}.png` });
  });
}

test('controller session survives navigation; releasing and leaving jog sends stop', async ({ page }) => {
  const commands: string[] = [];
  const powerCommands: string[] = [];
  const cartesianCommands: { twist: number[]; frame: string }[] = [];
  let sockets = 0;
  await page.addInitScript(() => {
    sessionStorage.setItem('rocos_client_id', 'ui-test-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, isRobotEnabled: true, controlToken: 'ui-test-token' }, version: 0 }));
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/jog/')) commands.push(path);
    if (path === '/api/robot/enable' || path === '/api/robot/disable') powerCommands.push(path);
    if (path.endsWith('/jog/cartesian')) cartesianCommands.push(route.request().postDataJSON());
    if (path === '/api/robot/urdf') return route.fulfill({ contentType: 'text/xml', body: '<robot name="test"><link name="base"/></robot>' });
    await route.fulfill({ json: { success: true, code: 0, message: 'ok', data: { has_owner: true, owner_client_id: 'ui-test-client', heartbeat_interval_seconds: 1, scripts: [] } } });
  });
  await page.routeWebSocket('**/ws/robot_state', (socket) => {
    sockets++;
    socket.send(JSON.stringify({ active_tool_frame_name: 'TCP_live', active_object_frame_name: 'Fixture_live', active_tool_frame: { position: { x: 0.125, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }, is_enabled: true, robot_state: 'IDLE', work_mode: 'position', joint_states: Array.from({ length: 7 }, (_, i) => ({ name: `joint_${i + 1}`, position: 0, velocity: 0, torque: 0, status: 2 })), flange: { position: { x: 0, y: 0, z: 0.5 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }));
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
  await expect(page.locator('.teach-topbar')).toContainText('TCP_live');
  await expect(page.locator('.teach-topbar')).toContainText('Fixture_live');
  await jog.focus();
  await page.keyboard.down('Space');
  const stopBeforeSwitch = commands.filter((path) => path.endsWith('/stop')).length;
  await page.getByRole('radiogroup', { name: '点动空间' }).getByText('笛卡尔点动', { exact: true }).click();
  await page.keyboard.up('Space');
  await expect.poll(() => commands.filter((path) => path.endsWith('/stop')).length).toBeGreaterThan(stopBeforeSwitch);
  const cartesian = page.getByRole('button', { name: 'RX +', exact: true });
  await cartesian.focus();
  await page.keyboard.down('Space');
  await expect.poll(() => cartesianCommands.length).toBeGreaterThan(0);
  await page.keyboard.up('Space');
  expect(cartesianCommands[0]).toMatchObject({ twist: [0, 0, 0, 1, 0, 0], frame: 'BASE' });
  await expect(page.locator('.teach-jog-groups .jog-value:visible')).toHaveCount(0);
  await page.locator('.teach-jog-reference .ant-select').click();
  await page.locator('.ant-select-dropdown').getByText('工具坐标系', { exact: true }).click();
  await expect(page.locator('.teach-state-column .teach-pose-grid > div').first()).toContainText('0.000');
  await page.locator('.teach-display-frame .ant-select').click();
  await page.locator('.ant-select-dropdown:visible').getByText('工具', { exact: true }).click();
  await expect(page.locator('.teach-state-column .teach-pose-grid > div').first()).toContainText('125.000');
  const nullJog = page.getByRole('button', { name: 'N1 +', exact: true });
  await nullJog.scrollIntoViewIfNeeded();
  await nullJog.focus();
  await page.keyboard.down('Space');
  await expect.poll(() => commands.filter((path) => path.endsWith('/svd')).length).toBeGreaterThan(0);
  const stopsBeforeNullSwitch = commands.filter((path) => path.endsWith('/stop')).length;
  await page.getByRole('radiogroup', { name: '点动空间' }).getByText('关节点动', { exact: true }).click();
  await page.keyboard.up('Space');
  await expect.poll(() => commands.filter((path) => path.endsWith('/stop')).length).toBeGreaterThan(stopsBeforeNullSwitch);
  const initialSockets = sockets; // React StrictMode mounts effects twice in development.
  await page.getByRole('radiogroup', { name: '点动空间' }).getByText('关节点动', { exact: true }).click();
  commands.length = 0;
  await jog.focus();
  await page.keyboard.down('Space');
  await expect.poll(() => commands.filter((p) => p.endsWith('/joint')).length).toBeGreaterThan(0);
  await page.locator('.teach-sidebar').getByRole('link', { name: '程序编程' }).click();
  await page.keyboard.up('Space');
  await expect.poll(() => commands.filter((p) => p.endsWith('/stop')).length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: '程序库', exact: true })).toBeVisible();
  expect(sockets).toBe(initialSockets);
  await expect(page.locator('.teach-topbar')).toContainText('TCP_live');
  await expect(page.locator('.teach-topbar')).toContainText('Fixture_live');
  const power = page.locator('.teach-controlbar .teach-enable-icon');
  await expect(power).toHaveAttribute('aria-pressed', 'true');
  await power.click();
  await expect(power).toHaveAttribute('aria-pressed', 'false');
  await expect(power).toHaveAccessibleName('未使能');
  await power.click();
  await expect(power).toHaveAttribute('aria-pressed', 'true');
  expect(powerCommands).toEqual(['/api/robot/disable', '/api/robot/enable']);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '上传并运行' })).toBeDisabled();
  await expect(power).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.teach-sidebar').getByRole('link', { name: '系统设置' }).click();
  await page.getByRole('tab', { name: '控制器连接', exact: true }).click();
  await page.getByRole('button', { name: '断开', exact: true }).click();
  await expect(page.getByText('确定要断开 127.0.0.1:8080 吗？', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByRole('main').getByRole('button', { name: '连接', exact: true })).toBeVisible();
  await expect(power).toBeDisabled();
});


test('logo toggles a full-height sidebar and remembers the icon layout', async ({ page }) => {
  await page.goto('/#/dashboard');
  const sidebar = page.locator('.teach-sidebar');
  const main = page.getByRole('main');
  const expanded = await sidebar.boundingBox();
  expect(expanded?.y).toBe(0);
  expect(expanded?.height).toBe(1000);
  await page.getByRole('button', { name: '收起侧边栏' }).click();
  await expect(page.getByRole('button', { name: '展开侧边栏' })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(64);
  const collapsed = await sidebar.boundingBox();
  expect(collapsed!.width).toBeLessThan(expanded!.width);
  expect((await main.boundingBox())!.x).toBe(collapsed!.width);
  await sidebar.getByRole('link', { name: '手动示教' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible();
  await page.getByRole('button', { name: '展开侧边栏' }).click();
  await expect(page.getByRole('button', { name: '收起侧边栏' })).toBeVisible();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(expanded!.width);
  await page.locator('.teach-3d').getByRole('button', { name: '展开', exact: true }).click();
  const scene = await page.locator('.teach-3d-expanded').boundingBox();
  const workspace = await main.boundingBox();
  expect(scene!.x).toBeGreaterThanOrEqual(workspace!.x);
  expect(scene!.y + scene!.height).toBeLessThanOrEqual(workspace!.y + workspace!.height);
  await page.keyboard.press('Escape');
  await expect(page.locator('.teach-3d-expanded')).toHaveCount(0);
  await page.locator('.teach-sidebar').getByRole('link', { name: '系统设置' }).click();
  await page.getByRole('radiogroup', { name: '界面语言' }).getByText('English', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  for (const name of ['Run', 'Pause', 'Stop']) {
    await expect(page.locator('.teach-controlbar').getByRole('button', { name, exact: true })).toBeVisible();
  }
});

for (const language of ['zh', 'en']) {
  test(`realtime readouts fit without scroll and point actions stay inset (${language})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript((language) => localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, sidebarCollapsed: false }, version: 0 })), language);
    for (const [width, height] of [[1920, 1200], [1440, 1000], [1366, 768], [1920, 720], [1024, 768], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/#/teaching');
      await expect(page.locator('.teach-context-actions')).toBeVisible();
      if (width < 600) await page.getByRole('button', { name: language === 'zh' ? '收起侧边栏' : 'Collapse sidebar' }).click();
      const actions = page.locator('.teach-context-actions');
      for (let toggle = 0; toggle < 2; toggle++) {
        await expect.poll(() => actions.locator('button').evaluateAll((buttons) => {
          const card = document.querySelector('.teach-context')!.getBoundingClientRect();
          return buttons.every((button) => {
            const b = button.getBoundingClientRect();
            return b.height >= 44 && b.width >= 44 && b.top - card.top >= 7 && card.right - b.right >= 7 && card.bottom - b.bottom >= 7;
          });
        })).toBe(true);
        await actions.locator('button').last().click();
      }
      let body = page.locator('.teach-state-column .teach-card-body');
      const drawer = !(await body.isVisible());
      if (drawer) {
        await page.getByRole('button', { name: language === 'zh' ? '状态详情' : 'State details', exact: true }).click();
        body = page.locator('.teach-state-drawer .ant-drawer-body');
      }
      await expect(body.locator('.teach-joint-row')).toHaveCount(7);
      await expect(body.locator('.teach-pose-grid > div')).toHaveCount(6);
      await expect.poll(() => body.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
          && Array.from(el.querySelectorAll('.teach-joint-row, .teach-pose-grid > div, .teach-card-footnote')).every((row) => {
            const r = row.getBoundingClientRect();
            return r.top >= box.top && r.bottom <= box.bottom && r.left >= box.left && r.right <= box.right
              && row.scrollHeight <= row.clientHeight + 1 && row.scrollWidth <= row.clientWidth + 1;
          });
      }), `readout content fits at ${width}x${height}`).toBe(true);
      if (drawer) await page.locator('.teach-state-drawer .ant-drawer-close').click();
    }
  });
}
