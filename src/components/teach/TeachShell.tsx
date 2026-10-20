import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, Popconfirm, Slider, Spin, Tooltip, message } from 'antd';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppstoreOutlined, AimOutlined, CodeOutlined, PlayCircleOutlined, ApiOutlined, LineChartOutlined, SettingOutlined, TranslationOutlined, DisconnectOutlined, PauseOutlined, CaretRightOutlined, SafetyCertificateOutlined, RobotOutlined } from '@ant-design/icons';
import { useControllerSession } from '@/hooks/useControllerSession';
import { useTelemetryCollector } from '@/hooks/useTelemetryCollector';
import { useMotionScope } from '@/hooks/useMotionScope';
import { useTeachStore } from '@/stores/teachStore';
import { useUIStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useControlStore } from '@/stores/controlStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useT } from '@/i18n/useT';
import { ConnectDialog } from '@/components/connection/ConnectDialog';
import { EnableButton } from '@/components/control/EnableButton';
import { Overview } from './Overview';
import { Teaching } from './Teaching';
import { Devices } from './Devices';
import { Execution } from './Execution';
import { Settings } from './Settings';

const Programming = lazy(() => import('./Programming').then((m) => ({ default: m.Programming })));
const Diagnostics = lazy(() => import('./Diagnostics').then((m) => ({ default: m.Diagnostics })));
const pages = [
  { id: 'dashboard', icon: <AppstoreOutlined /> },
  { id: 'teaching', icon: <AimOutlined /> },
  { id: 'programming', icon: <CodeOutlined /> },
  { id: 'execution', icon: <PlayCircleOutlined /> },
  { id: 'devices', icon: <ApiOutlined /> },
  { id: 'diagnostics', icon: <LineChartOutlined /> },
  { id: 'settings', icon: <SettingOutlined /> },
] as const;

function StatusStrip() {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const token = useConnectionStore((s) => s.controlToken);
  const owner = useConnectionStore((s) => s.controlOwnerName);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const host = useConnectionStore((s) => s.host);
  const toolFrame = useRobotStateStore((s) => s.robotState?.active_tool_frame_name);
  const objectFrame = useRobotStateStore((s) => s.robotState?.active_object_frame_name);
  const mode = useRobotStateStore((s) => s.robotState?.work_mode);
  const speed = useControlStore((s) => s.speedFactor);
  return <div className="teach-status-strip">
    <div className="teach-status-cell"><small>{t('teach.device')}</small><strong className="teach-device-name"><RobotOutlined /> {connected ? host : 'ROCOS'}</strong></div>
    <div className="teach-status-cell"><small>{t('teach.connectionState')}</small><strong className={connected ? 'connected' : ''}><i />{t(connected ? 'conn.connected' : 'conn.disconnected')}</strong></div>
    <div className="teach-status-cell"><small>{t('teach.enableState')}</small><strong className={enabled && connected ? 'connected' : ''}><i />{t(enabled && connected ? 'status.enabled' : 'status.disabled')}</strong></div>
    <div className="teach-status-cell"><small>{t('teach.ownership')}</small><strong>{token ? t('teach.local') : owner ?? t('teach.none')}</strong></div>
    <div className="teach-status-cell"><small>{t('teach.mode')}</small><strong>{connected ? mode ?? t('teach.unknown') : '—'}</strong></div>
    <div className="teach-status-cell"><small>{t('teach.safety')}</small><strong>{t('teach.unknown')}</strong></div>
    <div className="teach-status-cell"><small>{t('teach.speed')}</small><strong>{(speed * 100).toFixed(0)}%</strong></div>
    <div className="teach-status-cell"><small>{t('teach.alarms')}</small><strong>{t('teach.unknown')}</strong></div>
    <div className="teach-frame-status">
      <div className="teach-status-cell teach-frame-cell"><small>{t('frame.TOOL')}{!connected && <span className="teach-frame-demo">{t('teach.demo')}</span>}</small><strong title={connected ? toolFrame || '—' : 'TCP_01'}>{connected ? toolFrame || '—' : 'TCP_01'}</strong></div>
      <div className="teach-status-cell teach-frame-cell"><small>{t('frame.OBJECT')}{!connected && <span className="teach-frame-demo">{t('teach.demo')}</span>}</small><strong title={connected ? objectFrame || '—' : 'Workpiece_01'}>{connected ? objectFrame || '—' : 'Workpiece_01'}</strong></div>
    </div>
  </div>;
}

