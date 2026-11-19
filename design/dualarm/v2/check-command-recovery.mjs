import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const origin = process.env.DUALARM_PREVIEW_URL;
if (!origin || new URL(origin).hostname !== '127.0.0.1' || new URL(origin).port === '5186') throw new Error('Run through the isolated App command_integration.py harness');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const left = page.locator('.arm-summary.left');
const submit = () => page.getByRole('button', { name: '下发左臂 MOVEJ', exact: true });
const phase = () => page.locator('.motion-phase');
const read = async path => (await (await fetch(origin + path)).json()).data;
async function stopped() {
  await phase().filter({ hasText: '反馈已静止' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.arm-summary.left .owner')?.textContent.includes('验证'));
}
try {
  await page.addInitScript(diagnostics => localStorage.setItem('rocos.dualarm.diagnostics', diagnostics), process.env.DUALARM_DIAGNOSTICS_ORIGIN);
  await page.goto(origin + '/?base=shoulder');
  await page.getByText('App 模型 · 实时关节姿态', { exact: true }).waitFor();
  await left.getByRole('button', { name: '申请控制权', exact: true }).click();
  await left.getByRole('button', { name: '使能', exact: true }).click();
  await left.getByRole('button', { name: '下使能', exact: true }).waitFor();
  await page.getByRole('button', { name: '精确运动', exact: true }).click();
  await page.getByRole('button', { name: '填入当前反馈', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'J1', exact: true }).fill('2');

  let deliver, sent;
  const gate = new Promise(resolve => { deliver = resolve; });
  const observed = new Promise(resolve => { sent = resolve; });
  const delayed = async route => { sent(); await gate; await route.continue(); };
  await page.route('**/api/arms/left/robot/movej', delayed);
  const before = await read('/api/arms/left/robot/state');
  await submit().click(); await observed;
  await left.getByRole('button', { name: '停止左臂', exact: true }).click();
  await stopped();
  const rejection = page.waitForResponse(response => response.url().endsWith('/robot/movej'));
  deliver();
  assert.equal((await (await rejection).json()).code, 4101);
  await page.unroute('**/api/arms/left/robot/movej', delayed);
  await page.waitForTimeout(300);
  assert.match(await phase().innerText(), /反馈已静止/);
  const after = await read('/api/arms/left/robot/state');
  assert.ok(Math.max(...after.joint_states.map((joint, index) => Math.abs(joint.position - before.joint_states[index].position))) < 3e-6);
  assert.equal(await submit().isDisabled(), false);
  checks.push('Stop acknowledged before delayed real MoveJ delivery: App rejects 4101, arm stays still, late failure cannot overwrite stopped UI');

  const lost = route => route.abort('failed');
  await page.route('**/api/arms/left/robot/movej', lost);
  await submit().click(); await phase().filter({ hasText: '结果待确认' }).waitFor();
  await page.waitForTimeout(2600);
  assert.equal(await submit().isDisabled(), true);
  assert.match(await phase().innerText(), /结果待确认/);
  await left.getByRole('button', { name: '停止左臂', exact: true }).click(); await stopped();
  assert.equal(await submit().isDisabled(), false);
  await page.unroute('**/api/arms/left/robot/movej', lost);
  checks.push('Lost request remains unknown and locked past the former timeout; an acknowledged stop fence restores control');

  let acceptedId;
  const lostResponse = async route => {
    const response = await route.fetch(); const payload = await response.json();
    assert.equal(payload.success, true); acceptedId = payload.data.command.command_id;
    await route.abort('failed');
  };
  await page.route('**/api/arms/left/robot/movej', lostResponse);
  await page.getByRole('spinbutton', { name: 'J1', exact: true }).fill('1');
  await submit().click(); await phase().filter({ hasText: '反馈已到位' }).waitFor();
  assert.ok(acceptedId); assert.equal(await submit().isDisabled(), false);
  await page.unroute('**/api/arms/left/robot/movej', lostResponse);
  checks.push('MoveJ really accepted but HTTP response lost: App command record recovers completion without resending');

  let rollback = false, frozen = false, cached;
  const stateRoute = async route => {
    const response = await route.fetch(), payload = await response.json();
    if (frozen) payload.data = cached ?? (cached = payload.data);
    if (rollback) payload.data.timestamp -= 3600;
    await route.fulfill({ response, json: payload });
  };
  await page.route('**/api/arms/left/robot/state', stateRoute);
  rollback = true;
  await page.getByRole('spinbutton', { name: 'J1', exact: true }).fill('0.5');
  await submit().click(); await phase().filter({ hasText: '反馈已到位' }).waitFor();
  assert.equal(await submit().isDisabled(), false);
  frozen = true;
  await page.waitForFunction(() => document.querySelector('.arm-summary.left .machine-state b')?.textContent === '—');
  assert.equal(await submit().isDisabled(), true);
  frozen = false;
  await page.waitForFunction(() => document.querySelector('.arm-summary.left .machine-state b')?.textContent === 'STOPPED');
  checks.push('Wall-clock rollback does not freeze motion; a genuinely frozen sequence locks controls and recovers');

  await page.getByRole('button', { name: '坐标与负载', exact: true }).click();
  const frames = page.locator('.live-configuration .settings-panel').first();
  await frames.getByRole('textbox', { name: '名称', exact: true }).fill('audit_probe');
  await frames.getByRole('button', { name: '应用坐标定义', exact: true }).click();
  await frames.getByRole('button', { name: 'audit_probe', exact: true }).waitFor();
  await page.getByRole('button', { name: '工具与标定', exact: true }).click();
  await page.getByRole('combobox', { name: '标定工具', exact: true }).selectOption('audit_probe');
  await page.getByRole('spinbutton', { name: '最大允许误差', exact: true }).fill('2');
  for (let index = 0; index < 4; index++) await page.locator('.live-configuration .sample-row').nth(index).getByRole('button').click();
  await page.locator('.live-configuration .calibration>.panel-title').filter({ hasText: '4 / 6' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '工具与标定', exact: true }).click();
  await page.locator('.live-configuration .calibration>.panel-title').filter({ hasText: '4 / 6' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: '标定工具', exact: true }).inputValue(), 'audit_probe');
  assert.equal(await page.getByRole('spinbutton', { name: '最大允许误差', exact: true }).inputValue(), '2');
  assert.equal(await page.locator('.live-configuration .sample-row').nth(4).getByRole('button').isDisabled(), false);
  checks.push('Browser reload verifies the real lease and restores four real server samples, selected tool and tolerance');

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `/tmp/dualarm-command-recovery-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: 'Real isolated App + MuJoCo only; production ports and masters unchanged', checks, errors };
  fs.writeFileSync('/tmp/dualarm-command-recovery-browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: '/tmp/dualarm-command-recovery-failure.png', fullPage: true });
  console.error(JSON.stringify({ checks, errors, failure: error.message }));
  throw error;
} finally { await browser.close(); }
