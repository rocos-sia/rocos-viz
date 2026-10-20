import { useRobotStateStore } from '@/stores/robotStateStore';
import { CartesianJogItem } from './CartesianJogItem';
import { useControlStore } from '@/stores/controlStore';
import { useT } from '@/i18n/useT';
import { FRAME } from '@/core/constants';
import * as THREE from 'three';
import { CartesianJogLayout } from './CartesianJogLayout';

function quaternionToRPY(q: { x: number; y: number; z: number; w: number }) {
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(q.x, q.y, q.z, q.w),
    'ZYX',
  );
  return { roll: euler.x, pitch: euler.y, yaw: euler.z };
}

/** FRAME 常量 → 后端 jog/cartesian 接受的 frame 字符串 */
function frameToName(frame: number): string {
  switch (frame) {
    case FRAME.TOOL: return 'TOOL';
    case FRAME.FLANGE: return 'FLANGE';
    case FRAME.OBJECT: return 'OBJECT';
    default: return 'BASE';
  }
}

export function CartesianJogPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const robotState = useRobotStateStore((s) => s.robotState);
  const currentFrame = useControlStore((s) => s.currentFrame);

  const getPoseData = () => {
    if (!robotState) return null;

    switch (currentFrame) {
      case FRAME.FLANGE:
        return robotState.flange;
      case FRAME.TOOL:
        return robotState.active_tool_frame ?? robotState.flange;
      case FRAME.OBJECT:
        return robotState.active_object_frame ?? robotState.flange;
      default:
        return robotState.flange;
    }
  };

  const pose = getPoseData();
  const rpy = pose ? quaternionToRPY(pose.orientation) : { roll: 0, pitch: 0, yaw: 0 };
  const frameName = frameToName(currentFrame);

  if (compact) {
    const values = [pose?.position.x ?? 0, pose?.position.y ?? 0, pose?.position.z ?? 0, rpy.roll, rpy.pitch, rpy.yaw];
    return <CartesianJogLayout renderAxis={(i) => <CartesianJogItem key={i}
      showValue={false} label={['X', 'Y', 'Z', 'RX', 'RY', 'RZ'][i]} value={values[i]}
      frameName={frameName} freedom={i} unit={i < 3 ? 'mm' : 'deg'} isPosition={i < 3} />} />;
  }

  const getFrameLabel = () => {
    switch (currentFrame) {
      case FRAME.BASE: return t('frame.BASE');
      case FRAME.FLANGE: return t('frame.FLANGE');
      case FRAME.TOOL: return t('frame.TOOL');
      case FRAME.OBJECT: return t('frame.OBJECT');
      default: return t('frame.BASE');
    }
  };

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        {t('jog.cartesianSpace')} (<span className="frame-highlight">{getFrameLabel()}</span>)
      </div>
      <div>
        <CartesianJogItem
          showValue={!compact}
          label="X"
          value={pose?.position.x || 0}
          frameName={frameName}
          freedom={0}
          unit="mm"
          isPosition={true}
        />
        <CartesianJogItem
          showValue={!compact}
          label="Y"
          value={pose?.position.y || 0}
          frameName={frameName}
          freedom={1}
          unit="mm"
          isPosition={true}
        />
        <CartesianJogItem
          showValue={!compact}
          label="Z"
          value={pose?.position.z || 0}
          frameName={frameName}
          freedom={2}
          unit="mm"
          isPosition={true}
        />
        <CartesianJogItem
          showValue={!compact}
          label={compact ? 'RX' : 'R'}
          value={rpy.roll}
          frameName={frameName}
          freedom={3}
          unit="deg"
          isPosition={false}
        />
        <CartesianJogItem
          showValue={!compact}
          label={compact ? 'RY' : 'P'}
          value={rpy.pitch}
          frameName={frameName}
          freedom={4}
          unit="deg"
          isPosition={false}
        />
        <CartesianJogItem
          showValue={!compact}
          label={compact ? 'RZ' : 'Y'}
          value={rpy.yaw}
          frameName={frameName}
          freedom={5}
          unit="deg"
          isPosition={false}
        />
      </div>
    </div>
  );
}
