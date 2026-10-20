import { useCompactScreen } from '@/hooks/useCompactScreen';
import { useState } from 'react';
import { Button, Drawer, Tabs, Alert } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { JointJogPanel } from '@/components/control/JointJogPanel';
import { CartesianJogPanel } from '@/components/control/CartesianJogPanel';
import { NullSpacePanel } from '@/components/control/NullSpacePanel';
import { MotionCommandPanel } from '@/components/control/MotionCommandPanel';
import { WorkModeSelector } from '@/components/control/WorkModeSelector';
import { FrameSelector } from '@/components/control/FrameSelector';
import { UnitToggle } from '@/components/common/UnitToggle';
import { useConnectionStore } from '@/stores/connectionStore';
import { useControlStore } from '@/stores/controlStore';
import { demoJoints, demoPosition } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { Robot3DCard } from './Robot3DCard';
import { TeachCard, DemoBadge } from './TeachCard';
import { JointReadout, PoseReadout } from './Overview';
import { ContextPanel } from './ContextPanel';

function PreviewJog({ kind, joints, onJointChange, onCartesianChange }: { kind: string; joints: number[]; onJointChange: (index: number, delta: number) => void; onCartesianChange: (index: number, delta: number) => void }) {
  const t = useT();
  const labels = kind === 'joint' ? joints.map((_, i) => `J${i + 1}`) : kind === 'cartesian' ? ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] : ['N1'];
  const change = (index: number, delta: number) => kind === 'joint' ? onJointChange(index, delta) : kind === 'cartesian' ? onCartesianChange(index, delta) : undefined;
  return <div className={`panel-section teach-preview-${kind}`}>
    <div className="panel-section-header">{t(kind === 'joint' ? 'teach.jointJog' : kind === 'cartesian' ? 'teach.cartesianJog' : 'teach.nullJog')}</div>
    {labels.map((label, i) => <div className="teach-preview-jog" key={label}>
      <strong>{label}</strong>
      <Button aria-label={`${label} −`} icon={<MinusOutlined />} onClick={() => change(i, -1)} />
      <Button aria-label={`${label} +`} icon={<PlusOutlined />} onClick={() => change(i, 1)} />
    </div>)}
  </div>;
}

export function Teaching({ urdfContent }: { urdfContent: string | null }) {
  const t = useT();
  const compact = useCompactScreen();
  const currentFrame = useControlStore((s) => s.currentFrame);
  const connected = useConnectionStore((s) => s.isConnected);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const token = useConnectionStore((s) => s.controlToken);
  const [details, setDetails] = useState(false);
  const [active, setActive] = useState('jog');
  const [previewJoints, setPreviewJoints] = useState(demoJoints);
  const [previewPose, setPreviewPose] = useState([...demoPosition, 179.98, -0.215, 89.672]);
  const changeCartesian = (index: number, delta: number) => setPreviewPose((values) => values.map((v, i) => i === index ? v + delta : v));
  const changeJoint = (index: number, delta: number) => setPreviewJoints((values) => values.map((v, i) => i === index ? v + delta : v));
  const stateReadout = <><h3 className="teach-state-heading">{t('teach.jointStatus')}</h3><JointReadout values={connected ? undefined : previewJoints} /><h3 className="teach-state-heading">{t('teach.cartesianState')}</h3><PoseReadout frame={currentFrame} values={connected ? undefined : previewPose} /></>;
  return <div className="teach-teaching">
    <div className="teach-teaching-grid">
      <Robot3DCard urdfContent={urdfContent} />
      <div className="teach-motion-column">
        <TeachCard title={t('teach.motionControl')} extra={<>{connected ? <span className="teach-muted">{t('teach.continuous')}</span> : <DemoBadge />}<Button className="teach-pad-details" onClick={() => setDetails(true)}>{t('teach.details')}</Button></>} className="teach-jog-card">
          <div className="teach-jog-hint">{t('teach.hold')}</div>
          {connected && (!enabled || !token) && <Alert type="warning" showIcon message={t('teach.jogReason')} />}
          <Tabs activeKey={active} onChange={setActive} items={[
            { key: 'jog', label: t('teach.jog') },
            { key: 'precise', label: t('teach.precise') },
          ]} />
          {active === 'precise' ? <fieldset className="teach-control-fieldset" disabled={compact || !connected || !token || !enabled}><MotionCommandPanel /></fieldset>
            : <>
              {!connected && <p className="teach-muted">{t('teach.demoJog')}</p>}
              <div className="teach-jog-groups">
                {connected ? <><JointJogPanel /><CartesianJogPanel compact /><NullSpacePanel /></>
                  : ['joint', 'cartesian', 'null'].map((kind) => <PreviewJog key={kind} kind={kind} joints={previewJoints} onJointChange={changeJoint} onCartesianChange={changeCartesian} />)}
              </div>
            </>}
          <div className="teach-jog-options"><WorkModeSelector /><UnitToggle /><FrameSelector /></div>
        </TeachCard>
      </div>
      <aside className="teach-state-column">
        <TeachCard title={t('teach.realtime')} extra={!connected && <DemoBadge />}>{stateReadout}</TeachCard>
      </aside>
    </div>
    <ContextPanel />
    <Drawer title={t('teach.details')} open={details} onClose={() => setDetails(false)} width={360}>
      {stateReadout}
    </Drawer>
  </div>;
}
