import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-release-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
symlinkSync(resolve('node_modules'), join(output, 'node_modules'), 'dir');
execFileSync('node_modules/.bin/tsc', ['--target', 'ES2020', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', output, 'src/core/releases.ts']);
const require = createRequire(import.meta.url);
const { parseManifest, parseSnapshot, selectReleases, compareRelease, automaticCheckDue, fetchReleases, CHECK_INTERVAL, RETRY_INTERVAL } = require(join(output, 'releases.js'));
const root = 'https://github.com/rocos-sia/rocos-releases/releases';
const release = (version = '3.2.0-rc.2', component = 'app') => ({
  version, prerelease: version.includes('-'), source_repository: `rocos-sia/rocos-${component}`, tag: `v${version}`,
  published_at: '2026-10-28T10:00:00Z', release_url: `${root}/tag/${component}-v${version}`, notes: 'Release notes',
  compatibility: { api_version: '3.0.0', shm_abi_version: null },
  assets: [{ os: 'linux', arch: 'amd64', format: 'deb', size_bytes: 1234, sha256: 'a'.repeat(64), signature_url: null,
    url: `${root}/download/${component}-v${version}/rocos-${component}_${version}_amd64.deb` }],
});
const manifest = (channel = 'internal', app = release()) => ({ schema_version: 1, channel, updated_at: '2026-10-28T10:00:00Z', components: { app, viz: null, ecm: null } });

test('SemVer ordering handles numeric RCs, stable releases, metadata, missing versions and no downgrades', () => {
  assert.equal(compareRelease('3.2.0-rc.9', release('3.2.0-rc.10')), 'available');
  assert.equal(compareRelease('3.2.0-rc.10', release('3.2.0')), 'available');
  assert.equal(compareRelease('3.2.0', release('3.2.0-rc.10')), 'ahead');
  assert.equal(compareRelease('3.2.0+local', release('3.2.0+remote')), 'current');
  assert.equal(compareRelease('3.10.0', release('3.9.0')), 'ahead');
  for (const version of [null, undefined, '', 'unknown', '3.2']) assert.equal(compareRelease(version, release()), 'unknown');
  assert.equal(compareRelease('3.2.0', null), 'unpublished');
});

test('including internal builds selects the greatest version across both channels', () => {
  const stable = parseManifest(manifest('stable', release('3.2.0')), 'stable');
  const internal = parseManifest(manifest(), 'internal');
  assert.equal(selectReleases({ checkedAt: Date.now(), manifests: [stable, internal] }).app.version, '3.2.0');
  internal.components.app = release('3.3.0-rc.1');
  assert.equal(selectReleases({ checkedAt: Date.now(), manifests: [stable, internal] }).app.version, '3.3.0-rc.1');
  assert.deepEqual(selectReleases(null), { app: null, viz: null, ecm: null });
});

test('untrusted manifest and cached links cannot bypass schema, channel or release location validation', () => {
  const mutations = [
    (m) => m.schema_version = 2,
    (m) => m.channel = 'stable',
    (m) => m.components.app.version = '3.2.0-rc.01',
    (m) => m.components.app.prerelease = false,
    (m) => m.components.app.tag = 'v9.0.0',
    (m) => m.updated_at = null,
    (m) => m.components.app.assets[0].sha256 = 'invalid',
    (m) => m.components.app.assets[0].size_bytes = -1,
    (m) => m.components.app.assets[0].url = 'javascript:alert(1)',
    (m) => m.components.app.release_url = `${root}.evil.test/tag/app-v3.2.0-rc.2`,
    (m) => m.components.app.assets[0].url = `${root}/download/app-v3.2.0-rc.2/../evil.deb`,
    (m) => m.components.app.assets[0].url += '?redirect=evil',
  ];
  for (const mutate of mutations) {
    const data = manifest(); mutate(data);
    assert.throws(() => parseManifest(data, 'internal'), { kind: 'invalid' });
    assert.equal(parseSnapshot({ checkedAt: Date.now(), manifests: [manifest('stable', null), data] }, 'internal'), null);
  }
  assert.equal(parseSnapshot({ checkedAt: Date.now(), manifests: [manifest()] }, 'internal'), null);
  assert.equal(parseManifest(manifest('stable', null), 'stable').components.app, null);
});

test('daily automatic checks have bounded failure retries and recover from clocks moving backwards', () => {
  const now = CHECK_INTERVAL * 10;
  assert.equal(automaticCheckDue(undefined, undefined, now), true);
  assert.equal(automaticCheckDue(now - CHECK_INTERVAL + 1, now - RETRY_INTERVAL, now), false);
  assert.equal(automaticCheckDue(now - CHECK_INTERVAL, now - RETRY_INTERVAL, now), true);
  assert.equal(automaticCheckDue(undefined, now - RETRY_INTERVAL + 1, now), false);
  assert.equal(automaticCheckDue(now + 1000, now + 1000, now), true);
});

test('release requests are public, cancellable, validated and require both channels to succeed', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const snapshot = await fetchReleases('internal', signal, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/stable.json') ? manifest('stable', null) : manifest()));
  });
  assert.equal(snapshot.manifests.length, 2);
  assert.equal(selectReleases(snapshot).app.version, '3.2.0-rc.2');
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('https://raw.githubusercontent.com/rocos-sia/rocos-releases/main/channels/'));
    assert.equal(options.credentials, 'omit'); assert.equal(options.signal, signal);
    assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.headers, undefined);
  }
  await assert.rejects(fetchReleases('stable', signal, async () => new Response('<html>404</html>')), { kind: 'invalid' });
  await assert.rejects(fetchReleases('internal', signal, async (url) => url.endsWith('/stable.json')
    ? new Response(JSON.stringify(manifest('stable', null))) : new Response('down', { status: 503 })), { kind: 'http' });
  await assert.rejects(fetchReleases('stable', signal, async () => new Response(' '.repeat(1_048_577))), { kind: 'invalid' });
});

test('bundled manifest fixtures conform to the current public schema', () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/releases-internal.json', import.meta.url), 'utf8'));
  assert.equal(parseManifest(data, 'internal').components.viz.version, '3.1.0-rc.6');
});
