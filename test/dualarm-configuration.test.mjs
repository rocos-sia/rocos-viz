import test from 'node:test';
import assert from 'node:assert/strict';
import { DualArmControl } from '../src/dualarm/control/live.mjs';

const pose = { position: { x: 0, y: 0, z: .1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
function fixture() {
  const calls = [], patches = [], errors = [], captured = Array(6).fill(null);
  let result = null;
  const client = new DualArmControl({ storage: null, onArm: (side, patch) => patches.push({ side, ...patch }), onError: (side, error) => errors.push({ side, ...error }), fetcher: async (path, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, body, headers: options.headers });
    let data = {};
    if (path.endsWith('/tool_frames')) data = { names: ['probe'], file_path: 'left.yaml' };
    if (path.endsWith('/object_frames')) data = { names: [] };
    if (path.endsWith('/load_params')) data = { valid: true, mass: 1, com: [.01, 0, 0] };
    if (path.includes('/tool_frame?')) data = { name: 'probe', frame: pose, package: { digest: 'original', revision: 2, mount: pose } };
    if (path.endsWith('/calibration/pose')) { captured[body.index - 1] = { flange: pose }; result = null; }
    if (path.endsWith('/calibration/run')) result = { pose, metrics: { max_error: .00001 } };
    if (path.includes('/calibration/')) data = { session_id: 'left-session', name: 'probe', samples: captured, captured: captured.filter(Boolean).length, result, package_digest: 'original', package_revision: 2 };
    return new Response(JSON.stringify({ success: true, data }));
  } });
  for (const side of ['left', 'right']) Object.assign(client.session(side), { token: `${side}-token`, verified: true, updated: client.clock(), instanceId: 'test-app', state: { robot_state: 'STOPPED', motion_busy: false } });
  return { client, calls, patches, errors };
}

test('frame and payload writes require ownership, fresh idle feedback and preserve arm isolation', async () => {
  const { client, calls, errors } = fixture();
  try {
    const session = client.session('left');
    session.state.robot_state = 'RUNNING';
    assert.equal(await client.configuration.write('left', 'robot/tool_frame', { name: 'probe', frame: pose }), null);
    assert.equal(calls.length, 0);
    session.state.robot_state = 'STOPPED';
    session.verified = false;
    assert.equal(await client.configuration.write('left', 'robot/load_params', { mass: 1, com: [0, 0, 0] }), null);
    session.verified = true;
    assert.ok(await client.configuration.write('left', 'robot/tool_frame', { name: 'probe', frame: pose }));
    assert.ok(await client.configuration.write('left', 'robot/load_params', { mass: 1, com: [.01, 0, 0] }));
    const writes = calls.filter(call => call.body);
    assert.ok(writes.every(call => call.path.startsWith('/api/arms/left/')));
    assert.ok(writes.every(call => call.headers['X-Rocos-Control-Token'] === 'left-token'));
    assert.equal(client.session('right').token, 'right-token');
    assert.ok(errors.length >= 2);
    assert.equal(client.session('left').configuration.tools.probe.package.digest, 'original');
  } finally { client.close(); }
});

test('six-point calibration sends only sampling commands, tolerance in metres and session-only save', async () => {
  const { client, calls } = fixture();
  try {
    for (let index = 1; index <= 6; index++) await client.configuration.write('left', 'calibration/pose', { name: 'probe', index, ...(index > 1 ? { session_id: 'left-session' } : {}) });
    assert.equal(client.session('left').calibration.captured, 6);
    await client.configuration.write('left', 'calibration/run', { session_id: 'left-session', max_error: .001 });
    await client.configuration.write('left', 'calibration/save', { session_id: 'left-session' });
    const samples = calls.filter(call => call.path.endsWith('/calibration/pose'));
    assert.ok(samples.every(call => !('pose' in call.body) && !('flange' in call.body) && !('joints' in call.body)));
    assert.deepEqual(calls.find(call => call.path.endsWith('/calibration/save')).body, { session_id: 'left-session' });
    assert.ok(!calls.some(call => call.path.endsWith('/active_tool_frame')));
    await client.configuration.write('left', 'calibration/pose', { name: 'probe', index: 2, session_id: 'left-session' });
    assert.equal(client.session('left').calibration.result, null);
    client.forget('left');
    assert.equal(client.session('left').calibration, null);
  } finally { client.close(); }
});
