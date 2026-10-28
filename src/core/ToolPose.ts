import { Euler, Quaternion } from 'three';
import type { Pose } from './types';

/** 工具包预览：缺失的变换或分量按单位阵显示，不写回控制器。 */
export function toolPackagePose(pose?: Pose | null): Pose {
  return {
    position: { x: pose?.position?.x ?? 0, y: pose?.position?.y ?? 0, z: pose?.position?.z ?? 0 },
    orientation: { x: pose?.orientation?.x ?? 0, y: pose?.orientation?.y ?? 0, z: pose?.orientation?.z ?? 0, w: pose?.orientation?.w ?? 1 },
  };
}

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
