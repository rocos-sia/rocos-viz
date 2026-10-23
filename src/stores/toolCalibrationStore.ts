import { create } from 'zustand';
import type { ToolCalibrationSession } from '@/core/types';

interface CalibrationState {
  controllerKey: string;
  name: string;
  tolerance: number;
  session: ToolCalibrationSession | null;
}

// 草稿仅驻留内存，切换到示教页调整姿态时保留，不跨控制器或控制会话复用。
export const useToolCalibrationStore = create<CalibrationState>()(() => ({
  controllerKey: '', name: 'TCP_01', tolerance: 0.001, session: null,
}));
