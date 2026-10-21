import { Euler, Quaternion } from 'three';
import { preciseReference } from './PreciseMotion';
import type { RobotState } from './types';

/** Display the selected frame's origin and orientation relative to the base. */
export function displayPose(frame: number, state: RobotState | null): number[] | null {
  const pose = preciseReference(frame, state);
  if (!pose) return null;
  const { x, y, z, w } = pose.orientation;
  const rotation = new Euler().setFromQuaternion(new Quaternion(x, y, z, w).normalize(), 'ZYX');
  return [pose.position.x, pose.position.y, pose.position.z, rotation.x, rotation.y, rotation.z];
}
