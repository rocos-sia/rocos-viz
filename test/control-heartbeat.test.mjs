import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-control-test-'));
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs',
  '--skipLibCheck', '--outDir', output, 'src/core/ControlHeartbeat.ts', 'src/core/RobotApiClient.ts']);
const require = createRequire(import.meta.url);
const { startControlHeartbeat } = require(join(output, 'ControlHeartbeat.js'));
const { RobotApiClient } = require(join(output, 'RobotApiClient.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const success = { success: true, code: 0, message: 'ok', data: { heartbeat_interval_seconds: 0.01 } };

test('heartbeat carries both credentials; status is read-only; tokens are tab-scoped', async () => {
  const calls = [];
  globalThis.window = { location: { origin: 'http://localhost:5184', protocol: 'http:' } };
  globalThis.sessionStorage = {
    getItem: (key) => key === 'rocos_client_id' ? 'this-tab' : JSON.stringify({ state: { controlToken: 'this-token' } }),
  };
  globalThis.localStorage = { getItem: () => JSON.stringify({ state: { controlToken: 'other-tab-token' } }) };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => success };
  };
  try {
    const client = new RobotApiClient('127.0.0.1', 8080);
    assert.equal(RobotApiClient.getStoredToken(), 'this-token');
    await client.heartbeatControl('captured-token');
    assert.equal(calls[0].options.headers['X-Rocos-Control-Token'], 'captured-token');
    assert.equal(calls[0].options.headers['X-Rocos-Client-Id'], 'this-tab');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.body, '{}');
    await client.getControlStatus();
    assert.equal(calls[1].options.headers['X-Rocos-Control-Token'], undefined);
    assert.ok(calls[0].url.endsWith('/api/control/heartbeat'));
    globalThis.sessionStorage = { getItem: () => null };
    await assert.rejects(client.enable(), /No control right/);
    assert.equal(calls.length, 2, 'A robot command was sent after ownership was cleared');
  } finally { globalThis.fetch = oldFetch; }
});

test('renews periodically without commands and stops after cleanup', async (t) => {
  let count = 0;
  const stop = startControlHeartbeat({ heartbeat: async () => { count++; return success; }, onRejected: assert.fail });
  t.after(stop);
  await sleep(65);
  assert.ok(count >= 3);
  stop();
  const stoppedCount = count;
  await sleep(35);
  assert.equal(count, stoppedCount);
});

test('rejection clears ownership once and never reacquires or takes over', async (t) => {
  let calls = 0;
  let rejections = 0;
  const stop = startControlHeartbeat({
    heartbeat: async () => { calls++; return { ...success, success: false, code: 3007 }; },
    onRejected: () => rejections++, intervalMs: 5,
  });
  t.after(stop);
  await sleep(40);
  assert.equal(calls, 1);
  assert.equal(rejections, 1);
});

test('slow requests never overlap', async (t) => {
  let concurrent = 0;
  let maximum = 0;
  const stop = startControlHeartbeat({
    heartbeat: async () => {
      maximum = Math.max(maximum, ++concurrent);
      await sleep(25);
      concurrent--;
      return success;
    }, onRejected: assert.fail, intervalMs: 5,
  });
  t.after(stop);
  await sleep(100);
  assert.equal(maximum, 1);
});

test('cleanup aborts pending work and ignores a late rejection', async () => {
  let resolve;
  let signal;
  let rejected = false;
  const stop = startControlHeartbeat({
    heartbeat: (requestSignal) => { signal = requestSignal; return new Promise((done) => { resolve = done; }); },
    onRejected: () => { rejected = true; },
  });
  stop();
  assert.equal(signal.aborted, true);
  resolve({ ...success, success: false, code: 3007 });
  await sleep(10);
  assert.equal(rejected, false);
});

test('transient failures retry; a hung request is aborted', async (t) => {
  let calls = 0;
  let errors = 0;
  const stop = startControlHeartbeat({
    heartbeat: (signal) => {
      calls++;
      if (calls === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout'))));
      return Promise.resolve(success);
    }, onRejected: assert.fail, onError: () => errors++, intervalMs: 5, requestTimeoutMs: 10,
  });
  t.after(stop);
  await sleep(65);
  assert.equal(errors, 1);
  assert.ok(calls >= 2);
});
