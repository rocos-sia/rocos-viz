import { Alert, Switch, Tabs } from 'antd';
import { useSearchParams } from 'react-router';
import { CameraOutlined, ToolOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import { useTeachStore } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { ToolManager } from './ToolManager';

export function Devices() {
  const t = useT();
  const outputs = useTeachStore((s) => s.outputs);
  const toggle = useTeachStore((s) => s.toggleOutput);
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') || 'digital';
  return <div className="teach-page teach-devices" data-motion>
    {active !== 'tool' && <Alert className="teach-feature-notice" type="info" showIcon message={t('teach.pendingNotice')} />}
    <Tabs className="teach-fill-tabs" activeKey={active} onChange={(tab) => setParams({ tab })} items={[
      { key: 'digital', label: t('teach.digitalIO'), children: <div className="teach-two-col">
        {['inputs', 'outputs'].map((kind) => <TeachCard key={kind} title={t(kind === 'inputs' ? 'teach.inputs' : 'teach.outputs')} extra={<DemoBadge />}>
          <div className="teach-signal-grid">{Array.from({ length: 8 }, (_, index) => {
            const on = kind === 'inputs' ? index % 3 === 0 : outputs[index];
            return <div className={`teach-signal ${on ? 'on' : ''}`} key={index}><strong>{kind === 'inputs' ? 'DI' : 'DO'} {String(index).padStart(2, '0')}</strong>
              <span>{on ? 'ON' : 'OFF'}</span><Switch aria-label={`${kind} ${index}`} checked={on} disabled={kind === 'inputs'} onChange={() => toggle(index)} /></div>;
          })}</div>
        </TeachCard>)}
      </div> },
      { key: 'analog', label: t('teach.analogIO'), children: <TeachCard title={t('teach.analogIO')} extra={<DemoBadge />}>
        <div className="teach-signal-grid">{[2.48, 4.91, 0.12, 3.36].map((v, i) => <div className="teach-signal" key={i}><strong>AI {i}</strong><b>{v.toFixed(2)} V</b><span>0–10 V</span></div>)}</div>
      </TeachCard> },
      { key: 'tool', label: t('teach.endTool'), children: <ToolManager /> },
      { key: 'external', label: t('teach.external'), children: <div className="teach-three-col">{[
        { name: t('teach.gripper'), icon: <ToolOutlined /> }, { name: t('teach.camera'), icon: <CameraOutlined /> }, { name: t('teach.conveyor'), icon: <DeploymentUnitOutlined /> },
      ].map((device) => <TeachCard key={device.name} title={device.name} extra={<DemoBadge />}><div className="teach-device-icon">{device.icon}</div><span className="teach-status">{t('teach.ready')}</span></TeachCard>)}</div> },
    ]} />
  </div>;
}
