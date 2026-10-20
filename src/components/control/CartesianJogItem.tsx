import { useUnitStore } from '@/stores/unitStore';
import { useHeldJog } from '@/hooks/useHeldJog';
import { useCallback } from 'react';
import { Button } from 'antd';
import { RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { useControlStore } from '@/stores/controlStore';
import {
  JOG_COMMAND_TIMEOUT_S,
  cartesianMotionParams,
  jointMotionParams,
} from '@/core/constants';

interface CartesianJogItemProps {
  showValue?: boolean;
  label: string;
  value: number;
  /** 参考坐标系名称: BASE / FLANGE / TOOL / OBJECT */
  frameName: string;
  /** twist 向量中的轴索引: 0=vx, 1=vy, 2=vz, 3=wx, 4=wy, 5=wz */
  freedom: number;
  unit: 'mm' | 'deg';
  isPosition: boolean;
}

/** 将坐标系名称转为后端接受的 frame 参数 */
function frameToJogFrame(frameName: string): 'BASE' | 'FLANGE' | 'TOOL' | 'OBJECT' {
  const map: Record<string, 'BASE' | 'FLANGE' | 'TOOL' | 'OBJECT'> = {
    BASE: 'BASE', FLANGE: 'FLANGE', TOOL: 'TOOL', OBJECT: 'OBJECT',
  };
  return map[frameName] ?? 'BASE';
}

export function CartesianJogItem({ label, value, frameName, freedom, isPosition, showValue = true }: CartesianJogItemProps) {
  const isMM = useUnitStore((s) => s.isMM);
  const isDegree = useUnitStore((s) => s.isDegree);
  const speedFactor = useControlStore((s) => s.speedFactor);

  const displayValue = isPosition
    ? (value * (isMM ? 1000 : 1)).toFixed(2)
    : (value * (isDegree ? 180 / Math.PI : 1)).toFixed(2);

  const displayUnit = isPosition ? (isMM ? 'mm' : 'm') : (isDegree ? 'deg' : 'rad');

  /** 构建 6 维 twist 向量，仅在 freedom 轴处置 1 */
  const buildTwist = useCallback((sign: number): number[] => {
    const twist = [0, 0, 0, 0, 0, 0];
    twist[freedom] = sign;
    return twist;
  }, [freedom]);

  const { bind } = useHeldJog((client, sign) => client.jogCartesian(
    buildTwist(sign), frameToJogFrame(frameName),
    (isPosition ? cartesianMotionParams : jointMotionParams)(speedFactor).speed,
    JOG_COMMAND_TIMEOUT_S,
  ));

  return (
    <div className="jog-item">
      <span className="jog-label" data-axis={['X', 'Y', 'Z'][freedom % 3]}>{label}</span>

      <Button
        className="jog-btn jog-negative"
        aria-label={`${label} −`}
          {...bind(-1)}
      >
        {!isPosition && <RedoOutlined aria-hidden="true" />}−
      </Button>

      {showValue && <span className="jog-value" style={{ flex: 1, textAlign: 'right' }}>
        {displayValue} {displayUnit}
      </span>}

      <Button
        className="jog-btn jog-positive"
        aria-label={`${label} +`}
          {...bind(1)}
      >
        {!isPosition && <UndoOutlined aria-hidden="true" />}+
      </Button>
    </div>
  );
}
