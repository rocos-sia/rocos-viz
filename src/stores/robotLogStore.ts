import { create } from 'zustand';
import type { RobotLogEvent } from '@/core/RobotLogClient';

interface RobotLogState {
  events: RobotLogEvent[];
  loading: boolean;
  error: string;
  live: boolean;
  gap: boolean;
  revision: number;
  refresh: () => void;
}

// 日志属于当前控制器会话，各页面共享；不持久化以免混入旧控制器记录。
export const useRobotLogStore = create<RobotLogState>()((set) => ({
  events: [],
  loading: false,
  error: '',
  live: false,
  gap: false,
  revision: 0,
  refresh: () => set((state) => ({ revision: state.revision + 1 })),
}));
