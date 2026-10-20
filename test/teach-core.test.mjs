import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-teach-test-'));
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs', '--skipLibCheck', '--outDir', output, 'src/core/HeldJog.ts', 'src/core/TelemetryBuffer.ts']);
const require = createRequire(import.meta.url);
const { startHeldJog } = require(join(output, 'HeldJog.js'));
const { TelemetryBuffer } = require(join(output, 'TelemetryBuffer.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('release stops immediately and stops again after a late feed completes', async () => {
  let resolveFeed;
  let feeds = 0;
  let stops = 0;
  const cancel = startHeldJog({ feed: () => { feeds++; return new Promise((r) => { resolveFeed = r; }); }, stop: async () => { stops++; }, intervalMs: 1 });
  cancel();
  assert.equal(stops, 1);
  resolveFeed();
  await sleep(20);
  assert.equal(stops, 2);
  assert.equal(feeds, 1);
});

test('held jog serializes feeds and cancellation prevents future requests', async () => {
  let active = 0;
  let maximum = 0;
  let feeds = 0;
  const cancel = startHeldJog({ feed: async () => { feeds++; maximum = Math.max(maximum, ++active); await sleep(10); active--; }, stop: async () => {}, intervalMs: 1 });
  await sleep(45);
  cancel();
  const count = feeds;
  await sleep(25);
  assert.equal(maximum, 1);
  assert.equal(feeds, count);
  assert.ok(feeds >= 2);
});

test('failed jog stops and does not automatically retry movement', async () => {
  let feeds = 0, errors = 0, stops = 0;
  startHeldJog({ feed: async () => { feeds++; throw new Error('offline'); }, stop: async () => { stops++; }, intervalMs: 1, onError: () => { errors++; } });
  await sleep(20);
  assert.deepEqual([feeds, errors, stops], [1, 1, 1]);
});

test('telemetry ring keeps bounded raw samples in order with explicit invalid gaps', () => {
  const buffer = new TelemetryBuffer(3, 100);
  [0, 10, 20, 30].forEach((time) => buffer.appendFrame(time, { j1: time === 20 ? NaN : time }));
  buffer.appendFrame(30, { j1: 999 });
  assert.deepEqual(buffer.read('j1'), [{ timestamp: 10, value: 10 }, { timestamp: 20, value: null }, { timestamp: 30, value: 30 }]);
  assert.deepEqual(buffer.read('j1', 5), [{ timestamp: 30, value: 30 }]);
  buffer.appendFrame(200, { j1: 2 });
  assert.deepEqual(buffer.read('j1'), [{ timestamp: 200, value: 2 }]);
  buffer.appendFrame(1, { j1: 1 });
  assert.deepEqual(buffer.read('j1'), [{ timestamp: 1, value: 1 }]);
  buffer.clear();
  assert.deepEqual(buffer.read('j1'), []);
});

test('16 channels at 50 Hz retain ten minutes without unbounded growth', () => {
  const buffer = new TelemetryBuffer();
  for (let i = 0; i < 31000; i++) buffer.appendFrame(i * 20, Object.fromEntries(Array.from({ length: 16 }, (_, j) => [`j${j}`, i + j])));
  for (let j = 0; j < 16; j++) {
    const points = buffer.read(`j${j}`);
    assert.equal(points.length, 30000);
    assert.equal(points[0].timestamp, 20000);
    assert.equal(points.at(-1).value, 30999 + j);
  }
});
