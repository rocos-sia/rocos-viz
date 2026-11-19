import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMotion, motionLocked } from '../src/dualarm/control/motion.mjs';
import { DualArmControl } from '../src/dualarm/control/live.mjs';

const names = Array.from({ length: 7 }, (_, index) => `J${index + 1}`);
const pose = { position: { x: .1, y: .2, z: .3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
const state = (timestamp, position = 0, robot_state = 'STOPPED') => ({ timestamp, robot_state, is_enabled: true, motion_busy: robot_state === 'RUNNING', flange: pose, tcp: pose,
  joint_states: names.map(name => ({ name, position, velocity: 0 })) });
const motion = () => ({ kind: 'movej', body: { joints: Array(7).fill(.1) }, phase: 'waiting', afterTimestamp: 1, acceptedAt: Date.now() });

test('acceptance locks duplicate submissions per arm until post-acceptance feedback settles at target', async () => {
  const calls = [], client = new DualArmControl({ storage: null, fetcher: async path => { calls.push(path); return new Response(JSON.stringify({ success: true, data: {} })); } });
  try {
    for (const side of ['left', 'right']) Object.assign(client.session(side), { token: side, verified: true, state: state(1), updated: Date.now(), definition: { joint_names: names } });
    const input = { target: Array(7).fill(.1 * 180 / Math.PI), velocity: .1, acceleration: .3, jerk: 5 };
    assert.equal(await client.move('left', 'movej', input), true);
    assert.equal(await client.move('left', 'movej', input), false);
    assert.equal(client.startJog('left', 'joint', 0, 1, .1, 'BASE'), false);
    assert.equal(await client.move('right', 'movej', input), true);
    const session = client.session('left');
    session.motion = advanceMotion(session.motion, state(1, .1), names);
    assert.equal(session.motion.phase, 'waiting');
    for (let timestamp = 2; timestamp <= 4; timestamp++) session.motion = advanceMotion(session.motion, state(timestamp, .1), names);
    assert.equal(session.motion.phase, 'completed');
    assert.equal(motionLocked(session.motion), false);
    assert.equal(await client.move('left', 'movej', input), true);
    assert.equal(calls.filter(path => path.endsWith('left/robot/movej')).length, 2);
  } finally { client.close(); }
});

test('STOPPED alone is not completion; pause, faults and interrupted movement remain distinct', () => {
  let current = motion();
  current = advanceMotion(current, state(2, 0, 'RUNNING'), names);
  assert.equal(current.phase, 'running');
  current = advanceMotion(current, state(3, .02, 'PAUSED'), names);
  assert.equal(current.phase, 'paused');
  assert.equal(motionLocked(current), true);
  for (let timestamp = 4; timestamp <= 6; timestamp++) current = advanceMotion(current, state(timestamp, .02), names);
  assert.equal(current.phase, 'stopped');
  assert.ok(current.error.joint > .001);
  assert.equal(advanceMotion(motion(), state(2, 0, 'ERROR_STATE'), names).phase, 'failed');
  assert.equal(advanceMotion({ ...motion(), phase: 'unknown' }, state(2), names).phase, 'unknown');
});

test('repeating the same snapshot cannot count as three distinct stationary feedback samples', () => {
  let current = advanceMotion(motion(), state(2, .1), names);
  for (let repeat = 0; repeat < 5; repeat++) current = advanceMotion(current, state(2, .1), names);
  assert.equal(current.phase, 'waiting');
  assert.equal(current.quiet, 1);
  current = advanceMotion(current, state(3, .1), names);
  assert.equal(current.phase, 'waiting');
  assert.equal(advanceMotion(current, state(4, .1), names).phase, 'completed');
});

test('Cartesian verification checks orientation as well as translation, including quaternion sign', () => {
  let current = { ...motion(), kind: 'movel', body: { pose: { ...pose, orientation: { x: 0, y: 0, z: 0, w: -1 } } } };
  for (let timestamp = 2; timestamp <= 4; timestamp++) current = advanceMotion(current, state(timestamp), names);
  assert.equal(current.phase, 'completed');
  current = { ...motion(), kind: 'movej_ik', body: { pose: { ...pose, orientation: { x: 1, y: 0, z: 0, w: 0 } } } };
  assert.ok(advanceMotion(current, state(2), names).error.angle > 3);
});

test('successful recovery archives a connection error and leaves history separately visible', async () => {
  const patches = [], client = new DualArmControl({ storage: null, onArm: (_side, patch) => patches.push(patch) });
  try {
    client.error('left', '读取状态', new Error('Offline'));
    client.recover('left', '读取状态');
    assert.equal(client.session('left').error, null);
    assert.equal(patches.at(-1).error, null);
    assert.equal(patches.at(-1).lastError.recovered, true);
    assert.equal(patches.at(-1).lastError.message, 'Offline');
    const count = patches.length;
    client.recover('left', undefined);
    assert.equal(patches.length, count);
  } finally { client.close(); }
});
