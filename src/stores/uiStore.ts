import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '@/i18n';

export type ThemeMode = 'dark' | 'light';

interface UIState {
  showJointFrames: boolean;
  showWireframe: boolean;
  showGround: boolean;
  showTrajectory: boolean;
  currentView: 'scene' | 'plot';
  themeMode: ThemeMode;
  language: Language;
  rightPanelCollapsed: boolean;
  rightPanelWidth: number;
  plotFloatPos: { x: number; y: number } | null;

  toggleJointFrames: () => void;
  toggleWireframe: () => void;
  toggleGround: () => void;
  toggleTrajectory: () => void;
  setView: (view: 'scene' | 'plot') => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setPlotFloatPos: (pos: { x: number; y: number }) => void;
}

export const RIGHT_PANEL_MIN_WIDTH = 320;
export const RIGHT_PANEL_MAX_WIDTH = 640;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      showJointFrames: false,
      showWireframe: false,
      showGround: true,
      showTrajectory: false,
      currentView: 'scene',
      themeMode: 'light',
      language: 'zh',
      rightPanelCollapsed: false,
      rightPanelWidth: 400,
      plotFloatPos: null,

      toggleJointFrames: () => set((state) => ({ showJointFrames: !state.showJointFrames })),
      toggleWireframe: () => set((state) => ({ showWireframe: !state.showWireframe })),
      toggleGround: () => set((state) => ({ showGround: !state.showGround })),
      toggleTrajectory: () => set((state) => ({ showTrajectory: !state.showTrajectory })),
      setView: (view) => set({ currentView: view }),
      toggleTheme: () =>
        set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),
      toggleLanguage: () =>
        set((state) => ({ language: state.language === 'en' ? 'zh' : 'en' })),
      toggleRightPanel: () =>
        set((state) => ({ rightPanelCollapsed: !state.rightPanelCollapsed })),
      setRightPanelWidth: (width) =>
        set({
          rightPanelWidth: Math.min(
            RIGHT_PANEL_MAX_WIDTH,
            Math.max(RIGHT_PANEL_MIN_WIDTH, width),
          ),
        }),
      setPlotFloatPos: (pos) => set({ plotFloatPos: pos }),
    }),
    { name: 'rocos-ui' },
  ),
);
