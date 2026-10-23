export type RobotLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface RobotLogEvent {
  id: string;
  timestamp: string;
  level: RobotLogLevel;
  module: string;
  code: number | null;
  message: string;
}

export interface RobotLogFile {
  blob: Blob;
  filename: string;
  snapshotTime: string;
  truncated: boolean;
}

interface LogQueryData {
  events: RobotLogEvent[];
  next_id: string;
  has_more: boolean;
  gap: { reason: string; earliest_id?: string; count?: number } | null;
}

interface LogResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export class RobotLogClient {
  private readonly baseUrl: string;

  constructor(host: string, diagnosticsPort = 8082) {
    const normalizedHost = (host || '').trim();
    const isLocalHost = !normalizedHost || normalizedHost === 'localhost' ||
      normalizedHost === '127.0.0.1' || normalizedHost === '::1';
    // Vite proxies /api/logs to the App diagnostics port during development.
    // A production build connects directly because the App web server does not
    // proxy the separate diagnostics listener.
    const address = normalizedHost || window.location.hostname;
    const hostname = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
    this.baseUrl = import.meta.env.DEV && isLocalHost
      ? window.location.origin
      : `${window.location.protocol}//${hostname}:${diagnosticsPort}`;
  }

  private url(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl);
    if (params) Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  async list(after?: string, limit = 100, signal?: AbortSignal): Promise<LogQueryData> {
    const response = await fetch(this.url('/api/logs', { ...(after ? { after } : {}), limit: String(limit) }), {
      headers: { Accept: 'application/json' },
      signal,
    });
    const text = await response.text();
    let result: LogResponse<LogQueryData>;
    try { result = JSON.parse(text) as LogResponse<LogQueryData>; }
    catch { throw new Error(`Log service returned non-JSON data (HTTP ${response.status}). Check the diagnostics port and /api/logs proxy.`); }
    if (!response.ok || !result.success) {
      throw new Error(result.message || `Log query failed: HTTP ${response.status}`);
    }
    if (!result.data || !Array.isArray(result.data.events) || typeof result.data.next_id !== 'string') {
      throw new Error('Invalid log query response');
    }
    return result.data;
  }

  /** 文件接口返回原始文本；预览限制读取量，下载不设上限。 */
  async latestFile(signal?: AbortSignal, maxBytes?: number): Promise<RobotLogFile> {
    const response = await fetch(this.url('/api/logs/file/latest'), {
      headers: { Accept: 'text/plain' }, cache: 'no-store', signal,
    });
    if (!response.ok) {
      let message = '';
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const result = await response.json() as { message?: unknown };
        if (typeof result.message === 'string') message = result.message;
      }
      throw new Error(message || `HTTP ${response.status}`);
    }
    if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('text/plain')) {
      await response.body?.cancel();
      throw new Error(`Expected text/plain (HTTP ${response.status}). Check the diagnostics port and /api/logs proxy.`);
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    let filename = /filename="([^"]+)"/i.exec(disposition)?.[1] || 'rocos-app_latest.log';
    // 下载名只取文件名，不能让响应头引入路径或控制字符。
    filename = Array.from(filename.split(/[\\/]/).pop() || 'rocos-app_latest.log')
      .map((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? '_' : char).join('');
    let blob: Blob;
    let truncated = false;
    if (maxBytes !== undefined && response.body) {
      const reader = response.body.getReader();
      const parts: ArrayBuffer[] = [];
      let remaining = maxBytes;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value.slice(0, remaining).buffer);
          remaining -= value.byteLength;
          if (remaining < 0) { truncated = true; await reader.cancel(); break; }
        }
      } finally { reader.releaseLock(); }
      blob = new Blob(parts, { type: 'text/plain;charset=utf-8' });
    } else {
      blob = await response.blob();
    }
    return { blob, filename, snapshotTime: response.headers.get('X-Rocos-Log-Snapshot-Time') || '', truncated };
  }

  subscribe(after: string | undefined, onLog: (event: RobotLogEvent) => void,
            onGap: () => void, onError: (error: Event) => void): EventSource {
    const source = new EventSource(this.url('/api/logs/stream', after ? { after } : undefined));
    source.addEventListener('log', (event) => {
      try { onLog(JSON.parse((event as MessageEvent).data) as RobotLogEvent); }
      catch { onError(event); }
    });
    source.addEventListener('gap', onGap);
    source.onerror = onError;
    return source;
  }
}
