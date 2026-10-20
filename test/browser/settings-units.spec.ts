import { expect, test } from '@playwright/test';

test('unit preferences update readouts and persist without changing stored points', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: '单位显示', exact: true }).click();
  await expect(page.locator('.teach-unit-settings .teach-setting-row')).toHaveCount(5);
  await expect(page.getByRole('tab', { name: '角度', exact: true })).toHaveCount(0);
  await expect(page.locator('.teach-unit-settings .ant-segmented-item-selected').first()).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  for (const [tab, option] of [['角度', 'rad'], ['长度', 'm'], ['力', 'kN'], ['力矩', 'N·mm'], ['质量', 'g']]) {
    await page.getByRole('radiogroup', { name: tab, exact: true }).getByText(option, { exact: true }).click();
  }
  await page.getByRole('link', { name: '手动示教', exact: true }).click();
  await expect(page.locator('.teach-state-column .teach-joint-row').nth(1)).toContainText('-0.5236');
  await expect(page.locator('.teach-state-column .teach-joint-row').nth(1)).toContainText('rad');
  await expect(page.locator('.teach-state-column .teach-pose-grid > div').first()).toContainText('0.425');
  await expect(page.locator('.teach-state-column .teach-pose-grid > div small').first()).toHaveText('m');
  const result = await page.evaluate(async () => {
    const storePath = '/src/stores/unitStore.ts', corePath = '/src/core/Units.ts', pointsPath = '/src/stores/teachStore.ts';
    const { useUnitStore } = await import(storePath);
    const { displayUnits, chartUnit } = await import(corePath);
    const { useTeachStore } = await import(pointsPath);
    const units = useUnitStore.getState();
    const display = displayUnits(units);
    return { point: useTeachStore.getState().points[0].position[0], force: display.force.factor, mass: display.mass.factor,
      torque: chartUnit('joint_torque', units), angle: chartUnit('joint_position', units), length: chartUnit('flange_x', units) };
  });
  expect(result.point).toBe(425.318);
  expect(result.force).toBe(0.001);
  expect(result.mass).toBe(1000);
  expect(result.torque).toEqual({ label: 'N·mm', factor: 1000 });
  expect(result.angle).toEqual({ label: 'rad', factor: 1 });
  expect(result.length).toEqual({ label: 'm', factor: 1 });
  await page.reload();
  await expect(page.locator('.teach-state-column .teach-joint-row').nth(1)).toContainText('-0.5236');
  await page.getByRole('link', { name: '系统设置', exact: true }).click();
  await page.getByRole('tab', { name: '阻抗参数', exact: true }).click();
  await expect(page.locator('.teach-impedance-inputs').first().locator('input').first()).toHaveValue('1000000.000000');
  await expect(page.locator('.teach-impedance-inputs').nth(7).locator('input').first()).toHaveValue('1.000000');
  await expect(page.locator('.teach-impedance-inputs').nth(7)).toContainText('kN/m');
});

test('precision inputs retain their physical target when display units change', async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem('rocos_client_id', 'unit-client'); sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, isRobotEnabled: true, controlToken: 'unit-test', autoLoadModel: false }, version: 0 })); });
  const commands: { pose: { position: { x: number }; orientation: { x: number; w: number } } }[] = [];
  await page.route('**/api/**', async route => {
    if (route.request().url().includes('/move')) commands.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, code: 0, data: { has_owner: true, owner_client_id: 'unit-client', heartbeat_interval_seconds: 1 } } });
  });
  await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify({ is_enabled: true, joint_states: [{ name: 'joint_1', position: 0, velocity: 0, torque: 0 }], flange: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } })));
  await page.goto('/#/teaching');
  await page.getByRole('tab', { name: '精确控制', exact: true }).click();
  const inputs = page.locator('.precise-input input');
  await inputs.first().fill('250');
  await inputs.nth(3).fill('90');
  await page.evaluate(async () => {
    const path = '/src/stores/unitStore.ts';
    const { useUnitStore } = await import(path);
    useUnitStore.getState().setUnits({ isDegree: false, isMM: false });
  });
  await expect(inputs.first()).toHaveValue('0.25');
  expect(Number(await inputs.nth(3).inputValue())).toBeCloseTo(Math.PI / 2);
  await page.getByRole('button', { name: 'MoveL', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].pose.position.x).toBe(0.25);
  expect(commands[0].pose.orientation.x).toBeCloseTo(Math.SQRT1_2);
  expect(commands[0].pose.orientation.w).toBeCloseTo(Math.SQRT1_2);
});

for (const autoLoad of [false, true]) {
  test(`connection uses inline fields and respects model loading (${autoLoad})`, async ({ page }) => {
    const requests: string[] = [];
    await page.route('**/api/**', async route => {
      requests.push(route.request().url());
      if (route.request().url().includes('/urdf')) return route.fulfill({ contentType: 'text/xml', body: '<robot name="test"><link name="base"/></robot>' });
      return route.fulfill({ json: { success: true, code: 0, data: {} } });
    });
    await page.routeWebSocket('**/ws/robot_state', socket => socket.send(JSON.stringify({ joint_states: [] })));
    await page.goto('/#/settings');
    await page.getByRole('tab', { name: '控制器连接', exact: true }).click();
    await page.getByLabel('IP 地址', { exact: true }).fill('127.0.0.1');
    await page.getByLabel('端口', { exact: true }).fill('70000');
    await page.getByRole('button', { name: '连接', exact: true }).click();
    await expect(page.getByText('端口必须为 1 至 65535 的整数')).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByLabel('端口', { exact: true }).fill('8099');
    await page.getByRole('checkbox').setChecked(autoLoad);
    await page.getByRole('button', { name: '连接', exact: true }).click();
    await expect(page.getByRole('button', { name: '断开', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('rocos-connection')!).state);
    expect(stored).toMatchObject({ host: '127.0.0.1', port: '8099', autoLoadModel: autoLoad, isConnected: true });
    if (autoLoad) await expect.poll(() => requests.filter(url => url.includes('/urdf')).length).toBeGreaterThan(0);
    else expect(requests.filter(url => url.includes('/urdf'))).toHaveLength(0);
  });
}
