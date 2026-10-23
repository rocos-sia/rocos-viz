import { expect, test } from '@playwright/test';

for (const language of ['zh', 'en']) {
  test(`precise target tabs fit and remain browsable offline (${language})`, async ({ page }) => {
    await page.addInitScript(language => localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, themeMode: language === 'en' ? 'dark' : 'light' }, version: 0 })), language);
    for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/#/teaching');
      if (width < 600) await page.getByRole('button', { name: language === 'zh' ? '收起侧边栏' : 'Collapse sidebar' }).click();
      await page.getByRole('tab', { name: language === 'zh' ? '精确控制' : 'Precise control', exact: true }).click();
      const panel = page.locator('.precise-panel');
      const tabs = panel.getByRole('radiogroup');
      await tabs.getByText(language === 'zh' ? '关节位置' : 'Joint position', { exact: true }).click();
      await expect(panel.getByRole('spinbutton')).toHaveCount(7);
      for (const target of language === 'zh' ? ['关节位置', '笛卡尔位姿'] : ['Joint position', 'Cartesian pose']) {
        await tabs.getByText(target, { exact: true }).click();
        await expect(panel.locator('.precise-fill-current')).toBeDisabled();
        await expect(panel.getByRole('spinbutton').first()).toBeDisabled();
        for (const button of await panel.locator('.precise-actions button').all()) {
          await button.scrollIntoViewIfNeeded();
          await expect(button).toBeDisabled();
          await expect(button).toBeInViewport();
        }
        expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        if (width === 1920) await page.locator('.teach-jog-card').screenshot({ path: `test-results/precise-${language}-${target.includes('Joint') || target === '关节位置' ? 'joint' : 'cartesian'}.png` });
      }
      await expect(panel.getByRole('spinbutton')).toHaveCount(6);
      await expect(page.locator('.teach-jog-hint')).toHaveCount(0);
    }
  });
}

