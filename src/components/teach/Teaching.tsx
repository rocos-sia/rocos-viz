import { useState } from 'react';
import { Button, Drawer, Tabs, Alert, Segmented, Tooltip } from 'antd';
import { MinusOutlined, PlusOutlined, UndoOutlined, RedoOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { JointJogPanel } from '@/components/control/JointJogPanel';
import { CartesianJogPanel } from '@/components/control/CartesianJogPanel';
import { NullSpacePanel } from '@/components/control/NullSpacePanel';
import { MotionCommandPanel } from '@/components/control/MotionCommandPanel';
import { WorkModeSelector } from '@/components/control/WorkModeSelector';
import { FrameSelector } from '@/components/control/FrameSelector';
import { useConnectionStore } from '@/stores/connectionStore';
import { useControlStore } from '@/stores/controlStore';
import { demoJoints, demoPosition } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { Robot3DCard } from './Robot3DCard';
import { TeachCard, DemoBadge } from './TeachCard';
import { JointReadout, PoseReadout } from './Overview';
import { CartesianJogLayout } from '@/components/control/CartesianJogLayout';
import { ContextPanel } from './ContextPanel';

function PreviewJog({ kind, joints, onJointChange, onCartesianChange }: { kind: string; joints: number[]; onJointChange: (index: number, delta: number) => void; onCartesianChange: (index: number, delta: number) => void }) {
  const labels = kind === 'joint' ? joints.map((_, i) => `J${i + 1}`) : kind === 'cartesian' ? ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] : ['N1'];
  const change = (index: number, delta: number) => kind === 'joint' ? onJointChange(index, delta) : kind === 'cartesian' ? onCartesianChange(index, delta) : undefined;
  const row = (i: number) => <div className="teach-preview-jog" key={labels[i]}>
    <strong className="jog-label" data-axis={kind === 'cartesian' ? ['X', 'Y', 'Z'][i % 3] : undefined}>{labels[i]}</strong>
    <Button className="jog-btn jog-negative" aria-label={`${labels[i]} −`}
      icon={kind === 'cartesian' && i > 2 ? <RedoOutlined /> : <MinusOutlined />} onClick={() => change(i, -1)}>
      {kind === 'cartesian' && i > 2 ? '−' : null}
    </Button>
    <Button className="jog-btn jog-positive" aria-label={`${labels[i]} +`}
      icon={kind === 'cartesian' && i > 2 ? <UndoOutlined /> : <PlusOutlined />} onClick={() => change(i, 1)}>
      {kind === 'cartesian' && i > 2 ? '+' : null}
    </Button>
  </div>;
  return <div className={`panel-section teach-preview-${kind}`}>
    {kind === 'cartesian' ? <CartesianJogLayout renderAxis={row} /> : labels.map((_, i) => row(i))}
  </div>;
}

export function Teaching({ urdfContent }: { urdfContent: string | null }) {
  const t = useT();
  const currentFrame = useControlStore((s) => s.currentFrame);
  const connected = useConnectionStore((s) => s.isConnected);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const token = useConnectionStore((s) => s.controlToken);
  const [details, setDetails] = useState(false);
  const [active, setActive] = useState('jog');
  const [jogSpace, setJogSpace] = useState('joint');
  const [previewJoints, setPreviewJoints] = useState(demoJoints);
  const [previewPose, setPreviewPose] = useState([...demoPosition, 179.98, -0.215, 89.672]);
  const changeCartesian = (index: number, delta: number) => setPreviewPose((values) => values.map((v, i) => i === index ? v + delta : v));
  const changeJoint = (index: number, delta: number) => setPreviewJoints((values) => values.map((v, i) => i === index ? v + delta : v));
  const stateReadout = <div className="teach-realtime-readout">
    <section className="teach-state-section"><h3 className="teach-state-heading">{t('teach.jointStatus')}</h3><JointReadout urdfContent={urdfContent} values={connected ? undefined : previewJoints} /></section>
    <section className="teach-state-section"><h3 className="teach-state-heading">{t('teach.cartesianState')}</h3><PoseReadout frame={currentFrame} values={connected ? undefined : previewPose} /></section>
  </div>;
  return <div className="teach-teaching">
    <div className="teach-scene-column">
      <div className="teach-teaching-grid"><Robot3DCard urdfContent={urdfContent} /></div>
      <ContextPanel />
    </div>
    <aside className="teach-state-column">
      <TeachCard title={t('teach.realtime')} extra={!connected && <DemoBadge />}>{stateReadout}</TeachCard>
    </aside>
    <div className="teach-motion-column">
      <TeachCard title={t('teach.motionControl')} extra={<>{connected ? <span className="teach-muted">{t('teach.continuous')}</span> : <DemoBadge />}<Button className="teach-pad-details" onClick={() => setDetails(true)}>{t('teach.details')}</Button></>} className="teach-jog-card">
        {connected && (!enabled || !token) && <Alert type="warning" showIcon message={t('teach.jogReason')} />}
        <div className="teach-control-mode"><WorkModeSelector /><div className="teach-jog-reference"><FrameSelector /></div></div>
        <Tabs activeKey={active} onChange={setActive} tabBarExtraContent={active === 'jog' ? <Tooltip title={t('teach.hold')}><span className="teach-jog-hint" tabIndex={0} aria-label={t('teach.hold')}><span className="teach-jog-hint-text">{t('teach.hold')}</span><InfoCircleOutlined className="teach-jog-hint-icon" /></span></Tooltip> : undefined} items={[
          { key: 'jog', label: t('teach.jog') },
          { key: 'precise', label: t('teach.precise') },
        ]} />
        {active === 'precise' ? <MotionCommandPanel />
          : <>
            <Segmented className="teach-jog-space" aria-label={t('teach.jogSpace')} block value={jogSpace}
              onChange={(value) => setJogSpace(String(value))} options={[
                { label: t('teach.jointJog'), value: 'joint' },
                { label: t('teach.cartesianJog'), value: 'cartesian' },
              ]} />
            <div className={`teach-jog-groups space-${jogSpace}`}>
              {connected ? jogSpace === 'joint' ? <JointJogPanel /> : <CartesianJogPanel compact />
                : <PreviewJog kind={jogSpace} joints={previewJoints} onJointChange={changeJoint} onCartesianChange={changeCartesian} />}
              {jogSpace === 'cartesian' && <section className="teach-null-jog">
                <h3>{t('teach.nullJog')}</h3>
                {connected ? <NullSpacePanel /> : <PreviewJog kind="null" joints={previewJoints} onJointChange={changeJoint} onCartesianChange={changeCartesian} />}
              </section>}
            </div>
          </>}
      </TeachCard>
    </div>
    <Drawer title={t('teach.details')} rootClassName="teach-state-drawer" open={details} onClose={() => setDetails(false)} width={480}>
      {stateReadout}
    </Drawer>
  </div>;
}
