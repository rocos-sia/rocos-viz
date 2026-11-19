export const motionLocked = motion => !!motion && ['submitting', 'waiting', 'running', 'paused', 'stopping', 'unknown'].includes(motion.phase);

export function targetError(kind, body, state, names) {
  if (body.joints) {
    const actual = names.map(name => state.joint_states.find(joint => joint.name === name)?.position);
    return { joint: Math.max(...actual.map((value, index) => Math.abs(value - body.joints[index]))) };
  }
  const pose = kind === 'movej_ik' ? state.flange : state.tcp;
  if (!body.pose || !pose) return null;
  const position = Math.hypot(...['x', 'y', 'z'].map(axis => pose.position[axis] - body.pose.position[axis]));
  const first = ['x', 'y', 'z', 'w'].map(axis => pose.orientation[axis]);
  const second = ['x', 'y', 'z', 'w'].map(axis => body.pose.orientation[axis]);
  const dot = Math.abs(first.reduce((sum, value, index) => sum + value * second[index], 0) / Math.hypot(...first) / Math.hypot(...second));
  return { position, angle: 2 * Math.acos(Math.min(1, dot)) };
}

export function advanceMotion(motion, state, names, now = Date.now()) {
  if (!motionLocked(motion) || motion.phase === 'submitting') return motion;
  const instance = motion.stopEpoch ? motion.stopInstance : motion.instanceId;
  if (instance && state.instance_id !== instance) return { ...motion, phase: 'unknown', quiet: 0 };
  if (motion.instanceId) {
    const baseline = motion.stopEpoch ? motion.stopAfterSequence : motion.afterSequence;
    if (!Number.isSafeInteger(state.state_seq) || state.state_seq <= (motion.lastSequence ?? baseline ?? 0)) return motion;
  } else if (state.timestamp === (motion.lastTimestamp ?? motion.afterTimestamp)) return motion;
  const next = { ...motion, lastSequence: state.state_seq, lastTimestamp: state.timestamp, error: targetError(motion.kind, motion.body, state, names) };
  const command = state.command?.command_id === motion.commandId && state.command?.motion_epoch === motion.epoch ? state.command : null;
  if (command && ['rejected', 'failed'].includes(command.status) && motion.phase !== 'stopping') return { ...next, phase: 'failed', ended: now };
  // Idle feedback cannot prove an unknown/in-transit request was cancelled.
  // A late rejected response must also not override an acknowledged stop.
  const fencedStop = motion.phase === 'stopping' && motion.stopEpoch && state.motion_epoch >= motion.stopEpoch;
  if (motion.phase === 'stopping' && !fencedStop) return { ...next, quiet: 0 };
  if (motion.commandId && !fencedStop && !command) return { ...next, phase: motion.phase === 'unknown' ? 'unknown' : motion.phase, quiet: 0 };
  if (/ERROR|FAULT/.test(state.robot_state)) return { ...next, phase: 'failed', ended: now };
  if (state.robot_state === 'PAUSED') return { ...next, phase: motion.phase === 'stopping' ? 'stopping' : 'paused', runningSeen: true, quiet: 0 };
  if (state.motion_busy || !['IDLE', 'STOPPED'].includes(state.robot_state)) return { ...next, phase: motion.phase === 'stopping' ? 'stopping' : 'running', runningSeen: true, quiet: 0 };
  const stationary = state.joint_states.every(joint => Number.isFinite(joint.velocity) && Math.abs(joint.velocity) < .0001);
  next.quiet = stationary ? (motion.quiet || 0) + 1 : 0;
  if (fencedStop && next.quiet >= 3) return { ...next, phase: 'stopped', ended: now };
  if (command?.status === 'stopped' && next.quiet >= 3) return { ...next, phase: 'stopped', ended: now };
  const reached = next.error && (next.error.joint !== undefined ? next.error.joint < .001 : next.error.position < .0005 && next.error.angle < .002);
  const finished = motion.commandId ? command?.status === 'finished' : motion.phase !== 'unknown';
  if (next.quiet >= 3 && finished && reached) return { ...next, phase: 'completed', ended: now };
  if (next.quiet >= 3 && finished && (command || motion.runningSeen)) return { ...next, phase: 'stopped', ended: now };
  if (motion.phase === 'unknown' && command && ['accepted', 'running', 'paused'].includes(command.status)) next.phase = 'waiting';
  return next;
}
