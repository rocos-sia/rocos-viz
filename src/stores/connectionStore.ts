import type { RciStatus } from '@/core/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ConnectionState {
  rci: RciStatus | null;
  rciBusy: boolean;
  rciPhase: 'entering' | 'releasing' | 'exiting' | null;
  connectionEpoch: number;
  host: string;
  port: string;
  autoLoadModel: boolean;
  isConnected: boolean;
  isRobotEnabled: boolean;
  /** 当前持有的控制权 token，null 表示未持有 */
  controlToken: string | null;
  /** Date.now() when we successfully acquired the token */
  controlAcquiredAt: number | null;
  /** 当前控制权持有者信息（未持有时为当前持有人信息） */
  controlOwnerName: string | null;
  controlOwnerIp: string | null;

  setRci: (rci: RciStatus | null) => void;
  setRciBusy: (busy: boolean) => void;
  setConnection: (host: string, port: string) => void;
  setConnected: (connected: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setControlToken: (token: string | null) => void;
  setControlAcquiredAt: (t: number | null) => void;
  setControlOwner: (name: string | null, ip: string | null) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      rci: null,
      rciBusy: false,
      rciPhase: null,
      connectionEpoch: 0,
      host: window.location.hostname,
      port: '8080',
      autoLoadModel: true,
      isConnected: false,
      isRobotEnabled: false,
      controlToken: null,
      controlAcquiredAt: null,
      controlOwnerName: null,
      controlOwnerIp: null,

      setRci: (rci) => set({ rci }),
      setRciBusy: (rciBusy) => set({ rciBusy }),
      setConnection: (host, port) => set((state) => ({
        host, port,
        ...(host !== state.host || port !== state.port
          ? { rci: null, rciBusy: false, rciPhase: null, connectionEpoch: state.connectionEpoch + 1, controlToken: null, controlAcquiredAt: null, controlOwnerName: null, controlOwnerIp: null }
          : {}),
      })),
      setConnected: (connected) => set(state => ({ isConnected: connected, ...(!connected ? { rci: null, rciBusy: false, rciPhase: null, connectionEpoch: state.connectionEpoch + 1 } : {}) })),
      setEnabled: (enabled) => set({ isRobotEnabled: enabled }),
      setControlToken: (token) => set({ controlToken: token }),
      setControlAcquiredAt: (t) => set({ controlAcquiredAt: t }),
      setControlOwner: (name, ip) => set({ controlOwnerName: name, controlOwnerIp: ip }),
      reset: () => set(state => ({ connectionEpoch: state.connectionEpoch + 1, rciPhase: null, rci: null, rciBusy: false, isConnected: false, isRobotEnabled: false, controlToken: null, controlAcquiredAt: null, controlOwnerName: null, controlOwnerIp: null })),
    }),
    {
      name: 'rocos-connection',
      // Credentials and connection state belong to this tab, not all tabs.
      storage: createJSONStorage(() => sessionStorage),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<ConnectionState>), rci: null, rciBusy: false, rciPhase: null, connectionEpoch: 0 }),
    },
  ),
);

/** 普通写操作只在已确认退出 RCI 且交接结束后开放。 */
export const selectWriteToken = (state: ConnectionState) =>
  state.rci && !state.rci.enabled && !state.rciBusy && !state.rciPhase ? state.controlToken : null;
