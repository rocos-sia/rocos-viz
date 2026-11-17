import { Matrix4, Quaternion, Vector3 } from 'three';
import type { URDFRobot } from 'urdf-loader';
import type { Pose } from '@/core/types';

// Match config/dualarm/app/robot_{left,right}.yaml. Both chains share this base.
export const dualArmChains = {
  left: { base: 'base_link', tip: 'Left_Link7' },
  right: { base: 'base_link', tip: 'Right_Link7' },
} as const;

export function matrixPose(matrix: Matrix4): Pose {
  const position = new Vector3(), orientation = new Quaternion();
  matrix.decompose(position, orientation, new Vector3());
  return {
    position: { x: position.x, y: position.y, z: position.z },
    orientation: { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
  };
}

export function poseMatrix(pose?: Pose | null): Matrix4 | null {
  if (!pose) return null;
  const { position: p, orientation: q } = pose;
  if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite)
    || Math.hypot(q.x, q.y, q.z, q.w) < 1e-12) return null;
  return new Matrix4().compose(new Vector3(p.x, p.y, p.z),
    new Quaternion(q.x, q.y, q.z, q.w).normalize(), new Vector3(1, 1, 1));
}

/** URDF preview FK, expressed in each controller chain's base, in SI units. */
export function previewFlange(robot: URDFRobot, side: keyof typeof dualArmChains): Pose | null {
  const chain = dualArmChains[side];
  const base = robot.links[chain.base], tip = robot.links[chain.tip];
  if (!base || !tip) return null;
  robot.updateMatrixWorld(true);
  return matrixPose(base.matrixWorld.clone().invert().multiply(tip.matrixWorld));
}
