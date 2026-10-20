import { useHeldJog } from '@/hooks/useHeldJog';
import { useCallback } from 'react';
import { Button } from 'antd';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useControlStore } from '@/stores/controlStore';
import { useT } from '@/i18n/useT';
import {
  JOG_COMMAND_TIMEOUT_S,
  jointMotionParams,
} from '@/core/constants';

/**
 * Null-space jog panel (SVD 维度速度点动).
 *
 * 零空间维度 = max(0, DOF - 6)。每个维度生成一对 +/- 点动按钮。
 * 通过 jogSvd 发送各维度速度标量到后端执行。
 */
export function NullSpacePanel() {
  const t = useT();
  const robotState = useRobotStateStore((s) => s.robotState);

  const dof = robotState?.joint_states?.length ?? 0;
  const nullDims = Math.max(0, dof - 6);

  if (nullDims === 0) return null;

  const dims = Array.from({ length: nullDims }, (_, i) => ({
    label: `N${i + 1}`,
    index: i,
  }));

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        {t('jog.nullSpace')}
      </div>
      <div>
        {dims.map((dim) => (
          <NullSpaceJogItem
            key={dim.label}
            label={dim.label}
            dimIndex={dim.index}
            nullDims={nullDims}
          />
        ))}
      </div>
    </div>
  );
}

interface NullSpaceJogItemProps {
  label: string;
  dimIndex: number;
  nullDims: number;
}

function NullSpaceJogItem({ label, dimIndex, nullDims }: NullSpaceJogItemProps) {

  /** 构建 SVD 维度速度向量（长度 = nullDims），仅在目标维度处为非零 */
  const buildDimSpeeds = useCallback((sign: number): number[] => {
    const dimSpeeds = new Array(nullDims).fill(0);
    dimSpeeds[dimIndex] = sign * jointMotionParams(useControlStore.getState().speedFactor).speed;
    return dimSpeeds;
  }, [dimIndex, nullDims]);

  const { bind } = useHeldJog((client, sign) => client.jogSvd(buildDimSpeeds(sign), JOG_COMMAND_TIMEOUT_S));

  return (
    <div className="jog-item">
      <span className="jog-label" style={{ width: 24 }}>{label}</span>

      <Button
        className="jog-btn"
          {...bind(-1)}
      >
        −
      </Button>

      <span className="jog-value" style={{ flex: 1, textAlign: 'right' }}>0.00</span>

      <Button
        className="jog-btn"
          {...bind(1)}
      >
        +
      </Button>
    </div>
  );
}
