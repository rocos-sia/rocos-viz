import { expect, test, type Page } from '@playwright/test';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const xml = `<robot name="Tool test robot">
  <link name="base"><visual><geometry><box size="0.2 0.2 0.1"/></geometry></visual></link>
  <link name="arm"><visual><origin xyz="0 0 0.25"/><geometry><box size="0.08 0.08 0.5"/></geometry></visual></link>
  <joint name="hinge" type="revolute"><parent link="base"/><child link="arm"/><origin xyz="0 0 0.05"/><axis xyz="0 1 0"/><limit lower="-2" upper="2"/></joint>
</robot>`;

async function snapshot(page: Page, selector = '.teach-scene-canvas canvas') {
  return page.evaluate(async (selector) => {
    const path = '/node_modules/.vite/deps/@react-three_fiber.js';
    const { _roots } = await import(path);
    const scene = _roots.get(document.querySelector(selector))?.store.getState().scene;
    const frame = scene?.getObjectByName('active-tool-frame');
    if (!frame) return null;
    const robot = scene.getObjectByProperty('isURDFRobot', true);
    // Compare in robot base space so the preview's centering and rotation cancel.
    scene.updateMatrixWorld(true);
    const relative = robot.matrixWorld.clone().invert().multiply(frame.matrixWorld);
    const origin = frame.position.clone().setFromMatrixPosition(relative);
    return {
      name: frame.userData.toolName, position: frame.position.toArray(), rotation: frame.quaternion.toArray(),
      relativeOrigin: origin.toArray(),
      axes: ['X', 'Y', 'Z'].map(name => {
        const axis = frame.getObjectByName(`tool-axis-${name}`);
        const shaft = axis.children[0];
        return { direction: shaft.position.clone().set(0, 1, 0).applyQuaternion(axis.quaternion).toArray(),
          color: shaft.material.color.getHexString(), depthTest: shaft.material.depthTest };
      }),
    };
  }, selector);
}

test('active TCP axes follow controller telemetry in teaching and centered overview', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: {
      host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: true,
    }, version: 0 }));
  });
  let state: Record<string, unknown> = {
    joint_states: [{ name: 'hinge', position: 0, velocity: 0, torque: 0 }], is_enabled: false,
    flange: { position: { x: 0, y: 0, z: 0.55 }, orientation: identity },
    active_tool_frame_name: 'tool1', active_tool_frame: { position: { x: 0.1, y: 0, z: 0 }, orientation: identity },
    tcp: { position: { x: 0.08, y: 0.02, z: 0.6 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
  };
  const robotWrites: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' && path.startsWith('/api/robot/')) robotWrites.push(path);
    if (path === '/api/robot/urdf') return route.fulfill({ contentType: 'text/xml', body: xml });
    return route.fulfill({ json: { success: true, code: 0, data: path.endsWith('/state') ? state : { has_owner: true, owner_client_id: 'other-client' } } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify(state)));
  await page.goto('/#/teaching');
  await expect(page.locator('.teach-scene-canvas .scene-tool-frame-label')).toHaveText('TCP · tool1');
  await expect.poll(() => snapshot(page).then(s => s?.position)).toEqual([0.08, 0.02, 0.6]);
  const initial = (await snapshot(page))!;
  initial.rotation.forEach((value, i) => expect(value).toBeCloseTo([0, 0, Math.SQRT1_2, Math.SQRT1_2][i]));
  initial.axes.forEach((axis, i) => {
    axis.direction.forEach((value, j) => expect(value).toBeCloseTo(i === j ? 1 : 0));
    expect(axis.color).toBe(['ef4444', '22c55e', '3b82f6'][i]);
    expect(axis.depthTest).toBe(false);
  });
  await page.screenshot({ path: 'test-results/tool-frame-teaching.png' });

  const update = async (changes: Record<string, unknown>) => {
    state = { ...state, ...changes };
    await page.evaluate(async (next) => {
      const path = '/src/stores/robotStateStore.ts';
      const { useRobotStateStore } = await import(path);
      useRobotStateStore.getState().updateState(next);
    }, state);
  };
  await update({ active_tool_frame_name: 'gripper', tcp: { position: { x: 0.1, y: -0.02, z: 0.58 }, orientation: identity } });
  await expect(page.locator('.teach-scene-canvas .scene-tool-frame-label')).toHaveText('TCP · gripper');
  await expect.poll(() => snapshot(page).then(s => s?.position)).toEqual([0.1, -0.02, 0.58]);
  await expect.poll(() => snapshot(page).then(s => s?.rotation)).toEqual([0, 0, 0, 1]);
  await page.getByRole('link', { name: '总览', exact: true }).click();
  const preview = '.teach-robot-preview canvas';
  await expect(page.locator('.teach-robot-preview .scene-tool-frame-label')).toHaveText('TCP · gripper');
  const centered = (await snapshot(page, preview))!;
  centered.relativeOrigin.forEach((value, i) => expect(value).toBeCloseTo([0.1, -0.02, 0.58][i]));
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts';
    const { useUIStore } = await import(path);
    useUIStore.getState().toggleLanguage();
    useUIStore.getState().toggleTheme();
  });
  await expect(page.locator('.teach-robot-preview .scene-tool-frame-label')).toHaveAttribute('aria-label', 'Tool frame: gripper');

  // Explicitly unavailable or malformed TCP must never leave a stale frame.
  for (const tcp of [null, { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 0 } }]) {
    await update({ tcp });
    await expect.poll(() => snapshot(page, preview)).toBeNull();
    await expect(page.locator('.teach-robot-preview .scene-tool-frame-label')).toHaveCount(0);
  }
  // Legacy controllers compose flange→tool once; a rotated flange rotates the offset.
  await update({ tcp: undefined, flange: { position: { x: 0, y: 0, z: 0.55 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } } });
  await expect.poll(() => snapshot(page, preview).then(s => s?.position.map(v => Math.round(v * 1000) || 0))).toEqual([0, 100, 550]);
  await update({ active_tool_frame_name: '' });
  await expect.poll(() => snapshot(page, preview)).toBeNull();
  await update({ active_tool_frame_name: 'gripper' });
  await expect(page.locator('.teach-robot-preview .scene-tool-frame-label')).toHaveText('TCP · gripper');
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnected(false);
  });
  await expect(page.locator('.scene-tool-frame-label')).toHaveCount(0);
  expect(robotWrites).toEqual([]);
});
