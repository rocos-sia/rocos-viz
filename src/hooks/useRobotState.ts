import { useEffect, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useControlStore } from '@/stores/controlStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { preciseReference } from '@/core/PreciseMotion';
import { FRAME } from '@/core/constants';

export function useRobotState() {
  const robotState = useRobotStateStore((s) => s.robotState);
  const isConnected = useConnectionStore((s) => s.isConnected);

  return {
    robotState,
    isConnected,
    jointAngles: robotState?.joint_states.map((js) => js.position) || [],
    flangePose: robotState?.flange,
    toolPose: preciseReference(FRAME.TOOL, robotState),
    toolFrame: robotState?.active_tool_frame,
    objectPose: robotState?.active_object_frame,
    hardware: robotState?.hw_state,
  };
}
