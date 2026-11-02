import { create } from 'zustand';
import type { MotionPreview, RobotState } from '@/core/types';
import { previewEndState } from '@/core/MotionPreview';
import { useConnectionStore } from './connectionStore';
import { useRobotStateStore } from './robotStateStore';

interface PreviewStore {
  mode: 'real' | 'simulation';
  virtualState: RobotState | null;
  trajectory: MotionPreview | null;
  revision: number;
  pending: boolean;
  error: string | null;
  playing: boolean;
  time: number;
  setMode: (mode: 'real' | 'simulation') => void;
  reset: () => void;
  accept: (trajectory: MotionPreview, revision: number) => void;
}

export const useMotionPreviewStore = create<PreviewStore>((set, get) => ({
  mode: 'real', virtualState: null, trajectory: null, revision: 0,
  pending: false, error: null, playing: false, time: 0,
  setMode: (mode) => {
    if (mode === get().mode) return;
    set({ mode });
    get().reset();
  },
  reset: () => set((state) => ({
    revision: state.revision + 1, trajectory: null, pending: false,
    error: null, playing: false, time: 0,
    virtualState: state.mode === 'simulation' ? useRobotStateStore.getState().robotState : null,
  })),
  accept: (trajectory, revision) => {
    const state = get();
    if (state.mode !== 'simulation' || revision !== state.revision || !state.virtualState) return;
    set({ trajectory, virtualState: previewEndState(state.virtualState, trajectory),
      pending: false, error: null, time: trajectory.duration, playing: false });
  },
}));

const context = (state: RobotState | null) => JSON.stringify([
  state?.joint_states.map(j => j.name), state?.active_tool_frame_name, state?.active_tool_frame,
  state?.active_tool_package, state?.active_object_frame_name, state?.active_object_frame,
]);
const unsubConnection = useConnectionStore.subscribe((state, previous) => {
  if (state.isConnected !== previous.isConnected || state.host !== previous.host || state.port !== previous.port) {
    useMotionPreviewStore.getState().setMode('real');
    useMotionPreviewStore.getState().reset();
  }
});
const unsubRobot = useRobotStateStore.subscribe((state, previous) => {
  if (context(state.robotState) !== context(previous.robotState)) useMotionPreviewStore.getState().reset();
});
if (import.meta.hot) import.meta.hot.dispose(() => { unsubConnection(); unsubRobot(); });
