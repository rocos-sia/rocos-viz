export interface TelemetryPoint { timestamp: number; value: number | null }

/** Bounded per-channel raw samples, independent of React and drawing frequency. */
export class TelemetryBuffer {
  private channels = new Map<string, { times: Float64Array; values: Float64Array; cursor: number; count: number }>();
  private lastTime = -Infinity;
  constructor(readonly capacity = 30_000, readonly durationMs = 600_000) {}
  clear() { this.channels.clear(); this.lastTime = -Infinity; }
  appendFrame(timestamp: number, values: Record<string, number>) {
    if (!Number.isFinite(timestamp)) return;
    if (timestamp === this.lastTime) return;
    if (timestamp < this.lastTime) this.clear();
    this.lastTime = timestamp;
    for (const [key, value] of Object.entries(values).slice(0, 64)) {
      let channel = this.channels.get(key);
      if (!channel) {
        if (this.channels.size >= 64) continue;
        channel = { times: new Float64Array(this.capacity), values: new Float64Array(this.capacity), cursor: 0, count: 0 };
        this.channels.set(key, channel);
      }
      channel.times[channel.cursor] = timestamp;
      channel.values[channel.cursor] = Number.isFinite(value) ? value : NaN;
      channel.cursor = (channel.cursor + 1) % this.capacity;
      channel.count = Math.min(this.capacity, channel.count + 1);
    }
  }
  read(key: string, windowMs = this.durationMs, end = this.lastTime): TelemetryPoint[] {
    const c = this.channels.get(key);
    if (!c) return [];
    const points: TelemetryPoint[] = [];
    const cutoff = Math.max(end - windowMs, this.lastTime - this.durationMs);
    for (let i = 0; i < c.count; i++) {
      const index = (c.cursor - c.count + i + this.capacity) % this.capacity;
      const timestamp = c.times[index];
      if (timestamp < cutoff || timestamp > end) continue;
      points.push({ timestamp, value: Number.isFinite(c.values[index]) ? c.values[index] : null });
    }
    return points;
  }
  get latestTime() { return this.lastTime; }
}

export const telemetryBuffer = new TelemetryBuffer();
