import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useUIStore, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH } from '@/stores/uiStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { RobotViewer } from '@/scene/RobotViewer';
import { SceneErrorBoundary } from '@/scene/SceneErrorBoundary';
import { AxesIndicator } from '@/scene/AxesIndicator';
import { RobotModel } from '@/scene/RobotModel';
import { TrajectoryLine } from '@/scene/TrajectoryLine';
import { setCameraPreset } from '@/scene/CameraPresets';
import { ConnectDialog } from '@/components/connection/ConnectDialog';
import { SystemSettingsModal } from '@/components/settings/SystemSettingsModal';
import { RightPanel } from '@/components/layout/RightPanel';
import { StatusBar } from '@/components/layout/StatusBar';
import { EnableButton } from '@/components/control/EnableButton';
import { useRobotConnection } from '@/hooks/useRobotConnection';
import { useT } from '@/i18n/useT';
import * as THREE from 'three';
import { MAX_TRAJECTORY_POINTS } from '@/core/constants';
import {
  Button,
  Tooltip,
  Modal,
  Popconfirm,
  message,
  Spin,
} from 'antd';

const PlotPanel = lazy(() => import('@/components/plot/PlotPanel').then((m) => ({ default: m.PlotPanel })));
import {
  LineChartOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  TranslationOutlined,
  LeftOutlined,
  RightOutlined,
  CodepenOutlined,
  BorderTopOutlined,
  BorderOutlined,
  BorderRightOutlined,
  BorderBottomOutlined,
  BlockOutlined,
  DeploymentUnitOutlined,
  NodeIndexOutlined,
  ApiOutlined,
  DisconnectOutlined,
  SafetyCertificateOutlined,
  SafetyCertificateFilled,
  SecurityScanOutlined,
  WarningOutlined,
} from '@ant-design/icons';

