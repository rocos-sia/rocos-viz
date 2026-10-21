import { useState, useEffect, useRef, useId } from 'react';
import { Button, InputNumber, Segmented, message } from 'antd';
import { useUnitStore } from '@/stores/unitStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useControlStore } from '@/stores/controlStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useCompactScreen } from '@/hooks/useCompactScreen';
import { RobotApiClient } from '@/core/RobotApiClient';
import { FRAME, jointMotionParams, cartesianMotionParams } from '@/core/constants';
import { preciseReference, preciseTarget } from '@/core/PreciseMotion';
import { useT } from '@/i18n/useT';

type Command = 'MoveJ' | 'MoveL_FK' | 'MoveJ_IK' | 'MoveL';

export function MotionCommandPanel() {
  const t = useT();
  const id = useId();
  const compact = useCompactScreen();
  const isDegree = useUnitStore((s) => s.isDegree);
  const isMM = useUnitStore((s) => s.isMM);
  const connected = useConnectionStore((s) => s.isConnected);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const token = useConnectionStore((s) => s.controlToken);
  const currentFrame = useControlStore((s) => s.currentFrame);
  const state = useRobotStateStore((s) => s.robotState);
  const jointCount = state?.joint_states.length || 7;
  const [space, setSpace] = useState('joint');
  const [cartesian, setCartesian] = useState([0, 0, 0, 0, 0, 0]);
  const [joints, setJoints] = useState<number[]>(() => Array(jointCount).fill(0));
  const [pending, setPending] = useState<Command | null>(null);
  const sending = useRef(false);
  const reference = preciseReference(currentFrame, state);
  const allowed = connected && enabled && !!token && !compact;
  const available = space === 'joint' ? !!state?.joint_states.length : !!reference;

  useEffect(() => { setJoints((values) => Array.from({ length: jointCount }, (_, i) => values[i] ?? 0)); }, [jointCount]);

  const send = async (command: Command) => {
    const connection = useConnectionStore.getState();
    if (sending.current || !connection.isConnected || !connection.isRobotEnabled || !connection.controlToken || compact) return;
    const robot = useRobotStateStore.getState().robotState;
    const { currentFrame: frame, speedFactor } = useControlStore.getState();
    const jointTarget = command === 'MoveJ' || command === 'MoveL_FK';
    const values = jointTarget ? joints : cartesian;
    const targetReference = preciseReference(frame, robot);
    if (!values.every(Number.isFinite) || (jointTarget ? !robot?.joint_states.length || joints.length !== robot.joint_states.length : !targetReference)) return;
    sending.current = true;
    setPending(command);
    try {
      const client = new RobotApiClient(connection.host, connection.port);
      const { speed, acceleration } = command === 'MoveJ' || command === 'MoveJ_IK'
        ? jointMotionParams(speedFactor) : cartesianMotionParams(speedFactor);
      if (command === 'MoveJ') await client.moveJ(joints, speed, acceleration);
      else if (command === 'MoveL_FK') await client.moveL_FK(joints, speed, acceleration);
      else {
        const pose = preciseTarget(cartesian, targetReference!);
        if (command === 'MoveJ_IK') await client.moveJ_IK(pose, speed, acceleration);
        else await client.moveL(pose, speed, acceleration);
      }
      message.success(t('common.sent', { cmd: command }));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      sending.current = false;
      setPending(null);
    }
  };

  const angleFactor = isDegree ? 180 / Math.PI : 1;
  const lengthFactor = isMM ? 1000 : 1;
  const frameLabel = t(currentFrame === FRAME.TOOL ? 'frame.TOOL' : currentFrame === FRAME.OBJECT ? 'frame.OBJECT' : currentFrame === FRAME.FLANGE ? 'frame.FLANGE' : 'frame.BASE');
  const commands: Command[] = space === 'joint' ? ['MoveJ', 'MoveL_FK'] : ['MoveJ_IK', 'MoveL'];
  const values = space === 'joint' ? joints : cartesian;

  return <div className="precise-panel">
    <Segmented className="teach-jog-space precise-space" block aria-label={t('precise.targetSpace')}
      value={space} onChange={(value) => setSpace(String(value))} options={[
        { value: 'joint', label: t('precise.jointPosition') },
        { value: 'cartesian', label: t('precise.cartesianPose') },
      ]} />
    {space === 'cartesian' && <div className="precise-reference">
      {t('precise.reference', { frame: frameLabel })}
      {currentFrame !== FRAME.BASE && <span>{t('precise.referenceAtExecution')}</span>}
      {!reference && <span role="status">{t('precise.frameUnavailable')}</span>}
    </div>}
    <fieldset className="teach-control-fieldset precise-fields" disabled={!allowed || !!pending} aria-label={t(space === 'joint' ? 'precise.jointPosition' : 'precise.cartesianPose')}>
      <div className="precise-grid">
        {values.map((value, index) => {
          const label = space === 'joint' ? `J${index + 1}` : ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'][index];
          const position = space === 'cartesian' && index < 3;
          const factor = position ? lengthFactor : angleFactor;
          const inputId = `${id}-${space}-${index}`;
          return <div className="precise-field" key={inputId}>
            <label className="precise-field-label" htmlFor={inputId}>{label}</label>
            <InputNumber id={inputId} aria-label={label} value={value * factor}
              onChange={(v) => {
                if (v !== null && !Number.isFinite(v)) return;
                const update = space === 'joint' ? setJoints : setCartesian;
                update((previous) => previous.map((old, i) => i === index ? (v ?? 0) / factor : old));
              }} step={1} min={space === 'joint' ? -Math.PI * angleFactor : undefined}
              max={space === 'joint' ? Math.PI * angleFactor : undefined}
              controls={false} className="precise-input" disabled={!allowed || !!pending} />
            <span className="precise-field-unit">{position ? (isMM ? 'mm' : 'm') : (isDegree ? 'deg' : 'rad')}</span>
          </div>;
        })}
      </div>
    </fieldset>
    <div className="precise-actions">
      {commands.map((command, index) => <Button key={command} type={index === 0 ? 'primary' : 'default'}
        disabled={!allowed || !available || !!pending} loading={pending === command} onClick={() => void send(command)}>
        <span className="precise-action-label"><span>{t(index === 0 ? 'precise.jointMotion' : 'precise.cartesianMotion')}</span><span>({command})</span></span>
      </Button>)}
    </div>
  </div>;
}
