import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-script-test-'));
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs',
  '--skipLibCheck', '--outDir', output, 'src/core/RobotApiClient.ts']);
const require = createRequire(import.meta.url);
const { RobotApiClient } = require(join(output, 'RobotApiClient.js'));
after(() => rmSync(output, { recursive: true, force: true }));

function mockClient(t, fetch, host = '127.0.0.1') {
  const previous = {
    window: globalThis.window,
    fetch: globalThis.fetch,
    sessionStorage: globalThis.sessionStorage,
  };
  globalThis.window = { location: { origin: 'http://localhost:5173', protocol: 'http:' } };
  globalThis.fetch = fetch;
  globalThis.sessionStorage = {
    getItem: () => assert.fail('Read-only script requests must not read control credentials'),
  };
  t.after(() => Object.assign(globalThis, previous));
  return new RobotApiClient(host, 8080);
}

test('lists relative script paths without requiring or sending control credentials', async (t) => {
  const data = { scripts: ['example.lua', 'examples/示例.lua'] };
  const client = mockClient(t, async (url, options) => {
    assert.equal(url, 'http://localhost:5173/api/script/list');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['X-Rocos-Control-Token'], undefined);
    assert.equal(options.headers['X-Rocos-Client-Id'], undefined);
    return new Response(JSON.stringify({ success: true, code: 0, message: 'ok', data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(await client.listScripts(), data);
});

test('supports an empty script list and reports business errors', async (t) => {
  let fail = false;
  const client = mockClient(t, async () => new Response(JSON.stringify(fail
    ? { success: false, code: 1004, message: 'Not implemented', data: null }
    : { success: true, code: 0, message: 'ok', data: { scripts: [] } })));
  assert.deepEqual(await client.listScripts(), { scripts: [] });
  fail = true;
  await assert.rejects(client.listScripts(), /Not implemented.*1004/);
});

test('downloads exact Lua text from a remote controller and encodes the filename', async (t) => {
  const filename = '示例/hello +#?&.lua';
  const source = '-- 原始 Lua 源码\nprint("hello")\n';
  const client = mockClient(t, async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'http://192.0.2.10:8080');
    assert.equal(parsed.pathname, '/api/script/download');
    assert.deepEqual([...parsed.searchParams.entries()], [['filename', filename]]);
    assert.equal(options.headers.Accept, 'text/plain');
    assert.equal(options.headers['X-Rocos-Control-Token'], undefined);
    assert.equal(options.headers['X-Rocos-Client-Id'], undefined);
    return new Response(source, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }, '192.0.2.10');
  assert.equal(await client.downloadScript(filename), source);
});

test('accepts an empty Lua source file', async (t) => {
  const client = mockClient(t, async () => new Response('', {
    headers: { 'Content-Type': 'text/plain' },
  }));
  assert.equal(await client.downloadScript('empty.lua'), '');
});

test('does not return an HTTP error page as Lua source', async (t) => {
  const client = mockClient(t, async () => new Response('Not found', { status: 404 }));
  await assert.rejects(client.downloadScript('missing.lua'), /HTTP 404/);
});

test('does not return a JSON business error as Lua source even with HTTP 200', async (t) => {
  const client = mockClient(t, async () => new Response(JSON.stringify({
    success: false, code: 1002, message: 'Script not found', data: null,
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
  await assert.rejects(client.downloadScript('missing.lua'), /Script not found.*1002/);
});

test('rejects an unexpected JSON success envelope instead of treating it as Lua', async (t) => {
  const client = mockClient(t, async () => new Response(JSON.stringify({
    success: true, code: 0, message: 'ok', data: {},
  }), { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(client.downloadScript('example.lua'), /expected Lua source/);
});
