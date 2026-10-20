import { expect, test } from '@playwright/test';

const fixture = `<robot name="Preview fixture">
  <link name="base"><inertial><mass value="4.5"/></inertial><visual><geometry><box size="0.4 0.4 0.3"/></geometry></visual></link>
  <link name="arm"><inertial><mass value="2"/></inertial><visual><origin xyz="0 0 0.4"/><geometry><box size="0.1 0.1 0.8"/></geometry></visual></link>
  <link name="finger"><inertial><mass value="0.5"/></inertial></link>
  <joint name="hinge" type="revolute"><parent link="base"/><child link="arm"/><axis xyz="0 1 0"/><limit lower="1" upper="2"/></joint>
  <joint name="follower" type="revolute"><parent link="arm"/><child link="finger"/><axis xyz="0 1 0"/><mimic joint="hinge" multiplier="2" offset="0.2"/></joint>
</robot>`;

test('URDF metadata, zero pose, mimic offset and camera fitting use model data', async ({ page }) => {
  await page.goto('/#/dashboard');
  const result = await page.evaluate(async (xml) => {
    const modulePath = '/src/core/RobotPreview.ts';
    const core = await import(modulePath);
    const threePath = '/node_modules/.vite/deps/three.js';
    const { PerspectiveCamera, Vector3 } = await import(threePath);
    const { document, summary } = core.readRobotDescription(xml);
    const robot = await core.loadPreviewRobot(document, (path: string) => path);
    const values = Object.values(robot.joints).map((joint) => (joint as { jointValue: number[] }).jointValue[0]);
    const { radius } = core.previewBounds(robot);
    const fits = [0.4, 1, 2].map((aspect) => {
      const camera = new PerspectiveCamera(38, aspect);
      core.fitPreviewCamera(camera, radius, aspect);
      camera.updateMatrixWorld();
      // Every point on the bounding sphere must stay inside the viewport.
      for (let lat = 0; lat <= 20; lat++) for (let lon = 0; lon < 40; lon++) {
        const phi = Math.PI * lat / 20, theta = Math.PI * lon / 20;
        const p = new Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi)).project(camera);
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || Math.abs(p.z) > 1) return false;
      }
      return true;
    });
    core.disposePreviewRobot(robot);
    const partial = core.readRobotDescription(xml.replace('<mass value="4.5"/>', '')).summary;
    const invalidMass = core.readRobotDescription(xml.replace('value="4.5"', 'value="-4.5"')).summary;
    let invalidXml = false;
    try { core.readRobotDescription('<not-a-robot/>'); } catch { invalidXml = true; }
    return { summary, partial, invalidMass, values, fits, invalidXml };
  }, fixture);
  expect(result.summary).toMatchObject({ name: 'Preview fixture', dof: 1, totalMass: 7, linkCount: 3, massLinkCount: 3 });
  expect(result.partial).toMatchObject({ totalMass: null, definedMass: 2.5, massLinkCount: 2 });
  expect(result.invalidMass.totalMass).toBeNull();
  expect(result.values).toEqual([0, 0.2]);
  expect(result.fits).toEqual([true, true, true]);
  expect(result.invalidXml).toBe(true);
});

test('overview renders controller metadata and isolates preview from live joints', async ({ page }) => {
  const robotWrites: string[] = [];
  await page.addInitScript(() => sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true }, version: 0 })));
  await page.route('**/api/**', async (route) => {
    // The existing connection lifecycle acquires control; preview must not send robot commands.
    if (route.request().method() !== 'GET' && route.request().url().includes('/api/robot/')) robotWrites.push(route.request().url());
    if (new URL(route.request().url()).pathname === '/api/robot/urdf') return route.fulfill({ contentType: 'text/xml', body: fixture });
    return route.fulfill({ json: { success: true, code: 0, data: { has_owner: true, owner_client_id: 'other-client', joint_infos: [] } } });
  });
  await page.routeWebSocket('**/ws/robot_state', (socket) => socket.send(JSON.stringify({ robot_state: 'IDLE', joint_states: [{ name: 'hinge', position: 1.5, velocity: 0, torque: 0, status: 2 }] })));
  await page.goto('/#/dashboard');
  await expect(page.locator('.teach-robot-preview')).toHaveAttribute('data-model-status', 'ready');
  await expect(page.locator('.teach-robot-info')).toContainText('Preview fixture');
  await expect(page.locator('.teach-robot-info')).toContainText('7.000 kg');
  await expect(page.locator('.teach-robot-info')).toContainText('未提供');
  await expect(page.locator('.teach-joint-row').first()).toContainText('85.94');
  await page.getByRole('button', { name: '暂停模型旋转', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续模型旋转', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.teach-model-spin')).toHaveCount(0);
  await expect(page.locator('.teach-robot-preview canvas')).toBeVisible();
  expect(robotWrites).toEqual([]);
});

test('mesh failure is visible, can be retried, and offline preview stays read-only', async ({ page }) => {
  let failMesh = true;
  const calls: string[] = [];
  page.on('request', (request) => { if (/\/api\//.test(request.url())) calls.push(request.url()); });
  await page.route('**/demo/talon/base_link.STL', (route) => failMesh ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue());
  await page.goto('/#/dashboard');
  await expect(page.locator('.teach-robot-preview')).toHaveAttribute('data-model-status', 'error');
  await expect(page.locator('.teach-robot-info')).toContainText('talon');
  failMesh = false;
  await page.getByRole('button', { name: /重\s*试/ }).click();
  await expect(page.locator('.teach-robot-preview')).toHaveAttribute('data-model-status', 'ready');
  await expect(page.locator('.teach-robot-preview canvas')).toBeVisible();
  await expect(page.locator('.teach-model-note').first()).toContainText('7/8');
  expect(calls).toEqual([]);
});

for (const language of ['zh', 'en']) {
  test(`typography hierarchy is stable across all pages, themes and widths (${language})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript((language) => localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, themeMode: language === 'en' ? 'dark' : 'light' }, version: 0 })), language);
    for (const width of [1920, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['dashboard', 'teaching', 'programming', 'execution', 'devices', 'diagnostics', 'settings']) {
        await page.goto(`/#/${route}`);
        await expect(page.locator(`main > .teach-${route}`)).toBeVisible();
        await expect(page.locator('main .teach-card-header h2').first()).toBeVisible();
        await expect.poll(() => page.locator('main .teach-card-header h2').evaluateAll((elements) => elements.length > 0 && elements.every((el) => getComputedStyle(el).fontSize === '16px' && getComputedStyle(el).fontWeight === '600'))).toBe(true);
        await expect.poll(() => page.locator('main h3').evaluateAll((els) => els.every((el) => getComputedStyle(el).fontSize === '14px'))).toBe(true);
        await expect(page.locator('.teach-sidebar nav a').first()).toHaveCSS('font-size', '14px');
        await expect(page.locator('.teach-controlbar .ant-btn').last()).toHaveCSS('font-size', '14px');
      }
    }
    await page.getByRole('tab', { name: language === 'en' ? 'Controller connection' : '控制器连接', exact: true }).click();
    await expect(page.getByLabel(language === 'en' ? 'IP Address' : 'IP 地址', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: language === 'en' ? 'Connect' : '连接', exact: true })).toHaveCSS('font-size', '14px');
  });
}
