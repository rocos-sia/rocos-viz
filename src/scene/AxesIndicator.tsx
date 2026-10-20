import { typography } from '@/styles/typography';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

export function AxesIndicator() {
  const narrow = useThree((state) => state.size.width < 420);
  return (
    <GizmoHelper alignment="bottom-left" margin={[60, narrow ? 116 : 60]}>
      <GizmoViewport
        font={`${typography.body}px AlibabaPuHuiTi`}
        axisColors={['#e74c3c', '#2ecc71', '#3498db']}
        labelColor="white"
      />
    </GizmoHelper>
  );
}
