import { Euler, Quaternion } from 'three';
import type { Pose } from './types';

/** 法兰→工具位姿，平移单位 m，RPY 单位 rad，ZYX 对齐 KDL::Rotation::RPY。 */
export function toolPoseValues(pose: Pose): number[] {
  const { x, y, z, w } = pose.orientation;
  const rpy = new Euler().setFromQuaternion(new Quaternion(x, y, z, w).normalize(), 'ZYX');
  return [pose.position.x, pose.position.y, pose.position.z, rpy.x, rpy.y, rpy.z];
}

export function toolPoseFromValues(values: number[]): Pose {
  if (values.length !== 6 || !values.every(Number.isFinite)) throw new Error('Invalid tool pose');
  const [x, y, z, roll, pitch, yaw] = values;
  const q = new Quaternion().setFromEuler(new Euler(roll, pitch, yaw, 'ZYX'));
  return { position: { x, y, z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } };
}
