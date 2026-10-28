import { expect, test, type Page } from '@playwright/test';
import type { RobotInfo } from '../../src/core/types';

const baseline = (): RobotInfo => ({
  info_schema_version: 1,
  controller: { app_version: '3.1.0', build_commit: null, api_version: '3.0.0', shm_abi_version: 2, capabilities: ['robot_info_v1'] },
  robot: { source: 'placeholder', name: null, package_version: null, device_id: null, serial_number: null, dof: null, base_link: null, tip_link: null, model_digest: null, link_count: null, mass_kg: null, mass_complete: false },
  master: { source: 'placeholder', backend: 'unknown', version: null, sdk_version: null, master_id: null, cycle_time_us: null, configured_slave_count: null },
  slaves: [{ id: 4, name: null, joint_name: 'joint_2', role: 'drive', source: 'configuration', vendor_id: null, product_code: null, revision_number: null, serial_number: null, firmware_version: null, identity_source: 'unknown', input_pdo_count: null, output_pdo_count: null }],
  slaves_complete: false,
  joint_infos: [{ id: 4, name: 'joint_2', ratio: -100, cnt_per_unit: 123.5, torque_per_unit: 0.2, zero_offset: -42, unit_name: 'rad' }],
});
const reply = (data: RobotInfo) => ({ success: true, code: 0, message: 'ok', data });
const panel = (page: Page) => page.locator('.teach-controller-info');

async function setup(page: Page, language = 'zh') {
  await page.addInitScript((language) => {
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: { host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: true }, version: 0 }));
    localStorage.setItem('rocos-ui', JSON.stringify({ state: { language }, version: 0 }));
  }, language);
  await page.routeWebSocket('**/ws/robot_state', (ws) => ws.send(JSON.stringify({ joint_states: [], robot_state: 'IDLE' })));
  const writes: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/robot/') && route.request().method() !== 'GET') writes.push(path);
    if (path === '/api/robot/urdf') return route.fulfill({ contentType: 'text/xml', body: '<robot name="URDF fixture"><link name="base"/></robot>' });
    return route.fulfill({ json: { success: true, code: 0, data: { has_owner: true, owner_client_id: 'other', joint_states: [], items: [] } } });
  });
  return writes;
}
async function openInfo(page: Page, language = 'zh') {
  await page.getByRole('button', { name: language === 'zh' ? '设备信息' : 'Device info', exact: true }).click();
}
async function switchConnection(page: Page, host: string | null) {
  await page.evaluate(async (host) => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    if (host === null) useConnectionStore.getState().setConnected(false);
    else { useConnectionStore.getState().setConnection(host, '8080'); useConnectionStore.getState().setConnected(true); }
  }, host);
}

