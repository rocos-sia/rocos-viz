import { create } from 'zustand';
import type { RobotInfo } from '@/core/types';

interface RobotInfoState {
  endpoint: string | null;
  info: RobotInfo | null;
  loading: boolean;
  error: string | null;
  revision: number;
  refresh: () => void;
}

// 设备信息仅属于当前连接，不跨会话持久化。
export const useRobotInfoStore = create<RobotInfoState>((set) => ({
  endpoint: null, info: null, loading: false, error: null, revision: 0,
  refresh: () => set((state) => ({ revision: state.revision + 1 })),
}));

export const robotInfoEndpoint = (host: string, port: string) => JSON.stringify([host, port]);
