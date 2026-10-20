import { useHeldJog } from '@/hooks/useHeldJog';
import { useCallback } from 'react';
import { Button, Tooltip } from 'antd';
import { useControlStore } from '@/stores/controlStore';
import { PositionBar } from '@/components/common/PositionBar';
import { useT } from '@/i18n/useT';
import type { JointState } from '@/core/types';
import {
  JOG_COMMAND_TIMEOUT_S,
  jointMotionParams,
  MAX_JOINTS,
} from '@/core/constants';

interface JointJogItemProps {
  index: number;
  joint: JointState;
  jointCount?: number;
}

export function JointJogItem({ index, joint, jointCount = MAX_JOINTS }: JointJogItemProps) {
  const t = useT();
  const isDegree = useControlStore((s) => s.isDegree);
  const speedFactor = useControlStore((s) => s.speedFactor);

  const displayValue = isDegree
    ? ((joint.position * 180) / Math.PI).toFixed(2)
    : joint.position.toFixed(4);

  const unit = isDegree ? 'deg' : 'rad';

  /** 构建关节方向向量，仅在目标关节处置 1 */
  const buildJoints = useCallback((sign: number): number[] => {
    const joints = new Array(jointCount).fill(0);
    joints[index] = sign;
    return joints;
  }, [index, jointCount]);

  const { bind } = useHeldJog((client, sign) => client.jogJoint(
    buildJoints(sign), jointMotionParams(speedFactor).speed, JOG_COMMAND_TIMEOUT_S,
  ));

  return (
    <div className="jog-item">
      <span className="jog-label">J{index + 1}</span>

      <Tooltip title={t('jog.negative')}>
        <Button
          className="jog-btn"
          {...bind(-1)}
        >
          −
        </Button>
      </Tooltip>

      <div className="position-bar" style={{ flex: 1 }}>
        <PositionBar value={joint.position} min={-3.14} max={3.14} />
      </div>

      <span className="jog-value">
        {displayValue} {unit}
      </span>

      <Tooltip title={t('jog.positive')}>
        <Button
          className="jog-btn"
          {...bind(1)}
        >
          +
        </Button>
      </Tooltip>
    </div>
  );
}