test('baseline shows placeholders, configured slaves and public refresh without robot writes', async ({ page }) => {
  const writes = await setup(page);
  let count = 0;
  await page.route('**/api/robot/info', (route) => { count++; return route.fulfill({ json: reply(baseline()) }); });
  await page.goto('/#/dashboard');
  await openInfo(page);
  await expect(panel(page)).toContainText('信息协议 v1');
  await expect(panel(page)).toContainText('3.1.0');
  await expect(panel(page).getByText('待接入', { exact: true })).toHaveCount(2);
  await expect(panel(page)).toContainText('当前清单不完整');
  await expect(panel(page).locator('tbody tr')).toHaveCount(1);
  await expect(panel(page).locator('tbody tr')).toContainText('joint_2');
  await expect(panel(page).locator('tbody tr')).toContainText('配置数据');
  await expect(panel(page)).toContainText('未提供');
  const initialCount = count;
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.teach-sidebar a[href="#/diagnostics"]').click();
  await page.locator('.teach-sidebar a[href="#/dashboard"]').click();
  expect(count).toBe(initialCount);
  await openInfo(page);
  await panel(page).getByRole('button', { name: '刷新信息' }).click();
  await expect.poll(() => count).toBe(initialCount + 1);
  await expect(panel(page)).toContainText('3.1.0');
  expect(writes).toEqual([]);
  await panel(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/robot-info-baseline.png' });
});

for (const language of ['zh', 'en']) {
  test(`real future data preserves zero values, serial formatting and all versions (${language})`, async ({ page }) => {
    await setup(page, language);
    const info = baseline();
    info.controller!.build_commit = 'abcdef1234';
    Object.assign(info.robot!, { source: 'configuration', name: 'talon_test', package_version: '1.2.3', device_id: 'talon_001', serial_number: '00007', dof: 7, base_link: 'base_link', tip_link: 'flange', model_digest: `sha256:${'a'.repeat(64)}`, link_count: 8, mass_kg: 0, mass_complete: true });
    Object.assign(info.master!, { source: 'runtime', backend: 'ecm', version: '2.4.6', sdk_version: '3.5.7', master_id: 0, cycle_time_us: 1000, configured_slave_count: 1 });
    Object.assign(info.slaves![0], { name: 'Drive A', source: 'runtime', identity_source: 'device', vendor_id: 0, product_code: 4294967295, revision_number: 0, serial_number: '00001', firmware_version: '4.2.1', input_pdo_count: 0, output_pdo_count: 4 });
    info.slaves_complete = true;
    await page.route('**/api/robot/info', (route) => route.fulfill({ json: reply(info) }));
    await page.goto('/#/dashboard');
    await openInfo(page, language);
    await expect(panel(page)).toContainText('talon_001');
    for (const value of ['1.2.3', '2.4.6', '3.5.7', '4.2.1', '00001', '00007', '4294967295']) await expect(panel(page)).toContainText(value);
    await expect(panel(page).locator('dd').filter({ hasText: /^0$/ })).toHaveCount(5);
    await expect(panel(page)).not.toContainText(language === 'zh' ? '清单不完整' : 'Partial inventory');
    await expect(page.locator('.teach-robot-info')).toContainText('00007');
    await page.setViewportSize({ width: 1024, height: 1000 });
    await expect(panel(page)).toBeVisible();
    expect(await panel(page).evaluate((node) => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await panel(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/robot-info-${language}.png` });
  });
}

test('legacy App stays connected and URDF metadata still renders', async ({ page }) => {
  await setup(page);
  await page.route('**/api/robot/info', (route) => route.fulfill({ json: reply({ joint_infos: [] }) }));
  await page.goto('/#/dashboard');
  await openInfo(page);
  await expect(panel(page)).toContainText('当前 App 未提供扩展设备信息');
  await expect(panel(page).getByRole('button', { name: '刷新信息' })).toBeEnabled();
  await expect(page.locator('.teach-robot-info')).toContainText('URDF fixture');
  await expect(page.locator('.teach-robot-info')).not.toContainText('3.1.0');
});

test('info failure can be retried without disconnecting or leaving previous values', async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route('**/api/robot/info', (route) => fail
    ? route.fulfill({ status: 503, json: { success: false, code: 5001, message: 'info unavailable' } })
    : route.fulfill({ json: reply(baseline()) }));
  await page.goto('/#/dashboard');
  await openInfo(page);
  await expect(panel(page)).toContainText('设备信息读取失败');
  await expect(panel(page)).toContainText('info unavailable');
  fail = false;
  await panel(page).getByRole('button', { name: '刷新信息' }).click();
  await expect(panel(page)).toContainText('3.1.0');
  fail = true;
  await panel(page).getByRole('button', { name: '刷新信息' }).click();
  await expect(panel(page)).toContainText('设备信息读取失败');
  await expect(page.locator('.teach-robot-info')).not.toContainText('3.1.0');
});

test('late responses never replace the next controller and disconnect clears the cache', async ({ page }) => {
  await setup(page);
  let release: (() => void) | undefined;
  let pending = false;
  await page.route('**/api/robot/info', async (route) => {
    if (new URL(route.request().url()).hostname === 'controller-b.test') {
      const info = baseline(); info.controller!.app_version = '9.8.7';
      return route.fulfill({ json: reply(info) });
    }
    pending = true;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: reply(baseline()) }).catch(() => {});
  });
  await page.goto('/#/dashboard');
  await openInfo(page);
  await expect.poll(() => pending).toBe(true);
  await switchConnection(page, 'controller-b.test');
  await expect(panel(page)).toContainText('9.8.7');
  release!();
  await expect(panel(page)).not.toContainText('3.1.0');
  await switchConnection(page, null);
  await expect(panel(page)).toContainText('连接控制器后读取设备信息');
  await expect(panel(page)).not.toContainText('9.8.7');
  await expect(panel(page).getByRole('button', { name: '刷新信息' })).toBeDisabled();
  const stored = await page.evaluate(async () => {
    const path = '/src/stores/robotInfoStore.ts';
    const { useRobotInfoStore } = await import(path);
    return useRobotInfoStore.getState().info;
  });
  expect(stored).toBeNull();
});

test('device information dialog preserves the original seven-card dashboard layout', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/#/dashboard');
  const cards = page.locator('.teach-dashboard > .teach-card');
  await expect(cards).toHaveCount(7);
  await expect(cards.locator('h2')).toHaveText(['机器人状态', '关节状态', '法兰位姿', '最近程序', '运行调试', 'IO 状态', '报警与日志']);
  const boxes = () => cards.evaluateAll((nodes) => nodes.map((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const before = await boxes();
  const headerHeights = await cards.locator('.teach-card-header').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(headerHeights[0]).toBe(headerHeights[1]);
  expect(before[1].y).toBe(before[0].y);
  expect(before[2].y).toBe(before[0].y);
  expect(before[0].height).toBeGreaterThan(350);
  expect(before.slice(3).every((box) => box.y === before[3].y)).toBe(true);
  expect(before[3].y).toBeGreaterThan(before[0].y);
  await openInfo(page);
  await expect(panel(page)).toContainText('连接控制器后读取设备信息');
  expect(await boxes()).toEqual(before);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel(page)).not.toBeVisible();
  expect(await boxes()).toEqual(before);
  await expect(page.locator('.teach-robot-preview')).toHaveAttribute('data-model-status', 'ready');
  await page.screenshot({ path: 'test-results/dashboard-layout-restored.png' });
});
