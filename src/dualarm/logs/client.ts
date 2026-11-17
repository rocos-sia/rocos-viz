export type ArmScope = 'left' | 'right' | 'process';
export interface DualArmLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'critical';
  module: string;
  message: string;
  code: number | null;
  arm: ArmScope;
  ecat_id: number | null;
  device_id: string | null;
  category: 'log' | 'operation';
  operation: null | { name: string; request_id: string; outcome: 'accepted' | 'rejected'; http_status: number; duration_ms: number };
}
export interface LogGap { reason: 'server_restarted' | 'buffer_overrun' | 'producer_overflow'; earliest_id: string; count?: number }
export interface LogPage { events: DualArmLog[]; next_id: string; has_more: boolean; gap: LogGap | null }
export function diagnosticsOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('invalid_endpoint');
  }
  return url.origin;
}
export function parseEvent(value: unknown): DualArmLog {
  const e = value as DualArmLog;
  if (!e || typeof e.id !== 'string' || e.id.length > 128 || !/^[a-zA-Z0-9-]+:\d+$/.test(e.id) ||
      typeof e.timestamp !== 'string' || !Number.isFinite(Date.parse(e.timestamp)) ||
      !['left', 'right', 'process'].includes(e.arm) || !['info', 'warn', 'error', 'critical'].includes(e.level) ||
      !['log', 'operation'].includes(e.category) || typeof e.message !== 'string' || typeof e.module !== 'string' ||
      !(e.code === null || Number.isInteger(e.code)) || !(e.ecat_id === null || Number.isInteger(e.ecat_id)) ||
      !(e.device_id === null || typeof e.device_id === 'string') ||
      (e.operation !== null && (!e.operation || typeof e.operation.name !== 'string' || typeof e.operation.request_id !== 'string' ||
        !['accepted', 'rejected'].includes(e.operation.outcome) || !Number.isFinite(e.operation.duration_ms) || !Number.isInteger(e.operation.http_status)))) {
    throw new Error('invalid_event');
  }
  return e;
}
export function parseGap(value: unknown): LogGap {
  const gap = value as LogGap;
  if (!gap || !['server_restarted', 'buffer_overrun', 'producer_overflow'].includes(gap.reason) || typeof gap.earliest_id !== 'string') throw new Error('invalid_gap');
  return gap;
}
export function appendEvents(previous: DualArmLog[], incoming: DualArmLog[]): DualArmLog[] {
  const seen = new Set(previous.map(e => e.id));
  return [...previous, ...incoming.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })].slice(-1000);
}
export class DualArmLogClient {
  readonly origin: string;
  constructor(origin: string) { this.origin = diagnosticsOrigin(origin); }
  async history(signal: AbortSignal): Promise<LogPage> {
    const response = await fetch(`${this.origin}/api/dualarm/logs?limit=100`, { signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json();
    if (!value.success || !Array.isArray(value.data?.events) || typeof value.data.next_id !== 'string') throw new Error('invalid_response');
    return { ...value.data, events: value.data.events.map(parseEvent), gap: value.data.gap === null ? null : parseGap(value.data.gap) };
  }
  stream(after: string): EventSource {
    return new EventSource(`${this.origin}/api/dualarm/logs/stream?after=${encodeURIComponent(after)}`, { withCredentials: false });
  }
  get fileUrl(): string { return `${this.origin}/api/logs/file/latest`; }
  async preview(signal: AbortSignal): Promise<{ text: string; truncated: boolean; timestamp: string }> {
    const response = await fetch(this.fileUrl, { signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('Content-Type')?.startsWith('text/plain') || !response.body) throw new Error('invalid_file');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    const limit = 256 * 1024;
    let bytes = 0, text = '', truncated = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const take = Math.min(value.length, limit - bytes);
        text += decoder.decode(value.subarray(0, take), { stream: true }); bytes += take;
        if (value.length > take || bytes >= limit) { truncated = true; await reader.cancel(); break; }
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return { text, truncated, timestamp: response.headers.get('X-Rocos-Log-Snapshot-Time') || '' };
  }
}
