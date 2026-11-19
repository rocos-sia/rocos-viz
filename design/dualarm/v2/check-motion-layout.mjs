import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const origin = process.env.DUALARM_PREVIEW_URL || 'http://127.0.0.1:5186';
const read = async path => (await (await fetch(`${origin}${path}`)).json()).data;
const [info, model, left, right] = await Promise.all([
  read('/api/arms'), read('/api/workcell/model'),
  read('/api/arms/left/robot/state'), read('/api/arms/right/robot/state'),
]);
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], checks = [], metrics = [];
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 768 ? 1024 : 900 } });
    page.on('pageerror', error => errors.push(error.message));
    const states = { left: structuredClone(left), right: structuredClone(right) };
    const owners = {}, requests = [];
    let rejected = false, sequence = 0;
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const reply = (data, success = true, code = 0) => route.fulfill({ json: { data, success, code,
        message: success ? 'ok' : 'Position limit rejected (fixture)', },
      headers: { 'X-Rocos-Request-Id': 'layout-fixture' } });
      if (path === '/api/arms') return reply(info);
      if (path === '/api/workcell/model') return reply(model);
      if (path.startsWith('/api/workcell/urdf')) return route.continue();
      if (path === '/api/dualarm/logs') return reply({ events: [], next_id: '', has_more: false, gap: null });
      if (path === '/api/dualarm/logs/stream') return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      const match = path.match(/^\/api\/arms\/(left|right)\/(.+)$/);
      if (!match) return route.abort();
      const [, side, operation] = match, state = states[side];
      const tracking = () => ({ instance_id: state.instance_id, motion_epoch: state.motion_epoch, state_seq: state.state_seq, command_protocol: 1, command: state.command });
      if (operation === 'control/acquire') {
        owners[side] = request.postDataJSON().client_id;
        return reply({ ...tracking(), token: `${side}-fixture`, has_owner: true, owner_client_id: owners[side] });
      }
      if (operation.startsWith('control/')) return reply({ ...tracking(), has_owner: !!owners[side], owner_client_id: owners[side] || '' });
      if (operation === 'robot/state') {
        const wide = ++sequence % 2 === 0;
        state.timestamp = Date.now();
        state.state_seq++;
        state.robot_state ||= 'STOPPED';
        state.is_enabled = true;
        state.joint_states.forEach(joint => { joint.position = wide ? -1.7123456 : .00001; });
        state.flange.position.x = wide ? -1.123456 : .000001;
        return reply(state);
      }
      if (request.method() === 'GET') {
        if (operation.endsWith('tool_frames') || operation.endsWith('object_frames')) return reply({ names: [] });
        if (operation.endsWith('load_params')) return reply({ valid: true, mass: 0, com: [0, 0, 0] });
        return reply({});
      }
      assert.equal(request.method(), 'POST');
      requests.push({ side, operation, body: request.postDataJSON(), headers: request.headers() });
      if (operation === 'robot/jog/stop' || operation === 'robot/stop') { state.robot_state = 'STOPPED'; state.motion_busy = false; state.motion_epoch++; }
      else if (operation.startsWith('robot/jog/')) { state.robot_state = 'JOGGING'; state.motion_busy = true; }
      else if (/robot\/move/.test(operation)) { state.command = { command_id: request.postDataJSON().command_id, motion_epoch: state.motion_epoch, status: rejected ? 'rejected' : 'finished' }; return reply(tracking(), !rejected, rejected ? -2308 : 0); }
      return reply(tracking());
    });
    for (const state of Object.values(states)) { state.robot_state = 'STOPPED'; state.motion_busy = false; }
    await page.goto(`${origin}/?base=shoulder`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.arm-summary.left').getByRole('button', { name: '申请控制权', exact: true }).click();
    const jog = page.getByRole('button', { name: '左臂 J7 正向点动', exact: true });
    await jog.waitFor({ state: 'visible' });
    await jog.scrollIntoViewIfNeeded();
    const before = await jog.boundingBox();
    const position = () => page.evaluate(() => ({ window: scrollY, control: document.querySelector('.control-panel').scrollTop,
      feedback: document.querySelector('.feedback-scroll').scrollLeft,
      columns: [...document.querySelectorAll('.feedback-table thead th')].map(cell => cell.getBoundingClientRect().width) }));
    const scrollBefore = await position();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    for (let sample = 0; sample < 6; sample++) {
      await page.waitForTimeout(120);
      assert.deepEqual(await jog.boundingBox(), before, `${width}: held button moved`);
      assert.deepEqual(await position(), scrollBefore, `${width}: feedback changed scroll/columns`);
    }
    await page.mouse.up();
    await page.waitForTimeout(180);
    assert.deepEqual(await jog.boundingBox(), before, `${width}: release moved button`);
    const headingGap = await page.evaluate(() => document.querySelector('.teach-grid').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().bottom);
    assert.ok(headingGap <= 2, `${width}: empty heading gap ${headingGap}`);
    await page.getByRole('button', { name: '精确运动', exact: true }).click();
    await page.getByRole('button', { name: '填入当前反馈', exact: true }).click();
    await page.locator('.target-grid input').first().fill('12.5');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.target-grid input').first().inputValue(), '12.5');
    await page.getByRole('button', { name: '下发左臂 MOVEJ', exact: true }).click();
    await page.waitForTimeout(150);
    const movej = requests.find(request => request.operation === 'robot/movej');
    assert.ok(movej); assert.ok(Math.abs(movej.body.joints[0] - 12.5 * Math.PI / 180) < 1e-10);
    assert.equal(movej.headers['x-rocos-control-token'], 'left-fixture');
    await page.locator('.control-panel select').first().selectOption('movej_ik');
    await page.getByRole('button', { name: '填入当前位姿', exact: true }).click();
    const poseValues = await page.locator('.pose-grid input').evaluateAll(inputs => inputs.map(input => Number(input.value)));
    await page.getByRole('button', { name: '下发左臂 MOVEJ_IK', exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(requests.find(request => request.operation === 'robot/movej_ik').body.pose.position.x, poseValues[0] / 1000);
    await page.locator('.control-panel select').first().selectOption('movel');
    await page.getByRole('button', { name: '填入当前位姿', exact: true }).click();
    await page.getByRole('button', { name: '下发左臂 MOVEL', exact: true }).click();
    await page.waitForTimeout(150);
    assert.ok(requests.some(request => request.operation === 'robot/movel'));
    await page.locator('.control-panel select').first().selectOption('movel_fk');
    await page.getByRole('button', { name: '填入当前反馈', exact: true }).click();
    rejected = true;
    await page.getByRole('button', { name: '下发左臂 MOVEL_FK', exact: true }).click();
    await page.waitForTimeout(200);
    assert.match(await page.locator('.operation-status').innerText(), /-2308/);
    assert.equal(requests.filter(request => request.operation === 'robot/movel_fk').length, 1);
    assert.ok(requests.every(request => request.side === 'left'));
    await page.getByRole('button', { name: '点动控制', exact: true }).click();
    await page.evaluate(() => scrollTo(0, 0));
    const extent = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      headingGap: document.querySelector('.teach-grid').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().bottom }));
    assert.ok(extent.scroll <= extent.width);
    metrics.push(extent);
    await page.screenshot({ path: `/tmp/dualarm-fixed-${width}.png`, fullPage: true });
    checks.push(`${width}px: stable held jog/scroll/feedback widths; four precise routes; persistent edits; per-arm business failure`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  const report = { checks, metrics, errors, fixture: 'All control writes intercepted; no live movement sent' };
  fs.writeFileSync('/tmp/dualarm-motion-layout.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
