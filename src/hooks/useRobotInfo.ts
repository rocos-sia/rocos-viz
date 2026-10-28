import { useEffect } from 'react';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { robotInfoEndpoint, useRobotInfoStore } from '@/stores/robotInfoStore';

/** 由连接生命周期调用一次，路由切换不会触发重复请求。 */
export function useRobotInfoConnection() {
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connected = useConnectionStore((s) => s.isConnected);
  const revision = useRobotInfoStore((s) => s.revision);

  useEffect(() => {
    const endpoint = robotInfoEndpoint(host, port);
    useRobotInfoStore.setState({ endpoint: connected ? endpoint : null, info: null, loading: connected, error: null });
    if (!connected) return;
    let cancelled = false;
    let timedOut = false;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => { timedOut = true; abort.abort(); }, 8000);
    const current = () => {
      const connection = useConnectionStore.getState();
      return !cancelled && connection.isConnected && robotInfoEndpoint(connection.host, connection.port) === endpoint;
    };
    void new RobotApiClient(host, port).getRobotInfo(abort.signal).then((info) => {
      if (current()) useRobotInfoStore.setState({ info, loading: false, error: null });
    }).catch((error: unknown) => {
      if (current()) useRobotInfoStore.setState({ loading: false, error: timedOut ? 'timeout' : error instanceof Error ? error.message : String(error) });
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; abort.abort(); window.clearTimeout(timeout); };
  }, [host, port, connected, revision]);
}

/** 在 React 执行连接清理 effect 前也不展示另一控制器的数据。 */
export function useRobotInfo() {
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connected = useConnectionStore((s) => s.isConnected);
  const state = useRobotInfoStore();
  const matches = connected && state.endpoint === robotInfoEndpoint(host, port);
  return { ...state, connected, info: matches ? state.info : null, error: matches ? state.error : null, loading: matches && state.loading };
}
