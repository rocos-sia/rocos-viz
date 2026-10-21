import { Euler, Quaternion, Vector3 } from 'three';
import { FRAME } from './constants';
import type { Pose, RobotState } from './types';

function quaternion(pose: Pose) {
  const { x, y, z, w } = pose.orientation;
  return new Quaternion(x, y, z, w).normalize();
}

function validPose(pose: Pose | undefined): pose is Pose {
  if (!pose?.position || !pose.orientation) return false;
  const { x, y, z, w } = pose.orientation;
  const norm = x * x + y * y + z * z + w * w;
  return [pose.position.x, pose.position.y, pose.position.z, x, y, z, w].every(Number.isFinite)
    && Number.isFinite(norm) && norm > 0;
}

/** Compose parent→reference and reference→target, with translations in metres. */
function compose(parent: Pose, target: Pose): Pose {
  const rotation = quaternion(parent);
  const position = new Vector3(target.position.x, target.position.y, target.position.z)
    .applyQuaternion(rotation).add(new Vector3(parent.position.x, parent.position.y, parent.position.z));
  const orientation = rotation.multiply(quaternion(target));
  return {
    position: { x: position.x, y: position.y, z: position.z },
    orientation: { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
  };
}

/** Frame snapshots: flange is base→flange, tool is flange→tool, object is base→object. */
export function preciseReference(frame: number, state: RobotState | null): Pose | null {
  if (frame === FRAME.BASE) return { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
  if (frame === FRAME.FLANGE) return validPose(state?.flange) ? state.flange : null;
  if (frame === FRAME.OBJECT) return state?.active_object_frame_name && validPose(state.active_object_frame) ? state.active_object_frame : null;
  if (frame === FRAME.TOOL && state?.active_tool_frame_name && validPose(state.flange) && validPose(state.active_tool_frame)) {
    return compose(state.flange, state.active_tool_frame);
  }
  return null;
}

/** Both MoveJ_IK and MoveL (without tool_name) accept a base-frame flange target. */
export function preciseTarget(values: number[], reference: Pose): Pose {
  const [x, y, z, roll, pitch, yaw] = values;
  const q = new Quaternion().setFromEuler(new Euler(roll, pitch, yaw, 'ZYX'));
  return compose(reference, { position: { x, y, z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } });
}
