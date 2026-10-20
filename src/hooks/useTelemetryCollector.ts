import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { telemetryBuffer } from '@/core/TelemetryBuffer';

export function useTelemetryCollector() {
  const connected = useConnectionStore((s) => s.isConnected);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  useEffect(() => {
    telemetryBuffer.clear();
    if (!connected) return;
    return useRobotStateStore.subscribe(({ robotState: state }) => {
      if (!state) return;
      const values: Record<string, number> = {};
      state.joint_states.forEach((joint, index) => {
        values[`joint_position_${index}`] = joint.position;
        values[`joint_velocity_${index}`] = joint.velocity;
        values[`joint_torque_${index}`] = joint.torque;
        values[`joint_load_${index}`] = joint.load ?? joint.load_torque ?? NaN;
      });
      if (state.flange) {
        values.flange_x = state.flange.position.x;
        values.flange_y = state.flange.position.y;
        values.flange_z = state.flange.position.z;
      }
      telemetryBuffer.appendFrame(state.timestamp ? state.timestamp * 1000 : Date.now(), values);
    });
  }, [connected, host, port]);
}
