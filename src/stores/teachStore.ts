import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TeachPoint {
  id: string;
  name: string;
  joints: number[];
  position: number[];
  source: 'demo' | 'captured';
}

/** Preview data never enters the controller's connection or robot state stores. */
export const demoJoints = [0, -30, 45, 0, 60, 0, 0];
export const demoPosition = [425.318, -120.664, 318.902];
export const demoPrograms = [
  { name: 'pick_place.lua', steps: 12, updated: '2026-10-20 09:42' },
  { name: 'inspection.lua', steps: 8, updated: '2026-10-19 16:30' },
  { name: 'home_position.lua', steps: 3, updated: '2026-10-18 10:15' },
];

interface TeachState {
  reducedMotion: boolean;
  points: TeachPoint[];
  outputs: boolean[];
  demoRunning: boolean;
  demoStep: number;
  source: string;
  workspace: string | null;
  setReducedMotion: (value: boolean) => void;
  addPoint: (point: Omit<TeachPoint, 'id'>) => void;
  renamePoint: (id: string, name: string) => void;
  deletePoint: (id: string) => void;
  toggleOutput: (index: number) => void;
  setDemoRunning: (running: boolean) => void;
  advanceDemo: () => void;
  resetDemo: () => void;
  setSource: (source: string) => void;
  setWorkspace: (workspace: string) => void;
}

export const useTeachStore = create<TeachState>()(persist((set) => ({
  reducedMotion: false,
  points: [
    { id: 'P001', name: 'Home', joints: demoJoints, position: demoPosition, source: 'demo' },
    { id: 'P002', name: 'Approach', joints: [10, -20, 35, 0, 45, 0, 0], position: [512.66, -98.23, 210.45], source: 'demo' },
    { id: 'P003', name: 'Work', joints: [20, -10, 30, 0, 30, 0, 0], position: [600.125, -50.332, 180.21], source: 'demo' },
  ],
  outputs: [false, true, false, false, false, false, false, false],
  demoRunning: false,
  demoStep: 0,
  source: '-- ROCOS HMI · preview\n-- Review controller API before execution.\nfunction main()\n  -- Add robot instructions here.\nend\n',
  workspace: null,
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  addPoint: (point) => set((s) => ({ points: [...s.points, { ...point, id: `P${Date.now()}` }] })),
  renamePoint: (id, name) => set((s) => ({ points: s.points.map((p) => p.id === id ? { ...p, name } : p) })),
  deletePoint: (id) => set((s) => ({ points: s.points.filter((p) => p.id !== id) })),
  toggleOutput: (index) => set((s) => ({ outputs: s.outputs.map((value, i) => i === index ? !value : value) })),
  setDemoRunning: (demoRunning) => set({ demoRunning }),
  advanceDemo: () => set((s) => ({ demoStep: (s.demoStep + 1) % 12 })),
  resetDemo: () => set({ demoRunning: false, demoStep: 0 }),
  setSource: (source) => set({ source }),
  setWorkspace: (workspace) => set({ workspace }),
}), {
  name: 'rocos-teach-drafts',
  partialize: ({ reducedMotion, points, source, workspace }) => ({ reducedMotion, points, source, workspace }),
}));
