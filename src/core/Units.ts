/** Display factors from controller SI units. Stored robot data always stays in SI. */
export interface UnitPreferences {
  isDegree: boolean;
  isMM: boolean;
  forceUnit: 'N' | 'kN';
  torqueUnit: 'N·m' | 'N·mm';
  massUnit: 'kg' | 'g';
}
export function displayUnits(p: UnitPreferences) {
  return {
    angle: { label: p.isDegree ? 'deg' : 'rad', factor: p.isDegree ? 180 / Math.PI : 1 },
    length: { label: p.isMM ? 'mm' : 'm', factor: p.isMM ? 1000 : 1 },
    force: { label: p.forceUnit, factor: p.forceUnit === 'kN' ? 0.001 : 1 },
    torque: { label: p.torqueUnit, factor: p.torqueUnit === 'N·mm' ? 1000 : 1 },
    mass: { label: p.massUnit, factor: p.massUnit === 'g' ? 1000 : 1 },
  };
}
export function chartUnit(source: string, preferences: UnitPreferences) {
  const units = displayUnits(preferences);
  if (source === 'joint_velocity') return { ...units.angle, label: `${units.angle.label}/s` };
  if (source === 'joint_position') return units.angle;
  if (source === 'joint_torque' || source === 'joint_load') return units.torque;
  return units.length;
}
