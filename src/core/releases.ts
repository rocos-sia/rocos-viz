import { compare, prerelease, valid } from 'semver';
import { z } from 'zod';

export type UpdateChannel = 'stable' | 'internal';
export type ReleaseComponent = 'app' | 'viz' | 'ecm';
export const RELEASE_ROOT = 'https://github.com/rocos-sia/rocos-releases/releases';
export const MANIFEST_ROOT = 'https://raw.githubusercontent.com/rocos-sia/rocos-releases/main/channels';
export const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
export const RETRY_INTERVAL = 60 * 60 * 1000;
const components = ['app', 'viz', 'ecm'] as const;
const date = z.string().datetime({ offset: true });
const version = z.string().refine((value) => valid(value) !== null && !value.startsWith('v') && value.trim() === value);
const assetSchema = z.object({
  os: z.literal('linux'), arch: z.enum(['amd64', 'arm64', 'armhf', 'all']),
  format: z.enum(['deb', 'tar.gz', 'tar.xz', 'zip']), url: z.string(),
  size_bytes: z.number().int().positive().safe(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature_url: z.string().nullable(),
});
const releaseSchema = z.object({
  version, prerelease: z.boolean(), source_repository: z.string(), tag: z.string(),
  published_at: date, release_url: z.string(), notes: z.string().max(100_000),
  assets: z.array(assetSchema).min(1).max(30),
  compatibility: z.object({ api_version: z.string().min(1).nullable(), shm_abi_version: z.number().int().positive().nullable() }),
});
const manifestSchema = z.object({
  schema_version: z.literal(1), channel: z.enum(['stable', 'internal']), updated_at: date.nullable(),
  components: z.object({ app: releaseSchema.nullable(), viz: releaseSchema.nullable(), ecm: releaseSchema.nullable() }),
});
export type ComponentRelease = z.infer<typeof releaseSchema>;
export type ReleaseManifest = z.infer<typeof manifestSchema>;
export interface ReleaseSnapshot { checkedAt: number; manifests: ReleaseManifest[] }
export type UpdateFailure = 'network' | 'timeout' | 'invalid' | 'http';
export class ReleaseError extends Error {
  constructor(public readonly kind: UpdateFailure) { super(kind); }
}

/** 公网清单和本地缓存都校验；下载链接只能指向 ROCOS 发布中心的对应版本。 */
export function parseManifest(data: unknown, channel: UpdateChannel): ReleaseManifest {
  const parsed = manifestSchema.safeParse(data);
  if (!parsed.success || parsed.data.channel !== channel) throw new ReleaseError('invalid');
  const manifest = parsed.data;
  for (const component of components) {
    const release = manifest.components[component];
    if (!release) continue;
    const tag = `${component}-${release.tag}`;
    const releaseUrl = `${RELEASE_ROOT}/tag/${tag}`;
    const assetPrefix = `${RELEASE_ROOT}/download/${tag}/`;
    const safeAsset = (value: string) => value.startsWith(assetPrefix)
      && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value.slice(assetPrefix.length));
    if (!manifest.updated_at || release.prerelease !== (channel === 'internal')
      || (prerelease(release.version) !== null) !== release.prerelease
      || release.tag !== `v${release.version}` || release.release_url !== releaseUrl
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(release.source_repository)
      || release.assets.some((asset) => !safeAsset(asset.url) || (asset.signature_url !== null && !safeAsset(asset.signature_url)))) {
      throw new ReleaseError('invalid');
    }
  }
  return manifest;
}

export function parseSnapshot(data: unknown, channel: UpdateChannel): ReleaseSnapshot | null {
  try {
    const raw = z.object({ checkedAt: z.number().positive().finite(), manifests: z.array(z.unknown()) }).parse(data);
    const channels: UpdateChannel[] = channel === 'internal' ? ['stable', 'internal'] : ['stable'];
    if (raw.manifests.length !== channels.length) return null;
    return { checkedAt: raw.checkedAt, manifests: channels.map((entry, i) => parseManifest(raw.manifests[i], entry)) };
  } catch { return null; }
}

export function selectReleases(snapshot: ReleaseSnapshot | null): Record<ReleaseComponent, ComponentRelease | null> {
  const selected: Record<ReleaseComponent, ComponentRelease | null> = { app: null, viz: null, ecm: null };
  for (const manifest of snapshot?.manifests ?? []) {
    for (const component of components) {
      const candidate = manifest.components[component];
      const previous = selected[component];
      if (candidate && (!previous || compare(candidate.version, previous.version) > 0)) selected[component] = candidate;
    }
  }
  return selected;
}

export type Comparison = 'available' | 'current' | 'ahead' | 'unknown' | 'unpublished';
export function compareRelease(current: string | null | undefined, release: ComponentRelease | null): Comparison {
  if (!release) return 'unpublished';
  if (!current || valid(current) === null) return 'unknown';
  const result = compare(release.version, current);
  return result > 0 ? 'available' : result < 0 ? 'ahead' : 'current';
}

export function automaticCheckDue(checkedAt: number | undefined, attemptedAt: number | undefined, now = Date.now()): boolean {
  const elapsed = (timestamp: number | undefined, interval: number) => !timestamp || timestamp > now || now - timestamp >= interval;
  return elapsed(checkedAt, CHECK_INTERVAL) && elapsed(attemptedAt, RETRY_INTERVAL);
}

export async function fetchReleases(channel: UpdateChannel, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ReleaseSnapshot> {
  const channels: UpdateChannel[] = channel === 'internal' ? ['stable', 'internal'] : ['stable'];
  const manifests = await Promise.all(channels.map(async (entry) => {
    const response = await fetcher(`${MANIFEST_ROOT}/${entry}.json`, {
      signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache',
    });
    if (!response.ok) throw new ReleaseError('http');
    const text = await response.text();
    if (text.length > 1_048_576) throw new ReleaseError('invalid');
    try { return parseManifest(JSON.parse(text), entry); }
    catch { throw new ReleaseError('invalid'); }
  }));
  return { checkedAt: Date.now(), manifests };
}
