import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { displayUnits, type UnitPreferences } from '@/core/Units';

interface UnitState extends UnitPreferences {
  setUnits: (preferences: Partial<UnitPreferences>) => void;
  toggleDegree: () => void;
  toggleMM: () => void;
}
export const useUnitStore = create<UnitState>()(persist((set) => ({
  isDegree: true, isMM: true, forceUnit: 'N', torqueUnit: 'N·m', massUnit: 'kg',
  setUnits: (preferences) => set(preferences),
  toggleDegree: () => set((state) => ({ isDegree: !state.isDegree })),
  toggleMM: () => set((state) => ({ isMM: !state.isMM })),
}), { name: 'rocos-units' }));

export function useUnits() {
  return displayUnits(useUnitStore());
}
