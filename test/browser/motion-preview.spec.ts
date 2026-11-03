import { expect, test } from '@playwright/test';

const pose = (x = 0) => ({ position: { x, y: 0, z: 0.7 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const xml = `<robot name="Preview test arm"><link name="base"><visual><geometry><cylinder radius="0.12" length="0.1"/></geometry></visual></link>
<link name="arm"><visual><origin xyz="0 0 0.3"/><geometry><box size="0.1 0.1 0.6"/></geometry></visual></link>
<joint name="joint_1" type="revolute"><parent link="base"/><child link="arm"/><origin xyz="0 0 0.1"/><axis xyz="0 1 0"/><limit lower="-3.14" upper="3.14" effort="10" velocity="2"/></joint></robot>`;

for (const language of ['zh', 'en']) {
  test(`simulation renders ghosts, chains virtual starts and never sends real motion (${language})`, async ({ page }) => {
    test.setTimeout(60_000);
    let realAuthorized = false;
    const requests: { path: string; body: Record<string, any> }[] = [];
    await page.addInitScript(language => {
      localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, themeMode: language === 'zh' ? 'light' : 'dark' }, version: 0 }));
      sessionStorage.setItem('rocos_client_id', 'preview-test');
      sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: true }, version: 0 }));
    }, language);
    const state = { is_enabled: false, robot_state: 'IDLE', joint_states: [{ name: 'joint_1', position: 0, velocity: 0, torque: 0 }], flange: pose(), hw_state: {} };
    let failPreview = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/robot/urdf') return route.fulfill({ body: xml, contentType: 'application/xml' });
      let data: unknown = path.endsWith('/state') ? state : { has_owner: true, owner_client_id: realAuthorized ? 'preview-test' : 'another-client', heartbeat_interval_seconds: 1 };
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON(); if (path.startsWith('/api/robot/')) requests.push({ path, body });
        if (path === '/api/robot/motion/preview') {
          expect(route.request().headers()['x-rocos-control-token']).toBeUndefined();
          if (failPreview) return route.fulfill({ json: { success: false, code: -2308, message: 'Joint limit' } });
          const end = body.joints?.[0] ?? 0.5;
          data = { motion_type: body.motion_type, joint_names: ['joint_1'], duration: 2,
            points: Array.from({ length: 9 }, (_, i) => ({ time_from_start: i / 4, positions: [body.start_joints[0] + (end - body.start_joints[0]) * i / 8], flange: pose(i / 16) })),
            checks: ['joint_position', 'joint_velocity', 'kinematics'], collision_checked: false, execution_checked: false };
        }
      }
      return route.fulfill({ json: { success: true, code: 0, data } });
    });
    await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify(state)));
    await page.goto('/#/teaching');
    const mode = page.getByRole('radiogroup', { name: language === 'zh' ? '运动模式' : 'Motion mode', exact: true });
    await mode.getByText(language === 'zh' ? '仿真' : 'Simulation', { exact: true }).click();
    await page.getByRole('spinbutton', { name: 'J1', exact: true }).fill('60');
    const generate = (command: string) => page.getByRole('button', { name: new RegExp(`${language === 'zh' ? '生成预览' : 'Generate preview'}.*\\(${command}\\)`) });
    await generate('MoveJ').click();
    await expect(page.locator('.motion-preview-status')).toContainText('MoveJ · 2.00');
    expect(requests.map(r => r.path)).toEqual(['/api/robot/motion/preview']);
    expect(requests[0].body.start_joints).toEqual([0]);
    await expect.poll(() => page.evaluate(async () => {
      const path = '/node_modules/.vite/deps/@react-three_fiber.js'; const { _roots } = await import(path);
      for (const { store } of _roots.values()) {
        const ghosts = store.getState().scene.getObjectByName('motion-preview');
        if (ghosts) return ghosts.children.filter((c: { isURDFRobot?: boolean }) => c.isURDFRobot).length;
      }
      return 0;
    })).toBe(9);
    await expect(page.getByRole('button', { name: language === 'zh' ? '暂停预览' : 'Pause preview', exact: true })).toBeVisible();
    const previewTime = () => page.evaluate(async () => {
      const path = '/src/stores/motionPreviewStore.ts';
      return (await import(path)).useMotionPreviewStore.getState().time;
    });
    await expect.poll(previewTime, { timeout: 8000, intervals: [50] }).toBeGreaterThan(1.6);
    await page.screenshot({ path: `test-results/motion-preview-loop-${language}.png`, fullPage: true });
    await expect.poll(previewTime, { timeout: 2000, intervals: [50] }).toBeLessThan(0.4);
    await expect.poll(previewTime, { timeout: 2000, intervals: [50] }).toBeGreaterThan(0.6);
    expect(requests).toHaveLength(1);
    await page.getByRole('button', { name: language === 'zh' ? '暂停预览' : 'Pause preview', exact: true }).click();
    await expect(page.getByRole('button', { name: language === 'zh' ? '播放预览' : 'Play preview', exact: true })).toBeVisible();
    await generate('MoveL_FK').click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].body.start_joints[0]).toBeCloseTo(Math.PI / 3);
    const actual = await page.evaluate(async () => { const path = '/src/stores/robotStateStore.ts'; return (await import(path)).useRobotStateStore.getState().robotState.joint_states[0].position; });
    expect(actual).toBe(0);
    await page.getByRole('radiogroup', { name: language === 'zh' ? '目标空间' : 'Target space' }).getByText(language === 'zh' ? '笛卡尔位姿' : 'Cartesian pose', { exact: true }).click();
    for (const command of ['MoveJ_IK', 'MoveL']) {
      await generate(command).click();
      await expect(page.locator('.motion-preview-status')).toContainText(`${command} · 2.00`);
    }
    expect(requests.every(r => r.path === '/api/robot/motion/preview')).toBe(true);
    await page.screenshot({ path: `test-results/motion-preview-${language}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: language === 'zh' ? '收起侧边栏' : 'Collapse sidebar' }).click();
    await generate('MoveL').scrollIntoViewIfNeeded();
    expect(await page.locator('.precise-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/motion-preview-mobile-${language}.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await generate('MoveL').click();
    await expect(page.getByRole('button', { name: language === 'zh' ? '播放预览' : 'Play preview', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: language === 'zh' ? '播放预览' : 'Play preview', exact: true }).click();
    await expect(page.getByRole('button', { name: language === 'zh' ? '暂停预览' : 'Pause preview', exact: true })).toBeVisible();
    failPreview = true;
    await generate('MoveL').click();
    await expect(page.locator('.motion-preview-controls .ant-alert')).toContainText('Joint limit');
    await page.getByRole('button', { name: language === 'zh' ? '同步真机起点' : 'Use actual start', exact: true }).click();
    await expect(page.locator('.motion-preview-status')).toContainText(language === 'zh' ? '设置下方目标' : 'Set a target');
    const count = requests.length;
    await mode.getByText(language === 'zh' ? '真机' : 'Real robot', { exact: true }).click();
    expect(requests).toHaveLength(count);
    await page.getByRole('tab', { name: language === 'zh' ? '精确控制' : 'Precise control', exact: true }).click();
    await expect(page.locator('.precise-actions button').first()).toBeDisabled();
    realAuthorized = true;
    state.is_enabled = true;
    await page.evaluate(async () => {
      const path = '/src/stores/connectionStore.ts';
      (await import(path)).useConnectionStore.setState({ controlToken: 'real-token', isRobotEnabled: true });
    });
    await page.getByRole('button', { name: /\(MoveJ\)$/ }).click();
    await expect.poll(() => requests.at(-1)?.path).toBe('/api/robot/movej');
  });
}

test('switching mode cancels a late preview and connection changes clear the virtual session', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: false }, version: 0 })));
  const state = { joint_states: [{ name: 'joint_1', position: 0 }], flange: pose(), hw_state: {} };
  let release: (() => void) | undefined;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/motion/preview')) {
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ json: { success: true, data: { motion_type: 'MoveJ', joint_names: ['joint_1'], duration: 0, points: [{ time_from_start: 0, positions: [0], flange: pose() }] } } }).catch(() => {});
    } else await route.fulfill({ json: { success: true, data: path.endsWith('/state') ? state : { has_owner: false } } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify(state)));
  await page.goto('/#/teaching');
  const mode = page.getByRole('radiogroup', { name: '运动模式', exact: true });
  await mode.getByText('仿真', { exact: true }).click();
  await page.getByRole('button', { name: /生成预览.*\(MoveJ\)/ }).click();
  await expect.poll(() => !!release).toBe(true);
  await mode.getByText('真机', { exact: true }).click();
  release!();
  await mode.getByText('仿真', { exact: true }).click();
  await expect(page.locator('.motion-preview-status')).toContainText('设置下方目标');
  await page.evaluate(async () => { const path = '/src/stores/connectionStore.ts'; (await import(path)).useConnectionStore.getState().setConnected(false); });
  await expect(page.locator('.motion-preview-controls')).toHaveCount(0);
});
