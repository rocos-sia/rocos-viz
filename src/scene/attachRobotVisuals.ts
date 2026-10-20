import type { URDFRobot } from 'urdf-loader';
import { useUIStore } from '@/stores/uiStore';
import { createRobotVisuals } from './RobotVisuals';

/** Subscribe after loading so toggles changed during mesh downloads are respected. */
export function attachRobotVisuals(robot: URDFRobot) {
  const visuals = createRobotVisuals(robot);
  visuals.update(useUIStore.getState());
  const unsubscribe = useUIStore.subscribe((state, previous) => {
    if (state.showTransparent !== previous.showTransparent
      || state.showJointFrames !== previous.showJointFrames
      || state.showJointAxes !== previous.showJointAxes) {
      visuals.update(state);
    }
  });
  return () => {
    unsubscribe();
    visuals.dispose();
  };
}
