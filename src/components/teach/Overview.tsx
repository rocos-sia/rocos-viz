import { useUnits } from '@/stores/unitStore';
import { Progress } from 'antd';
import { ArrowRightOutlined, CheckCircleOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { demoJoints, demoPosition, demoPrograms, useTeachStore } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { Euler, Quaternion } from 'three';
import { RobotOverview } from './RobotOverview';
import { FRAME } from '@/core/constants';
import { useJointRanges } from '@/hooks/useJointRanges';
import { jointBarRange } from '@/core/JointRange';

export function useDisplayRobot(frame: number = FRAME.BASE) {
  const connected = useConnectionStore((s) => s.isConnected);
  const state = useRobotStateStore((s) => s.robotState);
  const joints = connected ? state?.joint_states.map((j) => j.position * 180 / Math.PI) ?? [] : demoJoints;
  const pose = frame === FRAME.TOOL ? state?.active_tool_frame ?? state?.flange
    : frame === FRAME.OBJECT ? state?.active_object_frame ?? state?.flange : state?.flange;
  const rpy = pose ? new Euler().setFromQuaternion(new Quaternion(pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w), 'ZYX') : null;
  return {
    connected, state, joints,
    position: connected ? pose ? [pose.position.x, pose.position.y, pose.position.z].map((v) => v * 1000) : [] : demoPosition,
    rotation: connected ? rpy ? [rpy.x, rpy.y, rpy.z].map((v) => v * 180 / Math.PI) : [] : [179.98, -0.215, 89.672],
  };
}

export function JointReadout({ values, urdfContent }: { values?: number[]; urdfContent?: string | null } = {}) {
  const units = useUnits();
  const robot = useDisplayRobot();
  const ranges = useJointRanges(urdfContent, robot.connected);
  const joints = values ?? robot.joints;
  const t = useT();
  return <div className="teach-joint-readout">
    <div className="teach-table-heading"><span>{t('teach.joint')}</span><span>{t('teach.position')}</span></div>
    {joints.map((angle, index) => {
      const name = robot.connected ? robot.state?.joint_states[index]?.name : `joint_${index + 1}`;
      const range = name ? ranges[name] : undefined;
      const isLinear = range?.unit === 'mm';
      const display = isLinear ? units.length : units.angle;
      const conversion = isLinear ? display.factor / 1000 : display.factor * Math.PI / 180;
      const unit = display.label;
      const value = values === undefined && robot.connected && isLinear
        ? (robot.state?.joint_states[index]?.position ?? 0) * 1000 : angle;
      const bar = jointBarRange(value, range);
      const description = t(bar.limited ? 'teach.jointLimit' : 'teach.jointReference', {
        min: (bar.lower * conversion).toFixed(2), max: (bar.upper * conversion).toFixed(2), unit,
      });
      return <div className="teach-joint-row" key={index}>
        <span>J{index + 1}</span><div className="teach-joint-track" role="img" aria-label={description} title={description}>
          <i className={value < 0 ? 'negative' : 'positive'} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
          <b className="teach-joint-zero" style={{ left: `${bar.zero}%` }} aria-hidden="true" />
        </div>
        <strong>{(value * conversion).toFixed(unit === 'rad' || unit === 'm' ? 4 : 2)}<small> {unit}</small></strong>
      </div>;
    })}
    {!joints.length && <div className="teach-empty">{t('teach.noData')}</div>}
  </div>;
}

export function PoseReadout({ frame, values }: { frame?: number; values?: number[] } = {}) {
  const units = useUnits();
  const { position, rotation } = useDisplayRobot(frame);
  const t = useT();
  return <>
    <div className="teach-pose-grid">{['X', 'Y', 'Z', 'RX', 'RY', 'RZ'].map((axis, i) => {
      const value = values ? values[i] : i < 3 ? position[i] : rotation[i - 3];
      const display = i < 3 ? units.length : units.angle;
      const conversion = i < 3 ? display.factor / 1000 : display.factor * Math.PI / 180;
      return <div key={axis}><span>{axis}</span><strong>{value !== undefined ? (value * conversion).toFixed(3) : '—'}</strong><small>{display.label}</small></div>;
    })}</div>
    <div className="teach-card-footnote">{frame === undefined ? t('teach.flangeBase') : t('teach.frameReadout', { frame: t(frame === FRAME.TOOL ? 'frame.TOOL' : frame === FRAME.OBJECT ? 'frame.OBJECT' : frame === FRAME.FLANGE ? 'frame.FLANGE' : 'frame.BASE') })}</div>
  </>;
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

export function Overview({ urdfContent }: { urdfContent: string | null }) {
  const t = useT();
  const { connected } = useDisplayRobot();
  const step = useTeachStore((s) => s.demoStep);
  return <div className="teach-dashboard" data-motion>
    <TeachCard title={t('teach.robotStatus')} extra={!connected && <DemoBadge />} className="dashboard-primary">
      <RobotOverview urdfContent={urdfContent} />
      <Link className="teach-card-link" to="/teaching">{t('teach.openTeaching')} <ArrowRightOutlined /></Link>
    </TeachCard>
    <TeachCard title={t('teach.jointStatus')} extra={!connected && <DemoBadge />} className="dashboard-primary"><JointReadout urdfContent={urdfContent} /></TeachCard>
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