test('precise commands preserve tab targets, convert frames and block invalid or unauthorized moves', async ({ page }) => {
  const commands: { path: string; body: { joints: number[]; pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } } } }[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('rocos_client_id', 'precise-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, isRobotEnabled: true, controlToken: 'precise-token', autoLoadModel: false }, version: 0 }));
  });
  let controllerState: Record<string, unknown> = {
    is_enabled: true, joint_states: Array.from({ length: 7 }, (_, i) => ({ name: `joint_${i + 1}`, position: 0, velocity: 0, torque: 0 })),
    flange: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
    active_tool_frame_name: 'tcp', active_tool_frame: { position: { x: 0.1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    active_object_frame_name: 'fixture', active_object_frame: { position: { x: 4, y: 5, z: 6 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
  };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (/\/move/.test(path)) commands.push({ path, body: route.request().postDataJSON() });
    await route.fulfill({ json: { success: true, code: 0, data: path.endsWith('/state') ? controllerState : { has_owner: true, owner_client_id: 'precise-client', heartbeat_interval_seconds: 1 } } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify(controllerState)));
  await page.goto('/#/teaching');
  await page.getByRole('tab', { name: '精确控制', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'J1', exact: true }).fill('90');
  await page.getByRole('spinbutton', { name: 'J7', exact: true }).fill('-45');
  for (const command of ['MoveJ', 'MoveL_FK']) {
    await page.getByRole('button', { name: new RegExp(`\\(${command}\\)$`) }).click();
    await expect.poll(() => commands.length).toBe(command === 'MoveJ' ? 1 : 2);
  }
  expect(commands.map(c => c.path)).toEqual(['/api/robot/movej', '/api/robot/movel_fk']);
  expect(commands[0].body.joints).toHaveLength(7);
  expect(commands[0].body.joints[0]).toBeCloseTo(Math.PI / 2);
  expect(commands[0].body.joints[6]).toBeCloseTo(-Math.PI / 4);
  expect(commands[1].body.joints).toEqual(commands[0].body.joints);
  const targets = page.getByRole('radiogroup', { name: '目标空间' });
  await targets.getByText('笛卡尔位姿', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('200');
  await page.getByRole('spinbutton', { name: 'RX', exact: true }).fill('90');
  await targets.getByText('关节位置', { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'J1', exact: true })).toHaveValue('90');
  await targets.getByText('笛卡尔位姿', { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('200');
  await page.locator('.teach-jog-card').screenshot({ path: 'test-results/precise-connected-cartesian.png' });
  for (const [frame, position] of [
    [400, [0.2, 0, 0]], [200, [1, 2.2, 3]], [100, [1, 2.3, 3]], [300, [4, 5.2, 6]],
  ] as const) {
    await page.evaluate(async frame => { const path = '/src/stores/controlStore.ts'; const { useControlStore } = await import(path); useControlStore.getState().setFrame(frame); }, frame);
    const before = commands.length;
    for (const command of ['MoveJ_IK', 'MoveL']) {
      await page.getByRole('button', { name: new RegExp(`\\(${command}\\)$`) }).click();
      await expect.poll(() => commands.length).toBe(before + (command === 'MoveJ_IK' ? 1 : 2));
    }
    const [ik, linear] = commands.slice(-2);
    expect(ik.path).toBe('/api/robot/movej_ik');
    expect(linear.path).toBe('/api/robot/movel');
    expect(ik.body.pose).toEqual(linear.body.pose);
    expect(ik.body.pose.position.x).toBeCloseTo(position[0]);
    expect(ik.body.pose.position.y).toBeCloseTo(position[1]);
    expect(ik.body.pose.position.z).toBeCloseTo(position[2]);
    expect(ik.body.pose.orientation.x).toBeCloseTo(frame === 400 ? Math.SQRT1_2 : 0.5);
    expect(ik.body.pose.orientation.y).toBeCloseTo(frame === 400 ? 0 : 0.5);
    expect(ik.body.pose.orientation.z).toBeCloseTo(frame === 400 ? 0 : 0.5);
    expect(ik.body.pose.orientation.w).toBeCloseTo(frame === 400 ? Math.SQRT1_2 : 0.5);
    expect(linear.body).not.toHaveProperty('tool_name');
    expect(linear.body).not.toHaveProperty('frame');
  }
  controllerState = await page.evaluate(async () => {
    const path = '/src/stores/robotStateStore.ts'; const { useRobotStateStore } = await import(path);
    const updated = { ...useRobotStateStore.getState().robotState, active_object_frame: undefined };
    useRobotStateStore.getState().updateState(updated);
    return updated;
  });
  await expect(page.getByRole('status')).toContainText('当前参考坐标系数据不可用');
  await expect(page.locator('.precise-actions button').first()).toBeDisabled();
  await targets.getByText('关节位置', { exact: true }).click();
  await expect(page.locator('.precise-actions button').first()).toBeEnabled();
  await page.evaluate(async () => { const path = '/src/stores/connectionStore.ts'; const { useConnectionStore } = await import(path); useConnectionStore.setState({ controlToken: null }); });
  await expect(page.locator('.precise-actions button').first()).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: 'J1', exact: true })).toBeDisabled();
});

test('fill-current buttons snapshot telemetry in the chosen units and frame without motion requests', async ({ page }) => {
  const motions: string[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('rocos_client_id', 'fill-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: false }, version: 0 }));
  });
  let controllerState: Record<string, unknown> = {
    is_enabled: false, joint_states: Array.from({ length: 7 }, (_, i) => ({ name: `joint_${i + 1}`, position: (i + 1) * Math.PI / 18, velocity: 0, torque: 0 })),
    flange: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
    active_tool_frame_name: 'tcp', active_tool_frame: { position: { x: 0.1, y: 0, z: 0 }, orientation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 } },
    active_object_frame_name: 'fixture', active_object_frame: { position: { x: 4, y: 5, z: 6 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
  };
  await page.route('**/api/**', async route => {
    if (/\/api\/robot\/(move|jog)/.test(route.request().url())) motions.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { success: true, code: 0, data: path.endsWith('/state') ? controllerState : { has_owner: true, owner_client_id: 'another-client', heartbeat_interval_seconds: 1 } } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify(controllerState)));
  await page.goto('/#/teaching');
  await page.getByRole('tab', { name: '精确控制', exact: true }).click();
  const fillJoints = page.getByRole('button', { name: '一键填写当前关节位置', exact: true });
  await fillJoints.click();
  for (let i = 0; i < 7; i++) expect(Number(await page.getByRole('spinbutton', { name: `J${i + 1}`, exact: true }).inputValue())).toBeCloseTo((i + 1) * 10);
  await page.locator('.teach-jog-card').screenshot({ path: 'test-results/precise-fill-joints.png' });
  await expect(page.locator('.precise-actions button').first()).toBeDisabled();
  controllerState = await page.evaluate(async () => {
    const unitsPath = '/src/stores/unitStore.ts'; const { useUnitStore } = await import(unitsPath);
    useUnitStore.getState().setUnits({ isDegree: false, isMM: false });
    const statePath = '/src/stores/robotStateStore.ts'; const { useRobotStateStore } = await import(statePath);
    const state = useRobotStateStore.getState().robotState;
    const updated = { ...state, joint_states: state.joint_states.map((joint: object) => ({ ...joint, position: 0.25 })) };
    useRobotStateStore.getState().updateState(updated);
    return updated;
  });
  // Telemetry updates do not overwrite a target until the button is pressed again.
  expect(Number(await page.getByRole('spinbutton', { name: 'J1', exact: true }).inputValue())).toBeCloseTo(Math.PI / 18);
  await fillJoints.click();
  await expect(page.getByRole('spinbutton', { name: 'J1', exact: true })).toHaveValue('0.25');
  await page.getByRole('radiogroup', { name: '目标空间' }).getByText('笛卡尔位姿', { exact: true }).click();
  const fillPose = page.getByRole('button', { name: '一键填写当前位姿', exact: true });
  for (const [frame, expected] of [
    [400, [1, 2, 3, 0, 0, Math.PI / 2]],
    [200, [0, 0, 0, 0, 0, 0]],
    [100, [-0.1, 0, 0, -Math.PI / 2, 0, 0]],
    [300, [-3, 3, -3, 0, 0, 0]],
  ] as const) {
    await page.evaluate(async frame => { const path = '/src/stores/controlStore.ts'; const { useControlStore } = await import(path); useControlStore.getState().setFrame(frame); }, frame);
    await fillPose.click();
    const values = await page.locator('.precise-input input').evaluateAll(inputs => inputs.map(input => Number((input as HTMLInputElement).value)));
    values.forEach((value, i) => expect(value).toBeCloseTo(expected[i]));
    // Round trip must reconstruct the original base-frame flange pose.
    const target = await page.evaluate(async ({ values, frame }) => {
      const path = '/src/core/PreciseMotion.ts'; const { preciseReference, preciseTarget } = await import(path);
      const statePath = '/src/stores/robotStateStore.ts'; const { useRobotStateStore } = await import(statePath);
      return preciseTarget(values, preciseReference(frame, useRobotStateStore.getState().robotState));
    }, { values, frame });
    [target.position.x, target.position.y, target.position.z].forEach((value, i) => expect(value).toBeCloseTo(i + 1));
    expect(Math.abs(target.orientation.z)).toBeCloseTo(Math.SQRT1_2);
    expect(Math.abs(target.orientation.w)).toBeCloseTo(Math.SQRT1_2);
  }
  await page.evaluate(async () => {
    const path = '/src/stores/unitStore.ts'; const { useUnitStore } = await import(path);
    useUnitStore.getState().setUnits({ isDegree: true, isMM: true });
    const controls = '/src/stores/controlStore.ts'; const { useControlStore } = await import(controls); useControlStore.getState().setFrame(400);
  });
  await fillPose.click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('1000');
  expect(Number(await page.getByRole('spinbutton', { name: 'RZ', exact: true }).inputValue())).toBeCloseTo(90);
  await page.locator('.teach-jog-card').screenshot({ path: 'test-results/precise-fill-pose.png' });
  controllerState = await page.evaluate(async () => {
    const path = '/src/stores/robotStateStore.ts'; const { useRobotStateStore } = await import(path);
    const state = useRobotStateStore.getState().robotState;
    const updated = { ...state, flange: undefined, joint_states: [] };
    useRobotStateStore.getState().updateState(updated);
    return updated;
  });
  await expect(fillPose).toBeDisabled();
  await page.getByRole('radiogroup', { name: '目标空间' }).getByText('关节位置', { exact: true }).click();
  await expect(fillJoints).toBeDisabled();
  expect(motions).toEqual([]);
});
