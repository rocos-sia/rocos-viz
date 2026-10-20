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
import { useRobotStateStore } from '@/stores/robotStateStore';
import { demoJoints } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { Robot3DCard } from './Robot3DCard';
import { TeachCard, DemoBadge } from './TeachCard';
import { PoseReadout } from './Overview';
import { ContextPanel } from './ContextPanel';

function PreviewJog({ kind }: { kind: string }) {
  const t = useT();
  const [values, setValues] = useState(demoJoints);
  const labels = kind === 'joint' ? values.map((_, i) => `J${i + 1}`) : kind === 'cartesian' ? ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] : ['N1'];
  return <><p className="teach-muted">{t('teach.demoJog')}</p>{labels.map((label, i) => <div className="teach-preview-jog" key={label}>
    <strong>{label}</strong>
    <Button aria-label={`${label} −`} icon={<MinusOutlined />} onClick={() => setValues(values.map((v, j) => j === i ? v - 1 : v))} />
    <span>{values[i].toFixed(2)} <small>{kind === 'cartesian' && i < 3 ? 'mm' : '°'}</small></span>
    <Button aria-label={`${label} +`} icon={<PlusOutlined />} onClick={() => setValues(values.map((v, j) => j === i ? v + 1 : v))} />
  </div>)}</>;
}

function ToolCard() {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const tool = useRobotStateStore((s) => s.robotState?.active_tool_frame_name);
  const frame = useRobotStateStore((s) => s.robotState?.active_object_frame_name);
  return <TeachCard title={t('teach.tools')} extra={!connected && <DemoBadge />}>
    <dl className="teach-key-values"><dt>{t('teach.tool')}</dt><dd>{connected ? tool ?? '—' : 'TCP_01'}</dd>
      <dt>{t('teach.reference')}</dt><dd>{connected ? frame ?? '—' : 'Base'}</dd><dt>{t('teach.payload')}</dt><dd>{connected ? '—' : '2.0 kg'}</dd></dl>
    <FrameSelector />
  </TeachCard>;
}

export function Teaching({ urdfContent }: { urdfContent: string | null }) {
  const t = useT();
  const compact = useCompactScreen();
  const connected = useConnectionStore((s) => s.isConnected);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const token = useConnectionStore((s) => s.controlToken);
  const [details, setDetails] = useState(false);
  const [active, setActive] = useState('joint');
  return <>
    <div className="teach-pad-details"><Button onClick={() => setDetails(true)}>{t('teach.details')}</Button></div>
    <div className="teach-teaching-grid">
      <Robot3DCard urdfContent={urdfContent} />
      <TeachCard title={t('teach.jog')} extra={connected ? <span className="teach-muted">{t('teach.continuous')}</span> : <DemoBadge />} className="teach-jog-card">
        <div className="teach-jog-hint">{t('teach.hold')}</div>
        {connected && (!enabled || !token) && <Alert type="warning" showIcon message={t('teach.jogReason')} />}
        <Tabs activeKey={active} onChange={setActive} items={[
          { key: 'joint', label: t('teach.jointJog') },
          { key: 'cartesian', label: t('teach.cartesianJog') },
          { key: 'null', label: t('teach.nullJog') },
          { key: 'precise', label: t('teach.precise') },
        ]} />
        {active === 'precise' ? <fieldset className="teach-control-fieldset" disabled={compact || !connected || !token || !enabled}><MotionCommandPanel /></fieldset>
          : !connected ? <PreviewJog key={active} kind={active} />
            : active === 'joint' ? <JointJogPanel /> : active === 'cartesian' ? <CartesianJogPanel /> : <NullSpacePanel />}
        <div className="teach-jog-options"><WorkModeSelector /><UnitToggle /></div>
      </TeachCard>
      <aside className="teach-state-column">
        <TeachCard title={t('teach.realtime')} extra={!connected && <DemoBadge />}><PoseReadout /></TeachCard><ToolCard />
      </aside>
    </div>
    <ContextPanel />
    <Drawer title={t('teach.details')} open={details} onClose={() => setDetails(false)} width={360}>
      <PoseReadout /><ToolCard />
    </Drawer>
  </>;
}
