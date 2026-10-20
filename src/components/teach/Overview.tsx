import { Progress } from 'antd';
import { ArrowRightOutlined, CheckCircleOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { demoJoints, demoPosition, demoPrograms, useTeachStore } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { Euler, Quaternion } from 'three';

export function useDisplayRobot() {
  const connected = useConnectionStore((s) => s.isConnected);
  const state = useRobotStateStore((s) => s.robotState);
  const joints = connected ? state?.joint_states.map((j) => j.position * 180 / Math.PI) ?? [] : demoJoints;
  const pose = state?.flange;
  const rpy = pose ? new Euler().setFromQuaternion(new Quaternion(pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w), 'ZYX') : null;
  return {
    connected, state, joints,
    position: connected ? pose ? [pose.position.x, pose.position.y, pose.position.z].map((v) => v * 1000) : [] : demoPosition,
    rotation: connected ? rpy ? [rpy.x, rpy.y, rpy.z].map((v) => v * 180 / Math.PI) : [] : [179.98, -0.215, 89.672],
  };
}

export function JointReadout({ values }: { values?: number[] } = {}) {
  const robot = useDisplayRobot();
  const joints = values ?? robot.joints;
  const t = useT();
  return <div className="teach-joint-readout">
    <div className="teach-table-heading"><span>{t('teach.joint')}</span><span>{t('teach.position')}</span></div>
    {joints.map((value, index) => <div className="teach-joint-row" key={index}>
      <span>J{index + 1}</span><div className="teach-joint-track"><i style={{ width: `${Math.min(100, Math.abs(value) / 180 * 100 + 4)}%` }} /></div>
      <strong>{value.toFixed(2)}<small> °</small></strong>
    </div>)}
    {!joints.length && <div className="teach-empty">{t('teach.noData')}</div>}
  </div>;
}

export function PoseReadout() {
  const { position, rotation } = useDisplayRobot();
  const t = useT();
  return <>
    <div className="teach-pose-grid">{['X', 'Y', 'Z', 'RX', 'RY', 'RZ'].map((axis, i) => {
      const value = i < 3 ? position[i] : rotation[i - 3];
      return <div key={axis}><span>{axis}</span><strong>{value?.toFixed(3) ?? '—'}</strong><small>{i < 3 ? 'mm' : '°'}</small></div>;
    })}</div>
    <div className="teach-card-footnote">{t('teach.flangeBase')}</div>
  </>;
}

export function RobotGlyph() {
  return <svg className="teach-robot-glyph" viewBox="0 0 280 240" aria-hidden="true">
    <defs><linearGradient id="robotSteel" x2="1" y2="1"><stop stopColor="#f8fafc" /><stop offset="1" stopColor="#a8b9ce" /></linearGradient></defs>
    <ellipse cx="138" cy="219" rx="87" ry="12" fill="#e2e8f0" />
    <path d="M94 210 L110 192 H158 L176 210 L163 220 H109Z" fill="#192b45" />
    <path d="M132 196 L132 146 L80 105 L115 53 L191 73 L199 110" fill="none" stroke="#bcc9d8" strokeWidth="31" strokeLinejoin="round" />
    <path d="M132 195 L132 145 L80 104 L115 52 L190 72 L199 107" fill="none" stroke="url(#robotSteel)" strokeWidth="24" strokeLinejoin="round" />
    {[[132, 145], [80, 104], [115, 52], [191, 73]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="17" fill="#2563eb" /><circle cx={x} cy={y} r="11" fill="#dbeafe" /><circle cx={x} cy={y} r="6" fill="#192b45" /></g>)}
    <path d="M190 109h19v14h-19z M190 123v12m19-12v12" fill="#192b45" stroke="#192b45" strokeWidth="5" />
    <text x="122" y="185" fill="#2563eb" fontSize="9" transform="rotate(-90 122 185)">ROCOS</text>
  </svg>;
}

export function ProgramList({ onSelect }: { onSelect?: (name: string) => void }) {
  const t = useT();
  return <div className="teach-program-list">{demoPrograms.map((p) => <button key={p.name} onClick={() => onSelect?.(p.name)} disabled={!onSelect}>
    <FileTextOutlined /><span><strong>{p.name}</strong><small>{p.updated} · {p.steps} {t('teach.steps')}</small></span><ArrowRightOutlined />
  </button>)}</div>;
}

export function IOSummary() {
  const outputs = useTeachStore((s) => s.outputs);
  return <div className="teach-io-summary">{['DI', 'DO'].map((type) => <div key={type}><strong>{type}</strong><div>{Array.from({ length: 8 }, (_, i) => <span className={(type === 'DI' ? i % 3 === 0 : outputs[i]) ? 'on' : ''} key={i}>{i}<i /></span>)}</div></div>)}</div>;
}

export function Overview() {
  const t = useT();
  const { connected, state, joints } = useDisplayRobot();
  const step = useTeachStore((s) => s.demoStep);
  return <div className="teach-dashboard" data-motion>
    <TeachCard title={t('teach.robotStatus')} extra={!connected && <DemoBadge />} className="dashboard-primary">
      <div className="teach-robot-overview"><RobotGlyph /><div>
        <span className="teach-eyebrow">{connected ? t('teach.controller') : t('teach.demoRobot')}</span>
        <h3>{connected ? 'ROCOS' : 'ROCOS-07'}</h3>
        <p><span className="teach-status neutral">{connected ? state?.robot_state ?? t('teach.unknown') : t('teach.offline')}</span></p>
        <dl><dt>{t('teach.dof')}</dt><dd>{joints.length || '—'}</dd><dt>{t('teach.source')}</dt><dd>{connected ? t('teach.live') : t('teach.demo')}</dd></dl>
      </div></div>
      <Link className="teach-card-link" to="/teaching">{t('teach.openTeaching')} <ArrowRightOutlined /></Link>
    </TeachCard>
    <TeachCard title={t('teach.jointStatus')} extra={!connected && <DemoBadge />} className="dashboard-primary"><JointReadout /></TeachCard>
    <TeachCard title={t('teach.pose')} extra={!connected && <DemoBadge />} className="dashboard-primary"><PoseReadout /></TeachCard>
    <TeachCard title={t('teach.recentPrograms')} extra={<DemoBadge />}><ProgramList /><Link className="teach-card-link" to="/programming">{t('teach.allPrograms')} <ArrowRightOutlined /></Link></TeachCard>
    <TeachCard title={t('teach.execution')} extra={<DemoBadge />}>
      <div className="teach-run-summary"><RobotOutlined /><h3>pick_place.lua</h3><p>{t('teach.previewOnly')}</p><Progress percent={Math.round(step / 12 * 100)} strokeColor="#2563eb" /></div>
      <Link className="teach-card-link" to="/execution">{t('teach.openExecution')} <ArrowRightOutlined /></Link>
    </TeachCard>
    <TeachCard title={t('teach.io')} extra={<DemoBadge />}><IOSummary /><Link className="teach-card-link" to="/devices">{t('teach.openDevices')} <ArrowRightOutlined /></Link></TeachCard>
    <TeachCard title={t('teach.events')} extra={<DemoBadge />}>
      <div className="teach-event-clear"><CheckCircleOutlined />{t('teach.demoNoAlarms')}</div>
      <div className="teach-event"><time>09:42:18</time><span>{t('teach.event.saved')}</span></div>
      <div className="teach-event"><time>09:40:05</time><span>{t('teach.event.loaded')}</span></div>
      <div className="teach-event"><time>09:38:22</time><span>{t('teach.event.ready')}</span></div>
      <Link className="teach-card-link" to="/diagnostics">{t('teach.openDiagnostics')} <ArrowRightOutlined /></Link>
    </TeachCard>
  </div>;
}
