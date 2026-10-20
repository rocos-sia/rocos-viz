/** Serial jog feeds; cancellation also stops a request that finishes after release. */
export function startHeldJog(options: {
  feed: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  intervalMs: number;
  onError?: (error: unknown) => void;
}) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { void options.stop().catch(options.onError ?? (() => {})); };
  const tick = async () => {
    try {
      await options.feed();
      if (!active) { stop(); return; }
      timer = setTimeout(tick, options.intervalMs);
    } catch (error) {
      active = false;
      stop();
      options.onError?.(error);
    }
  };
  void tick();
  return () => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    stop();
  };
}
