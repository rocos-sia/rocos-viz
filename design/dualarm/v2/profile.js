import shoulderFrames from '../../../../rocos-mujoco/config/dualarm/shoulder_frames.json';
import { dualArmChains } from '../../../src/dualarm/scene/frames';

// Explicit opt-in: the original preview remains available without the query.
export const shoulderTrial = new URLSearchParams(location.search).get('base') === 'shoulder';
export const modelFile = shoulderTrial ? 'dualarm_shoulder.urdf' : 'dualarm.urdf';
export const chains = shoulderTrial ? Object.fromEntries(
  Object.entries(shoulderFrames.arms).map(([side, frame]) =>
    [side, { base: frame.base_link, tip: frame.tip_link }]),
) : dualArmChains;
export const baseDescription = shoulderTrial ? '各臂肩部基坐标系' : '公共基坐标系';

// Only for points expressed in the legacy base, never flange-relative TCP data.
export function inSelectedBase(side, xyz) {
  return shoulderTrial ? xyz.map((value, i) => value - shoulderFrames.arms[side].translation[i]) : xyz;
}
