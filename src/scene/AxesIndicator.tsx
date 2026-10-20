import { GizmoHelper, GizmoViewport } from '@react-three/drei';

export function AxesIndicator() {
  return (
    <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
      <GizmoViewport
        font="14px AlibabaPuHuiTi"
        axisColors={['#e74c3c', '#2ecc71', '#3498db']}
        labelColor="white"
      />
    </GizmoHelper>
  );
}
