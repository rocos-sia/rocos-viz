import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
const output = mkdtempSync(join(tmpdir(), 'rocos-dual-log-test-'));
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs', '--skipLibCheck', '--outDir', output, 'src/dualarm/logs/client.ts']);
const { DualArmLogClient, diagnosticsOrigin, parseEvent, appendEvents } = createRequire(import.meta.url)(join(output, 'client.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const event = id => ({ id: `test:${id}`, timestamp: '2026-11-17T09:41:20.123Z', level: 'info', module: 'Robot', message: 'ready', code: null, arm: 'left', ecat_id: 0, device_id: 'left-device', category: 'log', operation: null });
test('diagnostics endpoints reject credentials, paths and non-http schemes', () => {
  assert.equal(diagnosticsOrigin('http://localhost:8082/'), 'http://localhost:8082');
  for (const url of ['file:///tmp/log', 'http://user:secret@host', 'http://host/api', 'http://host?token=a', 'http://host/#a']) assert.throws(() => diagnosticsOrigin(url));
});
test('new log contract validates attribution and bounds/deduplicates history', () => {
  assert.equal(parseEvent(event(1)).arm, 'left');
  assert.throws(() => parseEvent({ ...event(1), arm: 'wrong' }));
  assert.throws(() => parseEvent({ ...event(1), timestamp: 'invalid' }));
  assert.throws(() => parseEvent({ ...event(1), operation: {} }));
  const data = appendEvents([event(0)], [...Array.from({ length: 1100 }, (_, i) => event(i)), event(1099)]);
  assert.equal(data.length, 1000); assert.equal(data[0].id, 'test:100'); assert.equal(data.at(-1).id, 'test:1099');
});
test('history requests omit credentials, validate failure, and preserve cancellation', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const abort = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8082/api/dualarm/logs?limit=100');
    assert.equal(options.credentials, 'omit'); assert.equal(options.signal, abort.signal); assert.equal(options.headers, undefined);
    return Response.json({ success: true, data: { events: [event(1)], next_id: 'test:1', gap: null, has_more: false } });
  };
  const client = new DualArmLogClient('http://localhost:8082');
  assert.equal((await client.history(abort.signal)).events.length, 1);
  globalThis.fetch = async () => new Response('', { status: 429 });
  await assert.rejects(client.history(abort.signal), /HTTP 429/);
  globalThis.fetch = async () => Response.json({ success: false });
  await assert.rejects(client.history(abort.signal), /invalid_response/);
});
test('file preview limits memory, cancels unread bytes, rejects JSON errors', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(300000))); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/plain', 'X-Rocos-Log-Snapshot-Time': 'now' } });
  const client = new DualArmLogClient('http://localhost:8082');
  const data = await client.preview(new AbortController().signal);
  assert.equal(data.text.length, 256 * 1024); assert.equal(data.truncated, true); assert.equal(cancelled, true); assert.equal(data.timestamp, 'now');
  globalThis.fetch = async () => Response.json({ success: false });
  await assert.rejects(client.preview(new AbortController().signal), /invalid_file/);
});
