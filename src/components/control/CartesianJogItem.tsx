import { useHeldJog } from '@/hooks/useHeldJog';
import { useCallback } from 'react';
import { Button } from 'antd';
import { useControlStore } from '@/stores/controlStore';
import {
  JOG_COMMAND_TIMEOUT_S,
  cartesianMotionParams,
  jointMotionParams,
} from '@/core/constants';

interface CartesianJogItemProps {
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

export function CartesianJogItem({ label, value, frameName, freedom, isPosition }: CartesianJogItemProps) {
  const isMM = useControlStore((s) => s.isMM);
  const isDegree = useControlStore((s) => s.isDegree);
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
      <span className="jog-label" style={{ width: 24 }}>{label}</span>

      <Button
        className="jog-btn"
          {...bind(-1)}
      >
        −
      </Button>

      <span className="jog-value" style={{ flex: 1, textAlign: 'right' }}>
        {displayValue} {displayUnit}
      </span>

      <Button
        className="jog-btn"
          {...bind(1)}
      >
        +
      </Button>
    </div>
  );
}
