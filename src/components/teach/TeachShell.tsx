import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, Dropdown, Popconfirm, Slider, Spin, message } from 'antd';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AppstoreOutlined, AimOutlined, CodeOutlined, PlayCircleOutlined, ApiOutlined, LineChartOutlined, SettingOutlined, TranslationOutlined, DisconnectOutlined, MoreOutlined, StopFilled, PauseOutlined, CaretRightOutlined, SafetyCertificateOutlined, RobotOutlined } from '@ant-design/icons';
import { useControllerSession } from '@/hooks/useControllerSession';
import { useTelemetryCollector } from '@/hooks/useTelemetryCollector';
import { useMotionScope } from '@/hooks/useMotionScope';
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
  const mode = useRobotStateStore((s) => s.robotState?.work_mode);
  const speed = useControlStore((s) => s.speedFactor);
  return <div className="teach-status-strip">
    <span className="teach-device-name"><RobotOutlined /> {connected ? host : 'ROCOS'}</span>
    <span className={connected ? 'connected' : ''}><i />{t(connected ? 'conn.connected' : 'conn.disconnected')}</span>
    <span>{t('teach.ownership')}: {token ? t('teach.local') : owner ?? t('teach.none')}</span>
    <span>{t(enabled && connected ? 'status.enabled' : 'status.disabled')}</span>
    <span>{t('teach.mode')}: {connected ? mode ?? t('teach.unknown') : '—'}</span>
    <span>{t('teach.safetyUnknown')}</span>
    <span>{t('teach.speed')}: {(speed * 100).toFixed(0)}%</span>
    <span>{t('teach.alarmUnknown')}</span>
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
      <Button icon={<CaretRightOutlined />} disabled={!allowed || busy || status !== 'PAUSED'} onClick={() => void command('resume')}>{t('teach.resume')}</Button>
      <Button icon={<PauseOutlined />} disabled={!allowed || busy || status !== 'RUNNING'} onClick={() => void command('pause')}>{t('teach.pause')}</Button>
      <Button danger icon={<StopFilled />} disabled={!connected || !token} onClick={() => void command('stop')}>{t('teach.softwareStop')}</Button>
    </div><span className="teach-stop-note">{t('teach.notEstop')}</span>
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
  const navigate = useNavigate();
  const page = pages.find((p) => location.pathname === `/${p.id}`) ?? pages[0];
  const [connectOpen, setConnectOpen] = useState(false);
  const root = useMotionScope(location.pathname);
  return <div className="teach-shell">
    <header className="teach-topbar">
      <NavLink to="/dashboard" className="teach-brand"><span className="teach-brand-mark">R</span><strong>ROCOS <b>Teach</b></strong></NavLink>
      <StatusStrip />
      <div className="teach-header-actions">
        {connected ? <Popconfirm title={t('conn.disconnectTitle')} onConfirm={session.handleDisconnect}><Button aria-label={t('conn.disconnect')} icon={<DisconnectOutlined />} /></Popconfirm>
          : <Button icon={<ApiOutlined />} onClick={() => setConnectOpen(true)}>{t('conn.connect')}</Button>}
        {connected && !token && <Popconfirm title={t('control.takeoverTitle')} description={t('control.takeoverConfirm', { owner: session.controlOwnerName ?? session.controlOwnerIp ?? t('teach.unknown') })} onConfirm={session.handleTakeover}><Button aria-label={t('control.takeover')} icon={<SafetyCertificateOutlined />} /></Popconfirm>}
        <EnableButton />
        <Button aria-label={t('teach.language')} icon={<TranslationOutlined />} onClick={() => useUIStore.getState().toggleLanguage()}>{language === 'zh' ? 'EN' : '中'}</Button>
      </div>
    </header>
    <aside className="teach-sidebar"><div className="teach-nav-caption">{t('teach.workspace')}</div>
      <nav aria-label={t('teach.workspace')}>{pages.map((item) => <NavLink key={item.id} to={`/${item.id}`} title={t(`teach.${item.id}`)}>{item.icon}<span>{t(`teach.${item.id}`)}</span></NavLink>)}</nav>
      <div className="teach-sidebar-bottom"><span className="teach-sidebar-symbol"><RobotOutlined /></span><strong>ROCOS Teach</strong><small>{t('teach.station')}</small><span className="teach-sidebar-version">v3.0</span></div>
    </aside>
    <main className="teach-content" ref={root}>
      <div className="teach-page-heading"><div><span className="teach-eyebrow">ROCOS / {page.id.toUpperCase()}</span><h1>{t(`teach.${page.id}`)}</h1><p>{t(`teach.${page.id}.desc`)}</p></div>
        <div className={`teach-mode-badge ${connected ? 'live' : ''}`}><i />{t(connected ? 'teach.live' : 'teach.previewOnly')}</div>
      </div>
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
    <nav className="teach-mobile-nav" aria-label={t('teach.workspace')}>
      {pages.slice(0, 4).map((item) => <NavLink key={item.id} to={`/${item.id}`}>{item.icon}<span>{t(`teach.${item.id}`)}</span></NavLink>)}
      <Dropdown trigger={['click']} menu={{ items: pages.slice(4).map((p) => ({ key: p.id, icon: p.icon, label: t(`teach.${p.id}`) })), onClick: ({ key }) => navigate(`/${key}`) }}><Button icon={<MoreOutlined />}>{t('teach.more')}</Button></Dropdown>
    </nav>
    <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
  </div>;
}
