import { create } from 'zustand';
import { automaticCheckDue, fetchReleases, parseSnapshot, ReleaseError, type ReleaseComponent, type ReleaseSnapshot, type UpdateChannel, type UpdateFailure } from '@/core/releases';

const STORAGE_KEY = 'rocos-updates-v1';
interface SavedUpdates {
  channel: UpdateChannel;
  cache: Partial<Record<UpdateChannel, ReleaseSnapshot>>;
  attempts: Partial<Record<UpdateChannel, number>>;
  errors: Partial<Record<UpdateChannel, UpdateFailure>>;
  ignored: Partial<Record<ReleaseComponent, string>>;
  notified: string[];
}
function readSaved(): SavedUpdates {
  const defaults: SavedUpdates = { channel: 'stable', cache: {}, attempts: {}, errors: {}, ignored: {}, notified: [] };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!data || typeof data !== 'object') return defaults;
    defaults.channel = data.channel === 'internal' ? 'internal' : 'stable';
    for (const channel of ['stable', 'internal'] as const) {
      const snapshot = parseSnapshot(data.cache?.[channel], channel);
      if (snapshot) defaults.cache[channel] = snapshot;
      const attempt = data.attempts?.[channel];
      if (typeof attempt === 'number' && Number.isFinite(attempt) && attempt > 0) defaults.attempts[channel] = attempt;
      if (['network', 'timeout', 'invalid', 'http'].includes(data.errors?.[channel])) defaults.errors[channel] = data.errors[channel];
    }
    for (const component of ['app', 'viz', 'ecm'] as const) {
      if (typeof data.ignored?.[component] === 'string') defaults.ignored[component] = data.ignored[component];
    }
    if (Array.isArray(data.notified)) defaults.notified = data.notified.filter((entry: unknown) => typeof entry === 'string').slice(-50);
  } catch { /* 隐私模式或损坏缓存不影响页面和手动检查。 */ }
  return defaults;
}
function save(state: SavedUpdates) {
  const { channel, cache, attempts, errors, ignored, notified } = state;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ channel, cache, attempts, errors, ignored, notified })); } catch { /* 内存中仍可使用。 */ }
}
interface UpdateState extends SavedUpdates {
  loading: boolean;
  error: UpdateFailure | null;
  setChannel: (channel: UpdateChannel) => void;
  check: (manual?: boolean) => Promise<void>;
  ignore: (component: ReleaseComponent, version: string | null) => void;
  markNotified: (keys: string[]) => void;
}
let active: AbortController | null = null;
const saved = readSaved();
export const useUpdateStore = create<UpdateState>((set, get) => ({
  ...saved, loading: false, error: saved.errors[saved.channel] ?? null,
  setChannel: (channel) => {
    if (get().channel === channel) return;
    active?.abort(); active = null;
    set({ channel, loading: false, error: get().errors[channel] ?? null });
    save(get());
    void get().check();
  },
  check: async (manual = false) => {
    const state = get();
    if (state.loading || (!manual && !automaticCheckDue(state.errors[state.channel] ? undefined : state.cache[state.channel]?.checkedAt, state.attempts[state.channel]))) return;
    const channel = state.channel;
    const request = new AbortController();
    active = request;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; request.abort(); }, 8000);
    set({ loading: true, error: null });
    try {
      const snapshot = await fetchReleases(channel, request.signal);
      if (active !== request) return;
      const errors = { ...get().errors };
      delete errors[channel];
      set({ cache: { ...get().cache, [channel]: snapshot }, error: null, errors });
    } catch (error) {
      if (active !== request) return;
      const failure = timedOut ? 'timeout' : error instanceof ReleaseError ? error.kind : 'network';
      set({ error: failure, errors: { ...get().errors, [channel]: failure }, attempts: { ...get().attempts, [channel]: Date.now() } });
    } finally {
      window.clearTimeout(timer);
      if (active === request) { active = null; set({ loading: false }); save(get()); }
    }
  },
  ignore: (component, version) => {
    const ignored = { ...get().ignored };
    if (version) ignored[component] = version; else delete ignored[component];
    set({ ignored }); save(get());
  },
  markNotified: (keys) => {
    set({ notified: [...new Set([...get().notified, ...keys])].slice(-50) }); save(get());
  },
}));
