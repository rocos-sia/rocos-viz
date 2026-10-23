import { useEffect } from 'react';
import { RobotLogClient } from '@/core/RobotLogClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotLogStore } from '@/stores/robotLogStore';

/** 仅由 TeachShell 挂载一次，页面切换不重建 SSE 或清空日志。 */
export function useRobotLogs() {
  const connected = useConnectionStore((state) => state.isConnected);
  const host = useConnectionStore((state) => state.host);
  const port = useConnectionStore((state) => state.port);
  const revision = useRobotLogStore((state) => state.revision);

  useEffect(() => {
    useRobotLogStore.setState({ events: [], loading: connected, error: '', live: false, gap: false });
    if (!connected) return;

    let disposed = false;
    let stream: EventSource | undefined;
    const abort = new AbortController();
    const client = new RobotLogClient(host);
    void client.list(undefined, 100, abort.signal).then((data) => {
      if (disposed) return;
      useRobotLogStore.setState({ events: data.events, gap: !!data.gap, loading: false });
      stream = client.subscribe(data.next_id, (event) => {
        if (disposed) return;
        useRobotLogStore.setState((state) => ({
          events: state.events.some((entry) => entry.id === event.id)
            ? state.events : [...state.events, event].slice(-200),
          live: true,
        }));
      }, () => {
        if (!disposed) useRobotLogStore.setState({ gap: true });
      }, () => {
        if (!disposed) useRobotLogStore.setState({ live: false });
      });
      stream.onopen = () => { if (!disposed) useRobotLogStore.setState({ live: true }); };
    }).catch((error: unknown) => {
      if (!disposed) useRobotLogStore.setState({
        loading: false, error: error instanceof Error ? error.message : String(error),
      });
    });
    return () => { disposed = true; abort.abort(); stream?.close(); };
  }, [connected, host, port, revision]);
}