/** Reactive scene-toggle buttons – uses hooks so state changes are reflected immediately */
function SceneToggles({ style }: { style?: React.CSSProperties }) {
  const t = useT();
  const showJointFrames = useUIStore((s) => s.showJointFrames);
  const showWireframe = useUIStore((s) => s.showWireframe);
  const showGround = useUIStore((s) => s.showGround);
  const showTrajectory = useUIStore((s) => s.showTrajectory);
  const toggleJointFrames = useUIStore((s) => s.toggleJointFrames);
  const toggleWireframe = useUIStore((s) => s.toggleWireframe);
  const toggleGround = useUIStore((s) => s.toggleGround);
  const toggleTrajectory = useUIStore((s) => s.toggleTrajectory);

  const toggles = [
    { key: 'axes', label: t('scene.axes'), icon: <DeploymentUnitOutlined />, active: showJointFrames, onClick: toggleJointFrames },
    { key: 'mesh', label: t('scene.mesh'), icon: <BlockOutlined />, active: showWireframe, onClick: toggleWireframe },
    { key: 'ground', label: t('scene.ground'), icon: <BorderBottomOutlined />, active: showGround, onClick: toggleGround },
    { key: 'traj', label: t('scene.trajectory'), icon: <NodeIndexOutlined />, active: showTrajectory, onClick: toggleTrajectory },
  ];

  return (
    <div className="scene-toggles" style={style}>
      {toggles.map((t) => (
        <Tooltip key={t.key} title={t.label}>
          <button
            className={`scene-toggle-pill${t.active ? ' active' : ''}`}
            onClick={t.onClick}
          >
            <span className="pill-icon">{t.icon}</span>
            <span className="pill-label">{t.label}</span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/** Isolated component so that high-frequency WebSocket updates to robotStateStore
 *  never cause AppLayout (and the 3D canvas tree) to re-render. */
function ResetButton() {
  const t = useT();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const robotStateVal = useRobotStateStore((s) => s.robotState?.robot_state);
  const isErrorState = isConnected && robotStateVal === 'ERROR_STATE';
  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    setResetting(true);
    try {
      const client = new RobotApiClient(host, port);
      const resetResp = await client.resetRobot();
      console.log('[ResetButton] reset response:', resetResp);

      // Poll robot state until it leaves ERROR_STATE (max 10s, 500ms interval).
      // We always poll regardless of resetResp.success — the backend may return
      // success:false with code -2307 while still executing the reset (the state
      // transition is the ground truth, not the API success flag).
      const POLL_INTERVAL = 500;
      const POLL_TIMEOUT = 10_000;
      const deadline = Date.now() + POLL_TIMEOUT;
      let finalState = 'ERROR_STATE';
      while (finalState === 'ERROR_STATE' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const state = await client.getRobotState();
        finalState = state.robot_state ?? 'ERROR_STATE';
      }

      if (finalState !== 'ERROR_STATE') {
        message.success(t('control.resetSuccess'));
      } else {
        message.error(t('control.resetFailed', { msg: resetResp.message ?? 'timeout' }));
      }
    } catch (err) {
      message.error(t('control.resetFailed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setResetting(false);
    }
  }, [host, port, t]);

  return (
    <div className={`robot-reset-overlay${isErrorState ? ' visible' : ''}`}>
      <button
        className="robot-reset-btn"
        disabled={resetting || !isErrorState}
        onClick={handleReset}
        title={t('control.reset')}
      >
        {resetting ? <span className="robot-reset-spin">↻</span> : <WarningOutlined />}
        <span className="robot-reset-label">Reset</span>
      </button>
    </div>
  );
}

function TrajectoryLineWrapper() {
  const showTrajectory = useUIStore((s) => s.showTrajectory);
  const robotState = useRobotStateStore((s) => s.robotState);
  const pointsRef = useRef<THREE.Vector3[]>([]);

  useEffect(() => {
    if (!showTrajectory || !robotState) return;

    const pose = robotState.active_tool_frame ?? robotState.flange;
    if (!pose) return;
    const point = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
    pointsRef.current = [...pointsRef.current.slice(-(MAX_TRAJECTORY_POINTS - 1)), point];
  }, [robotState, showTrajectory]);

  if (!showTrajectory) return null;

  return <TrajectoryLine points={pointsRef.current} visible={showTrajectory} />;
}

export function AppLayout() {
  const t = useT();
  const [showConnectDialog, setShowConnectDialog] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urdfContent, setUrdfContent] = useState<string | null>(null);

  const isConnected = useConnectionStore((s) => s.isConnected);
  const currentView = useUIStore((s) => s.currentView);
  const language = useUIStore((s) => s.language);
  const rightPanelCollapsed = useUIStore((s) => s.rightPanelCollapsed);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const rightPanelWidth = useUIStore((s) => s.rightPanelWidth);
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth);
  const plotFloatPos = useUIStore((s) => s.plotFloatPos);
  const setPlotFloatPos = useUIStore((s) => s.setPlotFloatPos);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);

  // The right panel is an absolute overlay over the viewport. Shift the
  // top/bottom floating overlays left by half the panel's covered width so they
  // stay centered within the *visible* 3D area, not the full viewport.
  const COLLAPSED_PEEK = 32; // px the collapsed panel tab still covers
  const coveredWidth = rightPanelCollapsed ? COLLAPSED_PEEK : rightPanelWidth;
  const sceneOverlayStyle = {
    transform: `translateX(calc(-50% - ${coveredWidth / 2}px))`,
  } as const;

  // --- Right panel resize via left-edge drag handle (mouse + touch) ---
  // The panel width is driven directly via DOM during the drag — we do NOT write
  // to the (persisted) store on every mousemove. Writing per-frame serialized the
  // whole store to localStorage synchronously on each move, stalling the main
  // thread and starving the 3D render loop (canvas blanked until the drag ended).
  // We commit the final width to the store once, on drag-end.
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const beginResize = useCallback(
    (startX: number) => {
      const startWidth = useUIStore.getState().rightPanelWidth;
      let latestWidth = startWidth;

      const clamp = (w: number) =>
        Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, w));

      // Panel is anchored to the right edge, so dragging left widens it.
      const apply = (clientX: number) => {
        latestWidth = clamp(startWidth + (startX - clientX));
        if (rightPanelRef.current) rightPanelRef.current.style.width = `${latestWidth}px`;
      };

      const onMouseMove = (ev: MouseEvent) => apply(ev.clientX);
      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches[0]) { ev.preventDefault(); apply(ev.touches[0].clientX); }
      };
      const onEnd = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onEnd);
        document.body.style.userSelect = '';
        // Commit once — triggers the single re-render / persist write.
        setRightPanelWidth(latestWidth);
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    },
    [setRightPanelWidth],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => { e.preventDefault(); beginResize(e.clientX); },
    [beginResize],
  );
  const handleResizeTouchStart = useCallback(
    (e: React.TouchEvent) => { if (e.touches[0]) beginResize(e.touches[0].clientX); },
    [beginResize],
  );

  // --- Floating plot window drag via its header (mouse + touch) ---
  const beginPlotDrag = useCallback(
    (startX: number, startY: number) => {
      const start = useUIStore.getState().plotFloatPos ?? { x: 8, y: 8 };

      const apply = (clientX: number, clientY: number) =>
        setPlotFloatPos({
          x: Math.max(0, start.x + (clientX - startX)),
          y: Math.max(0, start.y + (clientY - startY)),
        });

      const onMouseMove = (ev: MouseEvent) => apply(ev.clientX, ev.clientY);
      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches[0]) { ev.preventDefault(); apply(ev.touches[0].clientX, ev.touches[0].clientY); }
      };
      const onEnd = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onEnd);
        document.body.style.userSelect = '';
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    },
    [setPlotFloatPos],
  );

  const handlePlotDragMouseDown = useCallback(
    (e: React.MouseEvent) => { e.preventDefault(); beginPlotDrag(e.clientX, e.clientY); },
    [beginPlotDrag],
  );
  const handlePlotDragTouchStart = useCallback(
    (e: React.TouchEvent) => { if (e.touches[0]) beginPlotDrag(e.touches[0].clientX, e.touches[0].clientY); },
    [beginPlotDrag],
  );

  // Mount the connection hook so polling / WebSocket starts when isConnected changes
  useRobotConnection();

  const controlToken = useConnectionStore((s) => s.controlToken);
  const controlOwnerName = useConnectionStore((s) => s.controlOwnerName);
  const controlOwnerIp = useConnectionStore((s) => s.controlOwnerIp);
  const setControlToken = useConnectionStore((s) => s.setControlToken);
  const setControlAcquiredAt = useConnectionStore((s) => s.setControlAcquiredAt);
  const setControlOwner = useConnectionStore((s) => s.setControlOwner);

  const handleTakeover = useCallback(async () => {
    try {
      const client = new RobotApiClient(host, port);
      const result = await client.takeoverControl(`web-${navigator.platform}`);
      if (result.success && result.data?.token) {
        setControlToken(result.data.token);
        setControlAcquiredAt(Date.now());
        setControlOwner(result.data.owner_name ?? null, result.data.owner_ip ?? null);
        if (result.data.client_id_auto && result.data.client_id) {
          sessionStorage.setItem('rocos_client_id', result.data.client_id);
        }
        message.success(t('control.takeoverSuccess'));
      } else {
        message.error(t('control.takeoverFailed', { msg: result.message }));
      }
    } catch (err) {
      message.error(t('control.takeoverFailed', { msg: err instanceof Error ? err.message : String(err) }));
    }
  }, [host, port, setControlToken, setControlOwner, t]);

  // Acquire control right after connecting
  useEffect(() => {
    if (!isConnected) {
      setControlToken(null);
      setControlOwner(null, null);
      return;
    }

    let cancelled = false;

    async function acquireControl() {
      try {
        const client = new RobotApiClient(host, port);
        const result = await client.acquireControl(`web-${navigator.platform}`);
        if (cancelled) return;
        if (result.success && result.data?.token) {
          setControlToken(result.data.token);
          setControlAcquiredAt(Date.now());
          setControlOwner(result.data.owner_name ?? null, result.data.owner_ip ?? null);
          if (result.data.client_id_auto && result.data.client_id) {
            sessionStorage.setItem('rocos_client_id', result.data.client_id);
          }
        } else {
          // code 3008: held by someone else
          setControlToken(null);
          setControlAcquiredAt(null);
          setControlOwner(result.data?.owner_name ?? null, result.data?.owner_ip ?? null);
        }
      } catch {
        // ignore — control right is a best-effort feature
      }
    }

    acquireControl();

    return () => { cancelled = true; };
  }, [isConnected, host, port, setControlToken, setControlOwner]);

  // Poll control status every 1s: detects expiry, server-side token rejection, and takeover
  useEffect(() => {
    if (!isConnected) return;

    const poll = async () => {
      try {
        const client = new RobotApiClient(host, port);
        const resp = await client.getControlStatus();
        const { controlToken: token, controlAcquiredAt } = useConnectionStore.getState();

        if (token) {
          // Server rejected the token even on the read endpoint (non-standard but handle it)
          if (!resp.success && (resp.code === 3007 || resp.code === 3006)) {
            setControlToken(null);
            setControlAcquiredAt(null);
            setControlOwner(null, null);
            return;
          }
          const status = resp.data;
          if (!status?.has_owner) {
            // token expired
            setControlToken(null);
            setControlAcquiredAt(null);
            setControlOwner(null, null);
          } else if (
            // held_for_seconds should track our elapsed time; if it's significantly less,
            // another client reset the counter via takeover (works even same-machine same-name)
            controlAcquiredAt !== null &&
            status.held_for_seconds !== undefined &&
            (Date.now() - controlAcquiredAt) / 1000 - status.held_for_seconds > 10
          ) {
            setControlToken(null);
            setControlAcquiredAt(null);
            setControlOwner(status.owner_name ?? null, status.owner_ip ?? null);
          }
        } else {
          // not holding — keep owner info fresh for the takeover dialog
          const status = resp.data;
          if (status) setControlOwner(status.owner_name ?? null, status.owner_ip ?? null);
        }
      } catch {
        // ignore poll failures
      }
    };

    const id = window.setInterval(poll, 1_000);
    return () => clearInterval(id);
  }, [isConnected, host, port, setControlToken, setControlAcquiredAt, setControlOwner]);

  // Fetch URDF model from controller on connect
  useEffect(() => {
    if (!isConnected) {
      setUrdfContent(null);
      return;
    }

    let cancelled = false;

    async function fetchModel() {
      try {
        const client = new RobotApiClient(host, port);
        const urdfXml = await client.getUrdf();

        if (cancelled) return;

        if (urdfXml && urdfXml.trim().startsWith('<')) {
          console.log('[AppLayout] Loaded URDF from controller, length:', urdfXml.length);
          setUrdfContent(urdfXml);
        }
      } catch (error) {
        console.error('Failed to fetch robot model:', error);
        if (!cancelled) {
          message.error(t('model.fetchFailed', { msg: error instanceof Error ? error.message : String(error) }));
        }
      }
    }

    fetchModel();

    return () => { cancelled = true; };
  }, [isConnected, host, port, t]);

  return (
    <div className="app-layout">
      {/* Toolbar */}
      <div className="app-toolbar">
        <img className="logo" src="/icons/rocos.png" alt="ROCOS-Viz" />

        <div className="toolbar-cameras">
          <Tooltip title={t('view.axonometric')}>
            <Button size="middle" icon={<CodepenOutlined />} onClick={() => setCameraPreset('axonometric')} />
          </Tooltip>
          <Tooltip title={t('view.top')}>
            <Button size="middle" icon={<BorderTopOutlined />} onClick={() => setCameraPreset('top')} />
          </Tooltip>
          <Tooltip title={t('view.front')}>
            <Button size="middle" icon={<BorderOutlined />} onClick={() => setCameraPreset('front')} />
          </Tooltip>
          <Tooltip title={t('view.right')}>
            <Button size="middle" icon={<BorderRightOutlined />} onClick={() => setCameraPreset('right')} />
          </Tooltip>
        </div>

        {/* Centered connection status pill */}
        <div className="toolbar-center">
          {/* Control right status — circle icon button, left of the conn-pill */}
          {isConnected && (
            controlToken ? (
              <Tooltip title={t('control.acquired')}>
                <button className="takeover-btn has-control">
                  <SafetyCertificateFilled />
                </button>
              </Tooltip>
            ) : (
              <Popconfirm
                title={t('control.takeoverTitle')}
                description={t('control.takeoverConfirm', {
                  owner: controlOwnerName ?? controlOwnerIp ?? 'unknown',
                })}
                okText={t('control.takeoverOk')}
                cancelText={t('control.takeoverCancel')}
                okButtonProps={{ danger: true }}
                onConfirm={handleTakeover}
              >
                <Tooltip title={t('control.takeover')}>
                  <button className="takeover-btn no-control">
                    <SecurityScanOutlined />
                  </button>
                </Tooltip>
              </Popconfirm>
            )
          )}
          {isConnected ? (
            <Popconfirm
              title={t('conn.disconnectTitle')}
              description={t('conn.disconnectConfirm', { target: `${host}:${port}` })}
              okText={t('conn.disconnect')}
              cancelText={t('conn.cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={() => useConnectionStore.getState().reset()}
            >
              <button className="conn-pill connected" title={t('conn.clickToDisconnect')}>
                <span className="conn-dot" />
                <ApiOutlined className="conn-icon" />
                <span className="conn-text">{host}:{port}</span>
                <DisconnectOutlined className="conn-action" />
              </button>
            </Popconfirm>
          ) : (
            <button
              className="conn-pill disconnected"
              title={t('conn.clickToOpen')}
              onClick={() => setShowConnectDialog(true)}
            >
              <span className="conn-dot" />
              <ApiOutlined className="conn-icon" />
              <span className="conn-text">{t('conn.clickToConnect')}</span>
            </button>
          )}

          {/* Enable toggle — sits right beside the connect pill */}
          <EnableButton />
        </div>

        <div className="toolbar-spacer" />

        <Tooltip title={t('app.chart')}>
          <Button
            size="middle"
            type={currentView === 'plot' ? 'primary' : 'default'}
            icon={<LineChartOutlined />}
            onClick={() => useUIStore.getState().setView(currentView === 'scene' ? 'plot' : 'scene')}
          />
        </Tooltip>
        <Tooltip title={language === 'en' ? t('app.lang.toZh') : t('app.lang.toEn')}>
          <Button
            size="middle"
            icon={<TranslationOutlined />}
            onClick={() => useUIStore.getState().toggleLanguage()}
          >
            {language === 'en' ? '中' : 'EN'}
          </Button>
        </Tooltip>
        <Tooltip title={t('app.settings')}>
          <Button size="middle" icon={<SettingOutlined />} onClick={() => setShowSettings(true)} />
        </Tooltip>
        <Tooltip title={useUIStore.getState().themeMode === 'dark' ? t('app.theme.toLight') : t('app.theme.toDark')}>
          <Button
            size="middle"
            icon={<BulbOutlined />}
            onClick={() => useUIStore.getState().toggleTheme()}
          />
        </Tooltip>
        <Tooltip title={t('app.about')}>
          <Button size="middle" icon={<QuestionCircleOutlined />} onClick={() => setShowAbout(true)} />
        </Tooltip>
      </div>

      {/* Main Content */}
      <div className="app-main">
        {/* Full-width 3D Viewport */}
        <div className="app-left-panel">
          <div className="scene-viewport">
            <SceneErrorBoundary>
              <RobotViewer>
                {isConnected && (
                  <>
                    <RobotModel
                      urdfContent={urdfContent}
                      meshBasePath={new RobotApiClient(host, port).getMeshBaseUrl()}
                    />
                    <AxesIndicator />
                    <TrajectoryLineWrapper />
                  </>
                )}
              </RobotViewer>
            </SceneErrorBoundary>

            {/* Floating Plot Panel */}
            {currentView === 'plot' && (
              <div
                className="plot-float"
                style={
                  plotFloatPos
                    ? { left: plotFloatPos.x, top: plotFloatPos.y, bottom: 'auto' }
                    : undefined
                }
              >
                <div
                  className="plot-float-header"
                  onMouseDown={handlePlotDragMouseDown}
                  onTouchStart={handlePlotDragTouchStart}
                >
                  <span className="plot-float-title">{t('plot.realtimeCurves')}</span>
                </div>
                <div className="plot-float-body">
                  <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300 }}><Spin /></div>}>
                    <PlotPanel />
                  </Suspense>
                </div>
              </div>
            )}

            {/* Error state reset button — isolated component so its store subscription
                doesn't trigger AppLayout re-renders on every WebSocket tick. */}
            <ResetButton />

            {/* Floating scene toggles (bottom-center of the visible 3D area) */}
            <SceneToggles style={sceneOverlayStyle} />
          </div>
        </div>

        {/* Right Panel - Overlay Controls */}
        <div
          ref={rightPanelRef}
          className={`app-right-panel${rightPanelCollapsed ? ' collapsed' : ''}`}
          style={{ width: rightPanelWidth }}
        >
          {/* Collapse toggle tab */}
          <button
            className="right-panel-toggle"
            onClick={toggleRightPanel}
            title={rightPanelCollapsed ? t('panel.expand') : t('panel.collapse')}
          >
            {rightPanelCollapsed ? <LeftOutlined /> : <RightOutlined />}
          </button>
          {/* Resize handle — drag to change panel width */}
          {!rightPanelCollapsed && (
            <div
              className="right-panel-resize"
              onMouseDown={handleResizeMouseDown}
              onTouchStart={handleResizeTouchStart}
              title={t('panel.resizeTip')}
            />
          )}
          <div className="right-panel-content">
            <RightPanel />
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Connect Dialog */}
      <ConnectDialog
        open={showConnectDialog}
        onClose={() => setShowConnectDialog(false)}
      />

      {/* System Settings Dialog */}
      <SystemSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* About Dialog */}
      <Modal
        open={showAbout}
        onCancel={() => setShowAbout(false)}
        footer={null}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <h2 style={{ color: '#3b82f6', marginBottom: 8 }}>ROCOS-Viz Web</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>Version 0.1.0</p>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
            React + Three.js + ECharts
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 16 }}>
            Shenyang Institute of Automation<br />
            Chinese Academy of Sciences
          </p>
        </div>
      </Modal>
    </div>
  );
}
