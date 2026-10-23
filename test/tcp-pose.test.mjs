import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-tcp-test-'));
symlinkSync(join(process.cwd(), 'node_modules'), join(output, 'node_modules'), 'dir');
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs', '--skipLibCheck', '--outDir', output,
  'src/core/RobotApiClient.ts', 'src/core/RobotWebSocket.ts', 'src/core/DisplayPose.ts']);
const require = createRequire(import.meta.url);
const { RobotApiClient } = require(join(output, 'RobotApiClient.js'));
const { RobotWebSocket } = require(join(output, 'RobotWebSocket.js'));
const { preciseReference, preciseCurrentPose, preciseTarget } = require(join(output, 'PreciseMotion.js'));
const { displayPose } = require(join(output, 'DisplayPose.js'));
const { FRAME } = require(join(output, 'constants.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const pose = (x, y, z) => ({ position: { x, y, z }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const flange = { ...pose(1, 2, 3), orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } };
const base = { joint_states: [], flange, active_tool_frame_name: 'tool1', active_tool_frame: pose(0.01, 0, 0) };

function mockClient(t, fetch) {
  const original = { window: globalThis.window, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage };
  Object.assign(globalThis, { window: { location: { origin: 'http://localhost:5173', protocol: 'http:' } }, fetch,
    sessionStorage: { getItem: () => assert.fail('TCP and state reads must not request control credentials') } });
  t.after(() => Object.assign(globalThis, original));
  return new RobotApiClient('127.0.0.1', 8080);
}
const response = (data) => new Response(JSON.stringify({ success: true, code: 0, message: 'ok', data }));

test('TCP display and precise reference use the backend pose without applying the offset twice', () => {
  const state = { ...base, tcp: pose(4, 5, 6) };
  assert.deepEqual(preciseReference(FRAME.TOOL, state), state.tcp);
  displayPose(FRAME.TOOL, state).forEach((n, i) => assert.ok(Math.abs(n - [4, 5, 6, 0, 0, 0][i]) < 1e-12));
  assert.deepEqual(preciseReference(FRAME.FLANGE, state), flange);
  const target = preciseTarget(preciseCurrentPose(FRAME.TOOL, state), preciseReference(FRAME.TOOL, state));
  [target.position.x, target.position.y, target.position.z].forEach((n, i) => assert.ok(Math.abs(n - (i + 1)) < 1e-12));
});

test('explicitly unavailable or invalid TCP is not replaced with a locally calculated pose', () => {
  for (const tcp of [null, { ...pose(0, 0, 0), orientation: { x: 0, y: 0, z: 0, w: 0 } }, pose(NaN, 0, 0)]) {
    assert.equal(preciseReference(FRAME.TOOL, { ...base, tcp }), null);
    assert.equal(displayPose(FRAME.TOOL, { ...base, tcp }), null);
  }
});

test('legacy states still compose rotated offsets and new states without a tool use the flange TCP', () => {
  const legacy = preciseReference(FRAME.TOOL, base);
  assert.ok(Math.abs(legacy.position.x - 1) < 1e-12);
  assert.ok(Math.abs(legacy.position.y - 2.01) < 1e-12);
  assert.deepEqual(preciseReference(FRAME.TOOL, { joint_states: [], flange, tcp: flange }), flange);
  assert.deepEqual(preciseReference(FRAME.TOOL, { joint_states: [], flange }), flange);
});

test('TCP query encodes tool names, is read only and passes cancellation through', async (t) => {
  const signal = new AbortController().signal;
  const client = mockClient(t, async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/robot/tcp');
    assert.equal(new URL(url).searchParams.get('name'), 'tool.+-1');
    assert.equal(options.method, 'GET');
    assert.equal(options.signal, signal);
    assert.equal(options.headers['X-Rocos-Control-Token'], undefined);
    assert.equal(options.headers['X-Rocos-Client-Id'], undefined);
    return response({ pose: flange, reference_frame: 'base' });
  });
  assert.deepEqual(await client.getTcpPose('tool.+-1', signal), { pose: flange, reference_frame: 'base' });
});

test('HTTP state parsing preserves TCP null, valid poses and legacy absence', async (t) => {
  let raw;
  const client = mockClient(t, async () => response(raw));
  for (const tcp of [pose(4, 5, 6), null, undefined]) {
    raw = { ...base, tcp };
    assert.deepEqual((await client.getRobotState()).tcp, tcp);
  }
  raw = { joint_states: [], tcp: null };
  assert.equal((await client.getRobotState()).flange, undefined);
});

test('WebSocket state parsing preserves the same TCP contract as HTTP', (t) => {
  const original = { window: globalThis.window, WebSocket: globalThis.WebSocket };
  let socket;
  class FakeSocket {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0;
    constructor() { socket = this; }
    close() { this.readyState = 3; }
  }
  Object.assign(globalThis, { window: { location: { protocol: 'http:', host: 'localhost' } }, WebSocket: FakeSocket });
  const client = new RobotWebSocket();
  let received;
  t.after(() => { client.disconnect(); Object.assign(globalThis, original); });
  client.connect('127.0.0.1', 8080, (state) => { received = state; });
  for (const tcp of [pose(4, 5, 6), null, undefined]) {
    socket.onmessage({ data: JSON.stringify({ ...base, tcp }) });
    assert.deepEqual(received.tcp, tcp);
  }
  socket.onmessage({ data: JSON.stringify({ joint_states: [], tcp: null }) });
  assert.equal(received.flange, undefined);
});
