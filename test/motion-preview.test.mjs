import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-preview-test-'));
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs', '--skipLibCheck',
  '--outDir', output, 'src/core/MotionPreview.ts', 'src/core/RobotApiClient.ts']);
const require = createRequire(import.meta.url);
const { validateMotionPreview, previewEndState, previewPositionsAt } = require(join(output, 'MotionPreview.js'));
const { RobotApiClient } = require(join(output, 'RobotApiClient.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const pose = { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
const trajectory = () => ({ motion_type: 'MoveJ', joint_names: ['joint_1'], duration: 2,
  points: [{ time_from_start: 0, positions: [0], flange: pose }, { time_from_start: 2, positions: [1], flange: pose }],
  checks: ['joint_position', 'joint_velocity', 'kinematics'], collision_checked: false, execution_checked: false });

test('preview POST sends no control credentials and never falls back to a real motion command', async () => {
  const calls = [];
  globalThis.window = { location: { origin: 'http://localhost:5188', protocol: 'http:' } };
  globalThis.sessionStorage = { getItem: () => null };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, code: 0, data: trajectory() }));
  };
  try {
    const client = new RobotApiClient('localhost', 8080);
    const controller = new AbortController();
    await client.previewMotion({ motion_type: 'MoveJ', start_joints: [0], joints: [1], velocity: 1, acceleration: 2, jerk: 10 }, controller.signal);
    assert.equal(calls[0].options.method, 'POST');
    assert.ok(calls[0].url.endsWith('/api/robot/motion/preview'));
    assert.equal(calls[0].options.headers['X-Rocos-Control-Token'], undefined);
    assert.equal(calls[0].options.headers['X-Rocos-Client-Id'], undefined);
    assert.equal(calls[0].options.signal, controller.signal);
    await assert.rejects(client.moveJ([1]), /No control right/);
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, code: -2308, message: 'Position limit' }));
    await assert.rejects(client.previewMotion({}), /Position limit/);
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('validates ordering, dimensions, completeness and finite poses', () => {
  assert.equal(validateMotionPreview(trajectory(), ['joint_1']).duration, 2);
  for (const change of [
    t => t.joint_names.reverse().push('extra'), t => t.points[1].positions = [],
    t => t.points[1].time_from_start = 0, t => t.duration = 3,
    t => t.points[0].time_from_start = 0.1, t => t.points[1].positions[0] = NaN,
    t => t.points[1].flange.orientation.w = 0,
  ]) {
    const value = structuredClone(trajectory()); change(value);
    assert.throws(() => validateMotionPreview(value, ['joint_1']));
  }
});

test('virtual endpoint never overwrites actual state; playback interpolates by time', () => {
  const live = { joint_states: [{ name: 'joint_1', position: 0 }], flange: pose, tcp: pose, hw_state: {} };
  const result = previewEndState(live, trajectory());
  assert.equal(live.joint_states[0].position, 0);
  assert.equal(result.joint_states[0].position, 1);
  assert.equal(result.tcp, undefined);
  assert.deepEqual(previewPositionsAt(trajectory(), 1), [0.5]);
  assert.deepEqual(previewPositionsAt(trajectory(), -1), [0]);
  assert.deepEqual(previewPositionsAt(trajectory(), 9), [1]);
});
