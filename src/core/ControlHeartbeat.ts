import type { ApiResponse, ControlOwnerData } from './types';

/** One request at a time. Stopping aborts pending work and ignores late responses. */
export function startControlHeartbeat(options: {
  heartbeat: (signal: AbortSignal) => Promise<ApiResponse<ControlOwnerData>>;
  onRejected: (response: ApiResponse<ControlOwnerData>) => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
  requestTimeoutMs?: number;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let interval = options.intervalMs ?? 5_000;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
  };

  const tick = async () => {
    if (stopped) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), options.requestTimeoutMs ?? 5_000);
    try {
      const response = await options.heartbeat(controller.signal);
      if (stopped) return;
      if (!response.success && (response.code === 3006 || response.code === 3007)) {
        stop();
        options.onRejected(response);
        return;
      }
      if (!response.success) throw new Error(response.message);
      const seconds = response.data?.heartbeat_interval_seconds;
      if (seconds !== undefined && Number.isFinite(seconds) && seconds > 0) interval = seconds * 1_000;
    } catch (error) {
      if (!stopped) options.onError?.(error);
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(tick, interval);
    }
  };
  void tick();
  return stop;
}
