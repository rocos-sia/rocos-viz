import type { MotionPreview, PreviewMotionType, RobotState } from './types';

/** Reject incomplete or misordered trajectories before they can become a virtual start. */
export function validateMotionPreview(value: MotionPreview, names: string[], start?: number[], type?: PreviewMotionType): MotionPreview {
  const finite = (values: number[]) => values.every(Number.isFinite);
  if (!value || !Array.isArray(value.joint_names) || value.joint_names.length !== names.length
    || value.joint_names.some((name, i) => name !== names[i])
    || !Number.isFinite(value.duration) || value.duration < 0 || value.duration > 120
    || !Array.isArray(value.points) || !value.points.length || value.points.length > 2000) {
    throw new Error('Invalid motion preview');
  }
  let previous = -1;
  for (const point of value.points) {
    const pose = point.flange;
    if (!Number.isFinite(point.time_from_start) || point.time_from_start <= previous
      || point.time_from_start > value.duration || !Array.isArray(point.positions)
      || point.positions.length !== names.length || !finite(point.positions)
      || !pose?.position || !pose.orientation
      || !finite([pose.position.x, pose.position.y, pose.position.z,
        pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w])
      || Math.hypot(pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w) < 1e-12) {
      throw new Error('Invalid motion preview point');
    }
    previous = point.time_from_start;
  }
  if ((type && value.motion_type !== type) || (start && value.points[0].positions.some((q, i) => Math.abs(q - start[i]) > 1e-8))) throw new Error('Mismatched motion preview');
  if (!Array.isArray(value.checks) || !['joint_position', 'joint_velocity', 'kinematics'].every(check => value.checks.includes(check))
    || value.collision_checked !== false || value.execution_checked !== false) throw new Error('Unsupported preview validation');
  if (value.points[0].time_from_start !== 0 || previous !== value.duration) throw new Error('Incomplete motion preview');
  return value;
}

/** Virtual state is a separate snapshot. Never write it into the telemetry store. */
export function previewEndState(start: RobotState, preview: MotionPreview): RobotState {
  const last = preview.points[preview.points.length - 1];
  return {
    ...start,
    joint_states: start.joint_states.map((joint, i) => ({ ...joint, position: last.positions[i] })),
    flange: last.flange,
    // Let preciseReference compose the virtual flange and the tool snapshot.
    tcp: undefined,
  };
}

export function previewPositionsAt(preview: MotionPreview, time: number): number[] {
  const points = preview.points;
  if (time <= 0) return points[0].positions;
  if (time >= preview.duration) return points[points.length - 1].positions;
  let low = 0, high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].time_from_start <= time) low = mid;
    else high = mid;
  }
  const a = points[low], b = points[high];
  const fraction = (time - a.time_from_start) / (b.time_from_start - a.time_from_start);
  return a.positions.map((q, i) => q + (b.positions[i] - q) * fraction);
}

/** Repeat forward from the start, preserving the planner's timing each cycle. */
export function advancePreviewPlayback(time: number, elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  return (time + Math.max(0, elapsed)) % duration;
}
