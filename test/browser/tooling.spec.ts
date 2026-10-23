import { expect, test } from '@playwright/test';

const pose = (z = 0.15) => ({ position: { x: 0, y: 0, z }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const state = { robot_state: 'STOPPED', motion_busy: false, is_running: false, is_enabled: false,
  joint_states: [{ name: 'joint_1', position: 0.1, velocity: 0, torque: 0, status: 0 }], flange: pose(0.4) };

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(({ readonly }) => {
    sessionStorage.setItem('rocos_client_id', 'browser-tab');
    sessionStorage.setItem('rocos-connection', JSON.stringify({ state: {
      host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: false,
      controlToken: readonly ? null : 'browser-token',
    }, version: 0 }));
    class FakeEventSource extends EventTarget { close() {} }
    Object.assign(window, { EventSource: FakeEventSource });
  }, { readonly: info.title.startsWith('readonly') });
  const tools = new Map([['TCP_existing', pose()]]);
  let active = '';
  let session: { session_id: string; name: string; captured: number; samples: ({ index: number; flange: ReturnType<typeof pose>; joints: number[]; timestamp: number } | null)[]; result: null | object } | null = null;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON() ?? {};
    const send = (data: unknown) => route.fulfill({ json: { success: true, code: 0, message: 'ok', data } });
    if (method !== 'GET' && (url.pathname.startsWith('/api/robot/tool') || url.pathname.includes('/calibration/') || url.pathname.includes('/load_params'))) {
      expect(request.headers()['x-rocos-control-token']).toBe('browser-token');
      expect(request.headers()['x-rocos-client-id']).toBe('browser-tab');
    }
    if (url.pathname === '/api/robot/tool_frames') return send({ names: [...tools.keys()], active, file_path: '/controller/config/frames.yaml' });
    if (url.pathname === '/api/robot/tool_frame') {
      if (method === 'GET') return send({ name: url.searchParams.get('name'), frame: tools.get(url.searchParams.get('name')!) });
      if (method === 'POST') {
        expect(body.persist).toBe(true);
        if (body.previous_name && body.previous_name !== body.name) {
          tools.delete(body.previous_name);
          if (active === body.previous_name) active = body.name;
        }
        tools.set(body.name, body.frame);
        return send({ name: body.name, frame: body.frame, persisted: true });
      }
      if (method === 'DELETE') {
        expect(url.searchParams.get('persist')).toBe('true');
        const name = url.searchParams.get('name')!;
        tools.delete(name); if (active === name) active = '';
        return send({ name, active, persisted: true });
      }
    }
    if (url.pathname === '/api/robot/active_tool_frame') { expect(body.persist).toBe(true); active = body.name; return send({ active, persisted: true }); }
    if (url.pathname === '/api/robot/load_params') return send({ valid: true, mass: 2, com: [0, 0, 0.03] });
    if (url.pathname === '/api/robot/load_params/save') return send({ path: '/controller/config/payload.yaml' });
    if (url.pathname === '/api/calibration/pose') {
      if (!session || !body.session_id) session = { session_id: 'cal-browser', name: body.name, samples: Array(6).fill(null), captured: 0, result: null };
      const wasCalculated = !!session.result;
      session.samples[body.index - 1] = { index: body.index, flange: pose(body.index / 10), joints: [0.1, 0.2, 0.3], timestamp: 1792740000 + body.index };
      session.captured = session.samples.filter(Boolean).length; session.result = null;
      if (wasCalculated && info.title.includes('recapture')) await new Promise((resolve) => setTimeout(resolve, 1200));
      return send(session);
    }
    if (url.pathname === '/api/calibration/run') {
      expect(body.max_error).toBe(0.001);
      session!.result = { pose: pose(0.18), error_state: false, metrics: { rms_error: 0.00001, max_error: 0.00002, condition_number: 2, axis_angle_degrees: 90 } };
      return send(session);
    }
    if (url.pathname === '/api/calibration/result') return send(session);
    if (url.pathname === '/api/robot/state') return send({ ...state, active_tool_frame_name: active, active_tool_frame: tools.get(active) });
    if (url.pathname === '/api/logs') return send({ events: [], next_id: 'browser:0', has_more: false, gap: null });
    if (url.pathname === '/api/control/acquire') return route.fulfill({ json: { success: false, code: 3008, message: 'Another client holds control', data: { has_owner: true, owner_client_id: 'another-tab' } } });
    if (url.pathname.startsWith('/api/control/')) return send({ has_owner: true, owner_client_id: info.title.startsWith('readonly') ? 'another-tab' : 'browser-tab', ttl_seconds: 300, heartbeat_interval_seconds: 3 });
    return send({ joint_states: [], has_owner: false });
  });
  await page.routeWebSocket('**/ws/robot_state', (socket) => socket.send(JSON.stringify(state)));
});

