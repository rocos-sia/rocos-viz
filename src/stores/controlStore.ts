import { create } from 'zustand';
import { FRAME, DEFAULT_SPEED_FACTOR } from '@/core/constants';

interface ControlState {
  speedFactor: number;
  currentFrame: number;

  setSpeedFactor: (factor: number) => void;
  setFrame: (frame: number) => void;
  reset: () => void;
}

export const useControlStore = create<ControlState>((set) => ({
  speedFactor: DEFAULT_SPEED_FACTOR,
  currentFrame: FRAME.BASE,

  setSpeedFactor: (factor) => set({ speedFactor: factor }),
  setFrame: (frame) => set({ currentFrame: frame }),
  reset: () =>
    set({
      speedFactor: DEFAULT_SPEED_FACTOR,
      currentFrame: FRAME.BASE,
    }),
}));
