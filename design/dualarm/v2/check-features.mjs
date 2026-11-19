import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const origin = process.env.DUALARM_PREVIEW_URL || 'http://127.0.0.1:5186';
const read = async path => (await (await fetch(origin + path)).json()).data;
const [info, model, left, right] = await Promise.all([read('/api/arms'), read('/api/workcell/model'), read('/api/arms/left/robot/state'), read('/api/arms/right/robot/state')]);
const pose = () => ({ position: { x: 0, y: 0, z: .1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], writes = [], diagnostics = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const arms = Object.fromEntries(['left', 'right'].map(side => [side, { state: structuredClone(side === 'left' ? left : right), tools: { probe: { name: 'probe', frame: pose() }, package: { name: 'package', frame: pose(), package: { digest: 'fixture-original', revision: 2, package_version: '1.0', mount: pose() } } }, objects: {}, load: { valid: true, mass: 0, com: [0, 0, 0] }, calibration: null, owner: '', offline: false, override: '' }]));
let sequence = 0;
try {
  await page.addInitScript(() => localStorage.setItem('rocos.dualarm.diagnostics', 'http://127.0.0.1:59999'));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const reply = (data, success = true, code = 0) => route.fulfill({ json: { success, code, data, message: success ? 'ok' : 'Fixture failure' } });
    if (path === '/api/arms') return reply(info);
    if (path === '/api/workcell/model') return reply(model);
    if (path.startsWith('/api/workcell/urdf')) return route.continue();
    if (path.startsWith('/api/dualarm/logs')) {
      diagnostics.push(url.origin);
      return path.endsWith('/stream') ? route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' }) : reply({ events: [], next_id: '', gap: null, has_more: false });
    }
    const match = path.match(/^\/api\/arms\/(left|right)\/(.+)$/);
    if (!match) return route.abort();
    const [, side, operation] = match, arm = arms[side], state = arm.state;
    const tracking = () => ({ instance_id: state.instance_id, motion_epoch: state.motion_epoch, state_seq: state.state_seq, command_protocol: 1, command: state.command });
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    if (operation === 'control/acquire') { arm.owner = body.client_id; return reply({ ...tracking(), token: side + '-fixture', has_owner: true, owner_client_id: arm.owner }); }
    if (operation.startsWith('control/')) return reply({ ...tracking(), has_owner: !!arm.owner, owner_client_id: arm.owner });
    if (operation === 'robot/state') {
      if (arm.offline) return route.fulfill({ status: 503, json: { success: false, code: 503, message: 'Fixture offline' } });
      state.timestamp = Date.now() / 1000; state.state_seq++; state.is_enabled = true; state.robot_state = arm.override || 'STOPPED'; state.motion_busy = false;
      state.joint_states.forEach(joint => { joint.velocity = 0; });
      if (arm.goal) {
        const elapsed = Date.now() - arm.goal.started;
        if (elapsed < 450) { state.robot_state = elapsed < 180 ? 'STARTING' : 'RUNNING'; state.motion_busy = true; }
        else { if (arm.goal.body.joints) state.joint_states.forEach((joint, index) => { joint.position = arm.goal.body.joints[index]; }); if (arm.goal.body.pose) state[arm.goal.kind === 'movej_ik' ? 'flange' : 'tcp'] = arm.goal.body.pose; state.command.status = 'finished'; arm.goal = null; }
      }
      return reply(state);
    }
    if (request.method() === 'GET') {
      if (operation === 'robot/command_status') return reply(tracking());
      if (operation === 'robot/tool_frames') return reply({ names: Object.keys(arm.tools), active: state.active_tool_frame_name, file_path: `${side}.yaml` });
      if (operation === 'robot/object_frames') return reply({ names: Object.keys(arm.objects), active: state.active_object_frame_name });
      if (operation === 'robot/tool_frame') return reply(arm.tools[url.searchParams.get('name')]);
      if (operation === 'robot/object_frame') return reply(arm.objects[url.searchParams.get('name')]);
      if (operation === 'robot/load_params') return reply(arm.load);
      if (operation === 'calibration/result') return reply(arm.calibration);
      return reply({});
    }
    writes.push({ side, operation, body, token: request.headers()['x-rocos-control-token'] });
    if (operation.startsWith('robot/move')) { arm.goal = { started: Date.now(), body, kind: operation.split('/')[1] }; state.command = { command_id: body.command_id, motion_epoch: body.motion_epoch, status: 'accepted' }; }
    if (operation === 'robot/stop' || operation === 'robot/jog/stop') { state.motion_epoch++; arm.goal = null; if (state.command) state.command.status = 'stopped'; }
    if (operation === 'robot/tool_frame') arm.tools[body.name] = { name: body.name, frame: body.frame };
    if (operation === 'robot/object_frame') arm.objects[body.name] = { name: body.name, frame: body.frame };
    if (operation === 'robot/load_params') arm.load = { ...body, valid: true };
    if (operation === 'robot/active_tool_frame') { state.active_tool_frame_name = body.name; state.active_tool_frame = arm.tools[body.name].frame; }
    if (operation === 'robot/active_object_frame') { state.active_object_frame_name = body.name; state.active_object_frame = arm.objects[body.name].frame; }
    if (operation === 'robot/frames/load') arm.calibration = null;
    if (operation === 'calibration/pose') {
      if (!body.session_id) arm.calibration = { session_id: `${side}-${++sequence}`, name: body.name, samples: Array(6).fill(null), captured: 0, result: null, package_digest: arm.tools[body.name]?.package?.digest || '', package_revision: arm.tools[body.name]?.package?.revision || 0 };
      arm.calibration.samples[body.index - 1] = { timestamp: Date.now() / 1000, flange: pose() }; arm.calibration.result = null; arm.calibration.captured = arm.calibration.samples.filter(Boolean).length;
      return reply(arm.calibration);
    }
    if (operation === 'calibration/run') { arm.calibration.max_error = body.max_error; arm.calibration.saved = false; arm.calibration.result = { pose: pose(), metrics: { rms_error: .00001, max_error: .00002, condition_number: 12, axis_angle_degrees: 90 } }; return reply(arm.calibration); }
    if (operation === 'calibration/save') { const tool = arm.tools[arm.calibration.name]; tool.frame = arm.calibration.result.pose; arm.calibration.saved = true; if (tool.package) arm.calibration.package_revision = ++tool.package.revision; return reply(null); }
    return reply(tracking());
  });
  await page.goto(origin + '/?base=shoulder');
  await page.getByText('App 模型 · 实时关节姿态', { exact: true }).waitFor();
  await page.locator('.arm-summary.left').getByRole('button', { name: '申请控制权', exact: true }).click();
  const geometry = await page.evaluate(() => ({ body: document.querySelector('.operation-body').getBoundingClientRect().bottom, joint: document.querySelector('.jog-row:last-child').getBoundingClientRect().bottom, footer: document.querySelector('.control-footer').getBoundingClientRect().bottom, panel: document.querySelector('.control-panel').getBoundingClientRect().bottom }));
  assert.ok(geometry.joint <= geometry.body, JSON.stringify(geometry)); assert.ok(geometry.footer <= geometry.panel);
  checks.push('All seven joints and fixed footer visible at 1440x900');
  await page.getByRole('button', { name: '精确运动', exact: true }).click();
  await page.getByRole('button', { name: '填入当前反馈', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'J1', exact: true }).fill('10');
  await page.getByRole('button', { name: '下发左臂 MOVEJ', exact: true }).dblclick();
  assert.equal(writes.filter(write => write.operation === 'robot/movej').length, 1);
  await page.locator('.motion-phase').filter({ hasText: '反馈已到位' }).waitFor();
  assert.match(await page.locator('.motion-feedback').innerText(), /最大偏差/);
  checks.push('Duplicate submission blocked; accepted/running/completed verified from feedback');
  arms.left.offline = true; await page.waitForTimeout(1000);
  assert.equal(await page.getByRole('button', { name: '下发左臂 MOVEJ', exact: true }).isDisabled(), true);
  arms.left.offline = false;
  await page.waitForFunction(() => document.querySelector('.arm-summary.left .arm-error-slot').textContent.includes('已恢复'));
  assert.doesNotMatch(await page.locator('.operation-status').innerText(), /Fixture offline/);
  checks.push('Stale feedback locks writes; recovery archives the old error');
  await page.getByRole('button', { name: '点动控制', exact: true }).click();
  await page.getByRole('button', { name: '网格', exact: true }).click();
  await page.locator('.scene-options summary').click(); await page.getByRole('checkbox', { name: '关节正方向', exact: true }).check(); await page.locator('.scene-options summary').click();
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  const savedView = await page.evaluate(revision => JSON.parse(localStorage.getItem(`rocos.dualarm.scene.v1:${revision}`)), model.revision);
  await page.getByRole('button', { name: '控制器日志', exact: true }).click();
  assert.equal(await page.getByLabel('诊断地址', { exact: true }).inputValue(), 'http://127.0.0.1:59999'); assert.ok(diagnostics.every(address => address === 'http://127.0.0.1:59999'));
  await page.getByRole('button', { name: '手动示教', exact: true }).click();
  await page.getByText('App 模型 · 实时关节姿态', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '网格', exact: true }).getAttribute('aria-pressed'), 'false');
  await page.locator('.scene-options summary').click(); assert.equal(await page.getByRole('checkbox', { name: '关节正方向', exact: true }).isChecked(), true); await page.locator('.scene-options summary').click();
  const restoredView = await page.evaluate(revision => JSON.parse(localStorage.getItem(`rocos.dualarm.scene.v1:${revision}`)), model.revision);
  assert.ok(restoredView.position.every((value, index) => Math.abs(value - savedView.position[index]) < 1e-9));
  checks.push('Saved diagnostic endpoint matches actual connection; scene options and camera survive navigation');
  const colors = {};
  for (const state of ['IDLE', 'STOPPED', 'ENABLING', 'RUNNING', 'PAUSED', 'ERROR_STATE']) {
    arms.left.override = state;
    await page.locator('.arm-summary.left .state-text').filter({ hasText: state }).waitFor();
    colors[state] = await page.locator('.arm-summary.left .state-text').evaluate(element => ({ color: getComputedStyle(element).color, weight: getComputedStyle(element).fontWeight }));
  }
  assert.equal(new Set(Object.values(colors).map(value => value.color)).size, 6); assert.ok(Object.values(colors).every(value => Number(value.weight) >= 600));
  arms.left.override = ''; await page.locator('.arm-summary.left .state-text').filter({ hasText: 'STOPPED' }).waitFor();
  checks.push('Six distinct state text colors, all semibold');
  await page.getByRole('button', { name: '坐标与负载', exact: true }).click();
  const frames = page.locator('.live-configuration .settings-panel').first(), payload = page.locator('.live-configuration .settings-panel').last();
  await frames.getByRole('textbox', { name: '名称', exact: true }).fill('fixture_tcp');
  await frames.locator('.pose-grid input').first().fill('20');
  await frames.getByRole('button', { name: '应用坐标定义', exact: true }).click();
  await frames.getByRole('button', { name: 'fixture_tcp', exact: true }).waitFor();
  assert.equal(arms.left.tools.fixture_tcp.frame.position.x, .02); assert.equal(arms.right.tools.fixture_tcp, undefined);
  await frames.locator('.frame-list>div').filter({ hasText: 'fixture_tcp' }).getByRole('button', { name: '激活坐标系', exact: true }).click();
  await frames.getByRole('button', { name: '保存至文件', exact: true }).click();
  await payload.getByRole('spinbutton', { name: '质量', exact: true }).fill('1.2'); await payload.locator('.pose-grid input').first().fill('15');
  assert.equal(await payload.getByRole('button', { name: '保存至文件', exact: true }).isDisabled(), true);
  await payload.getByRole('button', { name: '应用负载参数', exact: true }).click();
  await payload.getByRole('button', { name: '保存至文件', exact: true }).click();
  assert.equal(arms.left.load.mass, 1.2); assert.equal(arms.left.load.com[0], .015); assert.equal(arms.right.load.mass, 0);
  checks.push('Frame create/activate/persist and payload apply/persist use correct units and arm');
  await page.getByRole('button', { name: '工具与标定', exact: true }).click();
  await page.getByRole('combobox', { name: '标定工具', exact: true }).selectOption('probe');
  async function calibrate() {
    for (let index = 0; index < 6; index++) await page.locator('.live-configuration .sample-row').nth(index).getByRole('button').click();
    await page.getByRole('button', { name: '计算 TCP', exact: true }).click();
    await page.getByRole('spinbutton', { name: '最大允许误差', exact: true }).fill('2');
    assert.equal(await page.getByRole('button', { name: '保存标定结果', exact: true }).isDisabled(), true);
    await page.getByRole('spinbutton', { name: '最大允许误差', exact: true }).fill('1');
    assert.equal(await page.getByRole('button', { name: '保存标定结果', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '计算 TCP', exact: true }).click();
    await page.getByRole('button', { name: '保存标定结果', exact: true }).click();
  }
  await calibrate(); assert.equal(arms.left.state.active_tool_frame_name, 'fixture_tcp');
  await page.locator('.live-configuration .result-panel').getByRole('button', { name: '激活此工具', exact: true }).click();
  assert.equal(arms.left.state.active_tool_frame_name, 'probe');
  await page.locator('.sample-row').nth(2).getByRole('button').click(); assert.equal(await page.getByRole('button', { name: '保存标定结果', exact: true }).isDisabled(), true);
  await page.getByRole('combobox', { name: '标定工具', exact: true }).selectOption('package'); const mount = structuredClone(arms.left.tools.package.package.mount);
  await calibrate(); assert.deepEqual(arms.left.tools.package.package.mount, mount); assert.equal(arms.left.tools.package.package.digest, 'fixture-original'); assert.equal(arms.left.tools.package.package.revision, 3);
  assert.ok(writes.filter(write => write.operation === 'calibration/save').every(write => Object.keys(write.body).join() === 'session_id'));
  assert.ok(writes.filter(write => write.operation === 'calibration/pose').every(write => !('pose' in write.body) && !('joints' in write.body)));
  assert.ok(writes.filter(write => write.operation === 'calibration/run').every(write => write.body.max_error === .001));
  checks.push('Ordinary and configured package six-point workflows: server-only samples, SI tolerance, session-only save, explicit activation, recapture invalidation');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `/tmp/dualarm-features-tools-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.setItem('rocos-ui', JSON.stringify({ state: { language: 'en' }, version: 0 })));
  await page.reload(); await page.getByRole('button', { name: 'Controller logs', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tools and calibration', exact: true }).click(); await page.getByRole('heading', { name: 'Six-point tool calibration', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Controller logs', exact: true }).click();
  await page.getByRole('heading', { name: 'Controller logs', exact: true }).waitFor();
  checks.push('English navigation, controls and configuration match the log language');
  assert.deepEqual(errors, []); assert.ok(writes.every(write => write.token === `${write.side}-fixture`));
  const report = { checks, colors, geometry, errors, scope: 'All writes intercepted; live App queried read-only' };
  fs.writeFileSync('/tmp/dualarm-feature-regression.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: '/tmp/dualarm-features-failure.png', fullPage: true });
  console.error(JSON.stringify({ checks, errors, failure: error.message }));
  throw error;
} finally { await browser.close(); }
