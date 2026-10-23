import { Html } from '@react-three/drei';
import { Quaternion, Vector3 } from 'three';
import { FRAME } from '@/core/constants';
import { preciseReference } from '@/core/PreciseMotion';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useT } from '@/i18n/useT';

const length = 0.12;
const axes = [
  { name: 'X', direction: [1, 0, 0], color: '#ef4444' },
  { name: 'Y', direction: [0, 1, 0], color: '#22c55e' },
  { name: 'Z', direction: [0, 0, 1], color: '#3b82f6' },
].map(({ name, direction, color }) => ({
  name, color,
  rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...direction)),
  labelPosition: direction.map((value) => value * (length + 0.015)) as [number, number, number],
}));

/** Parent space must match the robot's base, including any preview centering/rotation. */
export function ToolFrameAxes() {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const state = useRobotStateStore((s) => s.robotState);
  const name = state?.active_tool_frame_name;
  const pose = connected && name ? preciseReference(FRAME.TOOL, state) : null;
  if (!pose) return null;
  const { x, y, z, w } = pose.orientation;
  const rotation = new Quaternion(x, y, z, w).normalize();
  return <group name="active-tool-frame" position={[pose.position.x, pose.position.y, pose.position.z]}
    quaternion={rotation} userData={{ toolName: name }}>
    {axes.map((axis) => <group key={axis.name} name={`tool-axis-${axis.name}`} quaternion={axis.rotation}>
      <mesh position={[0, (length - 0.025) / 2, 0]} renderOrder={1001}>
        <cylinderGeometry args={[0.0025, 0.0025, length - 0.025, 12]} />
        <meshBasicMaterial color={axis.color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, length - 0.0125, 0]} renderOrder={1001}>
        <coneGeometry args={[0.008, 0.025, 12]} />
        <meshBasicMaterial color={axis.color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>)}
    <mesh name="tool-frame-origin" renderOrder={1002}>
      <sphereGeometry args={[0.0045, 12, 8]} />
      <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
    {axes.map((axis) => <Html key={axis.name} center position={axis.labelPosition} zIndexRange={[5, 0]}
      style={{ pointerEvents: 'none' }}>
      <span className="scene-tool-axis-label" style={{ color: axis.color }}>{axis.name}</span>
    </Html>)}
    <Html position={[0, 0, 0]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <span className="scene-tool-frame-label" aria-label={`${t('scene.toolFrame')}: ${name}`}>TCP · {name}</span>
    </Html>
  </group>;
}