test('tools create edit rename activate delete and payload use persistent authenticated APIs', async ({ page }) => {
  await page.goto('/#/devices?tab=tool');
  await expect(page.getByRole('cell', { name: 'TCP_existing', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增工具', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '工具名称', exact: true }).fill('TCP_new');
  await dialog.getByRole('spinbutton', { name: 'TCP 位姿 Z', exact: true }).fill('200');
  await dialog.getByRole('spinbutton', { name: 'TCP 位姿 RX', exact: true }).fill('45');
  const saved = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/robot/tool_frame'));
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  const create = (await saved).postDataJSON();
  expect(create.frame.position.z).toBe(0.2);
  expect(create.frame.orientation.x).toBeCloseTo(Math.sin(Math.PI / 8));
  await expect(page.getByRole('cell', { name: 'TCP_new', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ has: page.getByText('TCP_new', { exact: true }) });
  await row.getByRole('button', { name: '设为当前工具', exact: true }).click();
  await expect(row.getByText('当前工具', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑工具 TCP_new', exact: true }).click();
  await dialog.getByRole('textbox', { name: '工具名称', exact: true }).fill('TCP_renamed');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('row').filter({ has: page.getByText('TCP_renamed', { exact: true }) }).getByText('当前工具', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除工具 TCP_renamed', exact: true }).click();
  await page.getByRole('tooltip').getByRole('button', { name: /确\s*定/ }).click();
  await expect(page.getByText('TCP_renamed', { exact: true })).toHaveCount(0);
  await page.getByRole('spinbutton', { name: '负载', exact: true }).fill('3.5');
  await page.getByRole('spinbutton', { name: '质心 X', exact: true }).fill('10');
  const payloadRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/robot/load_params'));
  await page.getByRole('button', { name: '保存负载参数', exact: true }).click();
  expect((await payloadRequest).postDataJSON()).toEqual({ mass: 3.5, com: [0.01, 0, 0.03] });
  await expect(page.getByText('负载参数已保存到控制器文件', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/tools-management-zh.png', fullPage: true });
});

test('six point wizard keeps captured poses across teaching navigation and only saves on explicit action', async ({ page }) => {
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name: '六点法标定', exact: true }).click();
  await page.getByRole('textbox', { name: '标定工具名称', exact: true }).fill('TCP_cal');
  await expect(page.getByRole('button', { name: '采集 P2', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '采集 P1', exact: true }).click();
  await expect(page.getByText('已采集 1 / 6 点', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '前往手动示教调整姿态', exact: true }).click();
  await page.getByRole('button', { name: '工具管理', exact: true }).click();
  await expect(page.getByText('已采集 1 / 6 点', { exact: true })).toBeVisible();
  for (let i = 2; i <= 6; i++) {
    await page.getByRole('button', { name: `采集 P${i}`, exact: true }).click();
    await expect(page.getByText(`已采集 ${i} / 6 点`, { exact: true })).toBeVisible();
  }
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/robot/tool_frame')) writes++; });
  await page.getByRole('button', { name: '计算标定结果', exact: true }).click();
  await expect(page.getByRole('heading', { name: '标定结果', exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('heading', { name: '标定结果', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/tool-six-point-zh.png', fullPage: true });
  await page.getByRole('button', { name: '保存标定工具', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await page.getByRole('tab', { name: '工具管理', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'TCP_cal', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '六点法标定', exact: true }).click();
  await page.getByRole('button', { name: '重新采集 P1', exact: true }).click();
  await expect(page.getByRole('heading', { name: '标定结果', exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const path = '/src/stores/uiStore.ts';
    const { useUIStore } = await import(path); useUIStore.getState().toggleLanguage();
  });
  await expect(page.getByRole('tab', { name: 'Six-point calibration', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/tool-six-point-en.png', fullPage: true });
});

test('readonly tools display real controller data without allowing writes', async ({ page }) => {
  await page.goto('/#/devices?tab=tool');
  await expect(page.getByRole('cell', { name: 'TCP_existing', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增工具', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '六点法标定', exact: true }).click();
  await expect(page.getByRole('button', { name: '采集 P1', exact: true })).toBeDisabled();
  await expect(page.getByText('已采集 0 / 6 点', { exact: true })).toBeVisible();
});

test('a rejected calculation shows the error and disconnect clears calibration drafts', async ({ page }) => {
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name: '六点法标定', exact: true }).click();
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: `采集 P${i}`, exact: true }).click();
    await expect(page.getByText(`已采集 ${i} / 6 点`, { exact: true })).toBeVisible();
  }
  await page.route('**/api/calibration/run', (route) => route.fulfill({ json: { success: false, code: 4002, message: 'Axis directions are collinear', data: null } }));
  await page.getByRole('button', { name: '计算标定结果', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Axis directions are collinear' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存标定工具', exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path); useConnectionStore.getState().reset();
  });
  await expect(page.getByText('已采集 0 / 6 点', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '采集 P1', exact: true })).toBeDisabled();
});


test('recapture cancelled by navigation cannot restore a stale result', async ({ page }) => {
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name: '六点法标定', exact: true }).click();
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: `采集 P${i}`, exact: true }).click();
    await expect(page.getByText(`已采集 ${i} / 6 点`, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '计算标定结果', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存标定工具', exact: true })).toBeVisible();
  const captureSent = page.waitForRequest('**/api/calibration/pose');
  await page.getByRole('button', { name: '重新采集 P1', exact: true }).click();
  await captureSent;
  await expect(page.getByRole('button', { name: '保存标定工具', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '前往手动示教调整姿态', exact: true }).click();
  await page.getByRole('button', { name: '工具管理', exact: true }).click();
  await expect(page.getByText('已采集 6 / 6 点', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存标定工具', exact: true })).toHaveCount(0);
});

test('changing ownership during session refresh does not restore the previous owners draft', async ({ page }) => {
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name: '六点法标定', exact: true }).click();
  await page.getByRole('button', { name: '采集 P1', exact: true }).click();
  await expect(page.getByText('已采集 1 / 6 点', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '前往手动示教调整姿态', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/calibration/result?*', async (route) => {
    await held;
    await route.fallback();
  });
  const refreshing = page.waitForRequest('**/api/calibration/result?*');
  await page.getByRole('button', { name: '工具管理', exact: true }).click();
  await refreshing;
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.setState({ controlToken: 'replacement-token' });
  });
  release();
  await expect(page.getByText('已采集 0 / 6 点', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '标定工具名称', exact: true })).toHaveValue('TCP_01');
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/stores/toolCalibrationStore.ts';
    const { useToolCalibrationStore } = await import(path);return useToolCalibrationStore.getState().session;
  })).toBeNull();
});
