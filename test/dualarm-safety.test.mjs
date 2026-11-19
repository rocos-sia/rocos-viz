import test from 'node:test';
import assert from 'node:assert/strict';
import { DualArmControl } from '../src/dualarm/control/live.mjs';
import { advanceMotion, motionLocked } from '../src/dualarm/control/motion.mjs';

const names = Array.from({ length: 7 }, (_, index) => `J${index + 1}`);
const pose = { position: { x: .1, y: .2, z: .3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
const input = { target: Array(7).fill(10), velocity: .1, acceleration: .3, jerk: 5 };
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };
const reply = (data = {}, success = true, code = 0) => new Response(JSON.stringify({ success, code, message: success ? 'ok' : 'rejected', data }));
const meta = (sequence = 1, epoch = 1, instance = 'app-A') => ({ instance_id: instance, motion_epoch: epoch, state_seq: sequence, command_protocol: 1 });
const feedback = (sequence, patch = {}) => ({ ...meta(sequence), timestamp: 1000 + sequence, robot_state: 'STOPPED', motion_busy: false, is_enabled: true, flange: pose, tcp: pose, joint_states: names.map(name => ({ name, position: 0, velocity: 0 })), ...patch });
function ready(client, side = 'left') {
  Object.assign(client.session(side), { token: `${side}-token`, verified: true, instanceId: 'app-A', epoch: 1, protocol: 1, state: feedback(1), updated: client.clock(), definition: { joint_names: names } });
}
function unknown() {
  return { commandId: 'motion-A', kind: 'movej', body: { joints: Array(7).fill(0) }, instanceId: 'app-A', epoch: 1, phase: 'unknown', afterSequence: 1 };
}

test('unknown outcomes stay locked at rest and at target, regardless of elapsed wall time', () => {
  let motion = unknown();
  for (let sequence = 2; sequence < 30; sequence++) motion = advanceMotion(motion, feedback(sequence), names, 10 ** 14);
  assert.equal(motion.phase, 'unknown');
  assert.equal(motionLocked(motion), true);
});

test('stop acknowledgement fences a delayed MoveJ response and requires fresh stationary samples', async () => {
  let accept;
  const delayed = new Promise(resolve => { accept = resolve; }), calls = [];
  const client = new DualArmControl({ storage: storage(), fetcher: async path => {
    calls.push(path);
    if (path.endsWith('/movej')) { await delayed; return reply(meta()); }
    return reply(meta(2, 2));
  } });
  try {
    ready(client);
    const move = client.move('left', 'movej', input);
    await client.stop('left');
    const session = client.session('left');
    assert.equal(session.motion.phase, 'stopping');
    assert.equal(session.motion.stopEpoch, 2);
    accept(); assert.equal(await move, true);
    assert.equal(session.motion.phase, 'stopping');
    assert.equal(await client.move('left', 'movej', input), false);
    for (let sequence = 3; sequence <= 5; sequence++) session.motion = advanceMotion(session.motion, feedback(sequence, { motion_epoch: 2 }), names);
    assert.equal(session.motion.phase, 'stopped');
    assert.equal(motionLocked(session.motion), false);
    assert.equal(session.epoch, 2); // A late epoch-1 response cannot roll it back.
    assert.deepEqual(calls, ['/api/arms/left/robot/movej', '/api/arms/left/robot/stop']);
  } finally { client.close(); }
});

test('unacknowledged or failed stop never unlocks an unknown request', async () => {
  const client = new DualArmControl({ storage: storage(), fetcher: async () => { throw new TypeError('offline'); } });
  try {
    ready(client); const session = client.session('left'); session.motion = unknown();
    await client.stop('left');
    for (let sequence = 2; sequence < 15; sequence++) session.motion = advanceMotion(session.motion, feedback(sequence), names);
    assert.equal(session.motion.phase, 'stopping'); assert.equal(motionLocked(session.motion), true);
  } finally { client.close(); }
});

test('a paused snapshot cannot erase a pending stop', () => {
  let motion = { ...unknown(), phase: 'stopping', stopEpoch: 2, stopInstance: 'app-A', stopAfterSequence: 1 };
  motion = advanceMotion(motion, feedback(2, { motion_epoch: 2, motion_busy: true, robot_state: 'PAUSED' }), names);
  assert.equal(motion.phase, 'stopping');
  for (let sequence = 3; sequence <= 5; sequence++) motion = advanceMotion(motion, feedback(sequence, { motion_epoch: 2 }), names);
  assert.equal(motion.phase, 'stopped');
});

test('known server outcome recovers a lost response, but foreign command results do not', () => {
  let motion = unknown();
  motion = advanceMotion(motion, feedback(2, { command: { command_id: 'other', motion_epoch: 1, status: 'finished' } }), names);
  assert.equal(motion.phase, 'unknown');
  for (let sequence = 3; sequence <= 5; sequence++) motion = advanceMotion(motion, feedback(sequence, { command: { command_id: 'motion-A', motion_epoch: 1, status: 'finished' } }), names);
  assert.equal(motion.phase, 'completed');
});

test('clock rollback cannot freeze motion tracking or bypass feedback freshness', async () => {
  let ticks = 100, snapshot = feedback(1);
  const client = new DualArmControl({ storage: null, clock: () => ticks, fetcher: async () => reply(snapshot) });
  const original = Date.now;
  try {
    ready(client); const session = client.session('left'); session.motion = unknown();
    for (let sequence = 2; sequence <= 4; sequence++) {
      Date.now = () => -(10 ** 10);
      ticks += 100;
      snapshot = feedback(sequence, { timestamp: 20 + sequence, command: { command_id: 'motion-A', motion_epoch: 1, status: 'finished' } });
      await client.poll('left');
    }
    assert.equal(session.motion.phase, 'completed'); assert.equal(client.fresh('left'), true);
    Date.now = () => 10 ** 14; ticks += 751;
    assert.equal(client.fresh('left'), false);
  } finally { Date.now = original; client.close(); }
});

test('App restart invalidates ownership and calibration without claiming motion completion', async () => {
  const patches = [], client = new DualArmControl({ storage: storage(), onArm: (_side, patch) => patches.push(patch), fetcher: async () => reply(feedback(1, { instance_id: 'app-B' })) });
  try {
    ready(client); const session = client.session('left'); session.motion = unknown();
    session.calibrationHandle = { session_id: 'six-A', name: 'probe', instance_id: 'app-A' };
    await client.poll('left');
    assert.equal(session.token, ''); assert.equal(session.verified, false);
    assert.equal(session.calibrationHandle, null); assert.equal(session.motion.phase, 'unknown');
    assert.equal(client.observeProtocol('left', meta(100, 99, 'app-A')), false);
    assert.equal(session.instanceId, 'app-B'); assert.ok(patches.some(patch => patch.owned === false));
  } finally { client.close(); }
});

test('refresh preserves an unresolved command and a stop fence; no cached motion is resent', () => {
  const saved = storage(), calls = [], first = new DualArmControl({ storage: saved }); ready(first);
  first.session('left').motion = { ...unknown(), phase: 'stopping', stopInstance: 'app-A', stopEpoch: 2, stopAfterSequence: 8 };
  first.persist('left'); first.close();
  const restored = new DualArmControl({ storage: saved, fetcher: async path => { calls.push(path); return reply(); } });
  try {
    assert.equal(restored.session('left').verified, false);
    assert.equal(restored.session('left').motion.phase, 'stopping');
    assert.equal(restored.session('left').motion.stopEpoch, 2);
    assert.deepEqual(calls, []);
  } finally { restored.close(); }
});

test('refresh restores four real calibration samples only after verifying the same lease and tool context', async () => {
  const saved = storage(), first = new DualArmControl({ storage: saved }); ready(first);
  const calibration = { session_id: 'six-A', name: 'probe', samples: Array(6).fill(null).map((_, index) => index < 4 ? { flange: pose } : null), captured: 4, result: null, saved: false, max_error: .002, package_digest: '', package_revision: 0 };
  first.session('left').calibrationHandle = { session_id: 'six-A', name: 'probe', instance_id: 'app-A' };
  first.configuration.remember('left', { tool: 'probe', tolerance: '2' }); first.close();
  const patches = [], client = new DualArmControl({ storage: saved, onArm: (_side, patch) => patches.push(patch), fetcher: async path => reply(path.includes('/calibration/result') ? calibration : {}) });
  try {
    const session = client.session('left');
    session.configuration = { tools: { probe: { frame: pose } } };
    await client.configuration.restore('left'); assert.equal(session.calibration, undefined);
    session.verified = true; session.instanceId = 'app-A';
    await client.configuration.restore('left');
    assert.equal(session.calibration.captured, 4); assert.equal(session.calibrationPreferences.tolerance, '2');
    assert.ok(patches.some(patch => patch.calibration?.captured === 4));
  } finally { client.close(); }
});

test('an expired calibration handle is cleared with an explicit error instead of fabricated samples', async () => {
  const client = new DualArmControl({ storage: storage(), fetcher: async () => reply(null, false, 4004) });
  try {
    ready(client); const session = client.session('left'); session.calibrationHandle = { session_id: 'expired', name: 'probe', instance_id: 'app-A' };
    await client.configuration.restore('left');
    assert.equal(session.calibrationHandle, null); assert.equal(session.calibration, null);
    assert.equal(session.error.operation, '恢复标定');
  } finally { client.close(); }
});

test('a recovered saved result gets its saved flag from App, never from browser storage', async () => {
  const patches = [], client = new DualArmControl({ storage: storage(), onArm: (_side, patch) => patches.push(patch), fetcher: async () => reply({ session_id: 'saved', name: 'probe', captured: 6, samples: [], result: { pose }, saved: true, max_error: .001, package_digest: '', package_revision: 0 }) });
  try {
    ready(client); const session = client.session('left');
    session.calibrationHandle = { session_id: 'saved', name: 'probe', instance_id: 'app-A' };
    session.configuration = { tools: { probe: { frame: pose } } };
    await client.configuration.restore('left');
    assert.ok(patches.some(patch => patch.calibrationSaved === true));
    assert.equal(session.calibrationPreferences.calculatedTolerance, '1');
  } finally { client.close(); }
});

test('an old in-flight credential rejection cannot revoke a new App control session', async () => {
  let rejectOld;
  const delayed = new Promise(resolve => { rejectOld = resolve; });
  const client = new DualArmControl({ storage: storage(), fetcher: async () => delayed });
  try {
    ready(client); const moving = client.move('left', 'movej', input), session = client.session('left');
    client.observeProtocol('left', meta(1, 1, 'app-B'));
    session.token = 'new-owner-token'; session.verified = true;
    rejectOld(new Response(JSON.stringify({ success: false, code: 3007, message: 'Invalid or missing control credentials for selected arm' })));
    await moving;
    assert.equal(session.token, 'new-owner-token'); assert.equal(session.verified, true);
    assert.equal(session.motion.phase, 'unknown');
    assert.equal(session.error.code, 'APP_RESTARTED');
  } finally { client.close(); }
});

test('a superseded configuration read defers calibration recovery without a false error', async () => {
  const errors = [], client = new DualArmControl({ storage: storage(), onError: (_side, error) => errors.push(error), fetcher: async () => reply({ session_id: 'six-A', name: 'probe' }) });
  try {
    ready(client); client.session('left').calibrationHandle = { session_id: 'six-A', name: 'probe', instance_id: 'app-A' };
    client.configuration.refresh = async () => null;
    await client.configuration.restore('left');
    assert.deepEqual(errors, []); assert.equal(client.session('left').calibrationHandle.session_id, 'six-A');
  } finally { client.close(); }
});