function ControlBar() {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const token = useConnectionStore((s) => s.controlToken);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const status = useRobotStateStore((s) => s.robotState?.robot_state);
  const speed = useControlStore((s) => s.speedFactor);
  const [busy, setBusy] = useState(false);
  const [small, setSmall] = useState(() => matchMedia('(max-width: 599px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width: 599px)');
    const change = () => setSmall(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const command = async (kind: 'resume' | 'pause' | 'stop') => {
    if (!connected || !token) return;
    const { host, port } = useConnectionStore.getState();
    const client = new RobotApiClient(host, port);
    if (kind !== 'stop') setBusy(true);
    try {
      if (kind === 'stop') await client.stopMove();
      else if (kind === 'pause') await client.pauseMotion();
      else await client.resumeMotion();
      message.success(t('common.sent', { cmd: t(`teach.${kind === 'stop' ? 'softwareStop' : kind}`) }));
    } catch (e) { message.error(String(e)); }
    finally { setBusy(false); }
  };
  const allowed = connected && !!token && enabled && !small;
  return <footer className="teach-controlbar">
    <div className="teach-controlbar-state"><i className={connected ? 'connected' : ''} /><span>{connected ? status ?? t('teach.unknown') : t('teach.offline')}</span><small>{t(small ? 'teach.smallReadOnly' : 'teach.jogReason')}</small></div>
    <div className="teach-speed"><label>{t('teach.speed')}</label><Slider aria-label={t('teach.speed')} min={1} max={99} value={Math.round(speed * 100)} onChange={(v) => useControlStore.getState().setSpeedFactor(v / 100)} /><strong>{Math.round(speed * 100)}%</strong></div>
    <div className="teach-run-buttons">
      <Button icon={<CaretRightOutlined aria-hidden="true" />} disabled={!allowed || busy || status !== 'PAUSED'} onClick={() => void command('resume')}>{t('teach.run')}</Button>
      <Button icon={<PauseOutlined aria-hidden="true" />} disabled={!allowed || busy || status !== 'RUNNING'} onClick={() => void command('pause')}>{t('teach.pause')}</Button>
      <Button danger icon={<span className="teach-stop-icon" aria-hidden="true" />} disabled={!connected || !token} onClick={() => void command('stop')}>{t('teach.stop')}</Button>
    </div>
  </footer>;
}

export function TeachShell() {
  const t = useT();
  const language = useUIStore((s) => s.language);
  const connected = useConnectionStore((s) => s.isConnected);
  const token = useConnectionStore((s) => s.controlToken);
  const session = useControllerSession();
  useTelemetryCollector();
  const location = useLocation();
  const reducedMotion = useTeachStore((s) => s.reducedMotion);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const page = pages.find((p) => location.pathname === `/${p.id}`) ?? pages[0];
  const [connectOpen, setConnectOpen] = useState(false);
  const root = useMotionScope(location.pathname);
  return <div className={`teach-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} data-reduced-motion={reducedMotion}>
    <header className="teach-topbar">
      <StatusStrip />
      <div className="teach-header-actions">
        {connected ? <Popconfirm title={t('conn.disconnectTitle')} onConfirm={session.handleDisconnect}><Button aria-label={t('conn.disconnect')} icon={<DisconnectOutlined />} /></Popconfirm>
          : <Button icon={<ApiOutlined />} onClick={() => setConnectOpen(true)}>{t('conn.connect')}</Button>}
        {connected && !token && <Popconfirm title={t('control.takeoverTitle')} description={t('control.takeoverConfirm', { owner: session.controlOwnerName ?? session.controlOwnerIp ?? t('teach.unknown') })} onConfirm={session.handleTakeover}><Button aria-label={t('control.takeover')} icon={<SafetyCertificateOutlined />} /></Popconfirm>}
        <EnableButton />
        <Button aria-label={t('teach.language')} icon={<TranslationOutlined />} onClick={() => useUIStore.getState().toggleLanguage()}>{language === 'zh' ? 'EN' : '中'}</Button>
      </div>
    </header>
    <aside className="teach-sidebar">
      <Tooltip title={t(sidebarCollapsed ? 'teach.expandSidebar' : 'teach.collapseSidebar')} placement="right">
        <button className="teach-brand" aria-label={t(sidebarCollapsed ? 'teach.expandSidebar' : 'teach.collapseSidebar')} aria-expanded={!sidebarCollapsed} aria-controls="teach-navigation" onClick={() => useUIStore.getState().toggleSidebar()}>
          <span className="teach-brand-mark" aria-hidden="true">R</span><strong>ROCOS <b>Teach</b></strong>
        </button>
      </Tooltip>
      <div className="teach-nav-caption">{t('teach.workspace')}</div>
      <nav id="teach-navigation" aria-label={t('teach.workspace')}>{pages.map((item) => <Tooltip key={item.id} title={sidebarCollapsed ? t(`teach.${item.id}`) : undefined} placement="right">
        <NavLink to={`/${item.id}`} aria-label={t(`teach.${item.id}`)}>{item.icon}<span>{t(`teach.${item.id}`)}</span></NavLink>
      </Tooltip>)}</nav>
      <div className="teach-sidebar-bottom"><span className="teach-sidebar-symbol"><RobotOutlined /></span><strong>ROCOS Teach</strong><small>{t('teach.station')}</small><span className="teach-sidebar-version">v3.0</span></div>
    </aside>
    <main className="teach-content" aria-label={t(`teach.${page.id}`)} ref={root}>
      <Suspense fallback={<div className="teach-loading"><Spin /></div>}>
        <Routes>
          <Route path="/dashboard" element={<Overview />} />
          <Route path="/teaching" element={<Teaching urdfContent={session.urdfContent} />} />
          <Route path="/programming" element={<Programming />} />
          <Route path="/execution" element={<Execution urdfContent={session.urdfContent} />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/settings" element={<Settings onConnect={() => setConnectOpen(true)} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </main>
    <ControlBar />
    <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
  </div>;
}
