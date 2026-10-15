import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ConnectionState {
  host: string;
  port: string;
  isConnected: boolean;
  isRobotEnabled: boolean;
  /** 当前持有的控制权 token，null 表示未持有 */
  controlToken: string | null;
  /** Date.now() when we successfully acquired the token */
  controlAcquiredAt: number | null;
  /** 当前控制权持有者信息（未持有时为当前持有人信息） */
  controlOwnerName: string | null;
  controlOwnerIp: string | null;

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
      host: window.location.hostname,
      port: '8080',
      isConnected: false,
      isRobotEnabled: false,
      controlToken: null,
      controlAcquiredAt: null,
      controlOwnerName: null,
      controlOwnerIp: null,

      setConnection: (host, port) => set((state) => ({
        host, port,
        ...(host !== state.host || port !== state.port
          ? { controlToken: null, controlAcquiredAt: null, controlOwnerName: null, controlOwnerIp: null }
          : {}),
      })),
      setConnected: (connected) => set({ isConnected: connected }),
      setEnabled: (enabled) => set({ isRobotEnabled: enabled }),
      setControlToken: (token) => set({ controlToken: token }),
      setControlAcquiredAt: (t) => set({ controlAcquiredAt: t }),
      setControlOwner: (name, ip) => set({ controlOwnerName: name, controlOwnerIp: ip }),
      reset: () => set({ isConnected: false, isRobotEnabled: false, controlToken: null, controlAcquiredAt: null, controlOwnerName: null, controlOwnerIp: null }),
    }),
    {
      name: 'rocos-connection',
      // Credentials and connection state belong to this tab, not all tabs.
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
