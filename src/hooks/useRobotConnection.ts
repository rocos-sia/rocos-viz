import { useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { RobotWebSocket } from '@/core/RobotWebSocket';
import { POLLING_INTERVAL_MS, MAX_STATE_FAILURES } from '@/core/constants';
import type { RobotState } from '@/core/types';

export function useRobotConnection() {
  const generation = useRef(0);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const timerRef = useRef<number | null>(null);
  const failureCountRef = useRef(0);
  const wsRef = useRef<RobotWebSocket | null>(null);
  const fallbackRef = useRef(false);

  const isConnected = useConnectionStore((s) => s.isConnected);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setEnabled = useConnectionStore((s) => s.setEnabled);
  const updateState = useRobotStateStore((s) => s.updateState);
  const clearState = useRobotStateStore((s) => s.clear);

  // Wraps robotStateStore.updateState to also sync is_enabled into connectionStore
  const syncState = useCallback(
    (state: RobotState) => {
      updateState(state);
      if (state.is_enabled !== undefined) {
        setEnabled(state.is_enabled);
      }
    },
    [updateState, setEnabled],
  );

  const startPolling = useCallback(() => {
    if (timerRef.current) return;

    const epoch = generation.current;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || epoch !== generation.current) return;
      inFlight = true;
      const { host, port } = useConnectionStore.getState();
      const client = new RobotApiClient(host, port);

      try {
        const state = await client.getRobotState();
        if (epoch !== generation.current) return;
        syncState(state);
        failureCountRef.current = 0;
      } catch {
        if (epoch !== generation.current) return;
        failureCountRef.current++;
        if (failureCountRef.current >= MAX_STATE_FAILURES) {
          console.error('Max state failures reached, disconnecting');
          stopPolling();
          setConnected(false);
          setEnabled(false);
          clearState();
        }
      } finally { inFlight = false; }
    };

    timerRef.current = window.setInterval(poll, POLLING_INTERVAL_MS);
  }, [syncState, setConnected, setEnabled, clearState]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    failureCountRef.current = 0;
  }, []);

  const startWebSocket = useCallback(() => {
    if (wsRef.current?.connected) return;

    const epoch = generation.current;
    const ws = new RobotWebSocket();
    wsRef.current = ws;

    const { host, port } = useConnectionStore.getState();

    ws.connect(host, parseInt(port), (state) => { if (epoch === generation.current) syncState(state); }, (status) => {
      if (epoch !== generation.current) return;
      if (status === 'disconnected' && !fallbackRef.current) {
        fallbackRef.current = true;
        console.warn('WebSocket disconnected, falling back to HTTP polling');
        startPolling();
      }
    });

    const fallbackTimeout = setTimeout(() => {
      if (epoch === generation.current && !ws.connected && !fallbackRef.current) {
        fallbackRef.current = true;
        console.warn('WebSocket connection timed out, falling back to HTTP polling');
        ws.disconnect();
        startPolling();
      }
    }, 3000);

    return () => clearTimeout(fallbackTimeout);
  }, [syncState, startPolling]);

  useEffect(() => {
    generation.current++;
    let clearFallback: (() => void) | undefined;
    if (isConnected) {
      fallbackRef.current = false;
      clearFallback = startWebSocket();
    } else {
      wsRef.current?.disconnect();
      wsRef.current = null;
      stopPolling();
    }

    return () => {
      generation.current++;
      clearFallback?.();
      wsRef.current?.disconnect();
      wsRef.current = null;
      stopPolling();
    };
  }, [isConnected, host, port, startWebSocket, stopPolling]);

  return { startPolling, stopPolling };
}
