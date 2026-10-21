import { expect, test } from '@playwright/test';

test('selected frame is displayed in base coordinates independently of motion and fill-current targets', async ({ page }) => {
  const moves: { path: string; body: { frame?: string; pose?: { position: { x: number; y: number; z: number } } } }[] = [];
  await page.addInitScript(() => {
    if (!localStorage.getItem('rocos-ui')) {
      localStorage.setItem('rocos-ui', JSON.stringify({ state: { displayFrame: 400 }, version: 0 }));
    }
    sessionStorage.setItem('rocos_client_id', 'frame-client');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, isRobotEnabled: true, controlToken: 'frame-token', autoLoadModel: false }, version: 0 }));
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (/\/(move|jog)/.test(path)) moves.push({ path, body: route.request().postDataJSON() });
    await route.fulfill({ json: { success: true, code: 0, data: { has_owner: true, owner_client_id: 'frame-client', heartbeat_interval_seconds: 1 } } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify({
    is_enabled: true, joint_states: Array.from({ length: 7 }, (_, i) => ({ name: `joint_${i + 1}`, position: 0, velocity: 0, torque: 0 })),
    flange: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
    active_tool_frame_name: 'tcp', active_tool_frame: { position: { x: 0.1, y: 0, z: 0 }, orientation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 } },
    active_object_frame_name: 'fixture', active_object_frame: { position: { x: 4, y: 5, z: 6 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } },
  })));
  await page.goto('/#/teaching');
  const selectFrame = async (label: string, frame: string) => {
    await page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: label, exact: true }) }).click();
    await page.locator('.ant-select-dropdown:visible').getByText(frame, { exact: true }).click();
  };
  const readout = page.locator('.teach-state-column .teach-pose-grid strong');
  await expect(page.locator('.teach-display-frame .ant-select-selection-item')).toHaveText('法兰');
  await expect(readout.first()).toHaveText('1000.000');
  await selectFrame('运动参考坐标系', '工具坐标系');
  await expect(readout.first()).toHaveText('1000.000');
  for (const [frame, values] of [
    ['法兰', [1000, 2000, 3000, 0, 0, 90]],
    ['工具', [1000, 2100, 3000, 90, 0, 90]],
    ['工件', [4000, 5000, 6000, 0, 0, 90]],
  ] as const) {
    await selectFrame('显示坐标系', frame);
    await expect(readout).toHaveText(values.map(value => value.toFixed(3)));
    await expect(page.locator('.teach-state-column')).toContainText(`${frame}位姿 · 基坐标系`);
    await expect(page.locator('.teach-jog-reference .ant-select-selection-item')).toHaveText('工具坐标系');
  }
  expect(moves).toEqual([]);
  await page.getByRole('radiogroup', { name: '点动空间' }).getByText('笛卡尔点动', { exact: true }).click();
  const jog = page.getByRole('button', { name: 'X +', exact: true });
  await jog.focus();
  await page.keyboard.down('Space');
  await expect.poll(() => moves.some(move => move.path.endsWith('/cartesian'))).toBe(true);
  await page.keyboard.up('Space');
  expect(moves.find(move => move.path.endsWith('/cartesian'))!.body.frame).toBe('TOOL');
  await page.getByRole('tab', { name: '精确控制', exact: true }).click();
  await page.getByRole('radiogroup', { name: '目标空间' }).getByText('笛卡尔位姿', { exact: true }).click();
  await page.getByRole('button', { name: '一键填写当前位姿' }).click();
  expect(Number(await page.getByRole('spinbutton', { name: 'X', exact: true }).inputValue())).toBeCloseTo(-100);
  await page.getByRole('button', { name: '笛卡尔空间运动 (MoveL)', exact: true }).click();
  await expect.poll(() => moves.some(move => move.path.endsWith('/movel'))).toBe(true);
  const target = moves.find(move => move.path.endsWith('/movel'))!.body.pose!;
  [target.position.x, target.position.y, target.position.z].forEach((value, i) => expect(value).toBeCloseTo(i + 1));
  await page.evaluate(async () => {
    const path = '/src/stores/unitStore.ts'; const { useUnitStore } = await import(path);
    useUnitStore.getState().setUnits({ isMM: false, isDegree: false });
  });
  await expect(readout).toHaveText(['4.000', '5.000', '6.000', '0.000', '0.000', '1.571']);
  await page.reload();
  await expect(page.locator('.teach-display-frame .ant-select-selection-item')).toHaveText('工件');
  await expect(page.locator('.teach-jog-reference .ant-select-selection-item')).toHaveText('基座坐标系');
  await expect(readout.first()).toHaveText('4.000');
  await page.evaluate(async () => {
    const path = '/src/stores/robotStateStore.ts'; const { useRobotStateStore } = await import(path);
    useRobotStateStore.getState().updateState({ ...useRobotStateStore.getState().robotState, active_object_frame: undefined });
  });
  await expect(readout).toHaveText(Array(6).fill('—'));
  await expect(page.locator('.teach-state-column')).toContainText('位姿数据不可用');
  await selectFrame('显示坐标系', '工具');
  await page.evaluate(async () => {
    const path = '/src/stores/robotStateStore.ts'; const { useRobotStateStore } = await import(path);
    const state = useRobotStateStore.getState().robotState;
    useRobotStateStore.getState().updateState({ ...state, flange: { ...state.flange, position: { x: 2, y: 2, z: 3 } } });
  });
  await expect(readout).toHaveText(['2.000', '2.100', '3.000', '1.571', '0.000', '1.571']);
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts'; const { useUIStore } = await import(path);
    useUIStore.getState().toggleLanguage();
  });
  await expect(page.locator('.teach-state-column')).toContainText('Tool pose · Base frame');
  await page.locator('.teach-display-frame .ant-select').click();
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option-content')).toHaveText(['Flange', 'Tool', 'Workpiece']);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/display-frame-en.png' });
});
