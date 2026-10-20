import { useState, useEffect, useCallback, useRef } from 'react';
import { Tooltip, message } from 'antd';
import { DeploymentUnitOutlined, AimOutlined, BorderBottomOutlined, NodeIndexOutlined, WarningOutlined } from '@ant-design/icons';
import { useCompactScreen } from '@/hooks/useCompactScreen';
import { useUIStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { TrajectoryLine } from '@/scene/TrajectoryLine';
import { MAX_TRAJECTORY_POINTS } from '@/core/constants';
import { useT } from '@/i18n/useT';
import * as THREE from 'three';

function TransparencyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" fillOpacity="0.4" />
    </svg>
  );
}

/** Reactive scene-toggle buttons – uses hooks so state changes are reflected immediately */
export function SceneToggles({ style }: { style?: React.CSSProperties }) {
  const t = useT();
  const showJointFrames = useUIStore((s) => s.showJointFrames);
  const showTransparent = useUIStore((s) => s.showTransparent);
  const showJointAxes = useUIStore((s) => s.showJointAxes);
  const showGround = useUIStore((s) => s.showGround);
  const showTrajectory = useUIStore((s) => s.showTrajectory);
  const toggleJointFrames = useUIStore((s) => s.toggleJointFrames);
  const toggleTransparent = useUIStore((s) => s.toggleTransparent);
  const toggleJointAxes = useUIStore((s) => s.toggleJointAxes);
  const toggleGround = useUIStore((s) => s.toggleGround);
  const toggleTrajectory = useUIStore((s) => s.toggleTrajectory);

  const toggles = [
    { key: 'transparent', label: t('scene.transparent'), icon: <TransparencyIcon />, active: showTransparent, onClick: toggleTransparent },
    { key: 'axes', label: t('scene.axes'), icon: <DeploymentUnitOutlined />, active: showJointFrames, onClick: toggleJointFrames },
    { key: 'jointAxes', label: t('scene.jointAxes'), icon: <AimOutlined />, active: showJointAxes, onClick: toggleJointAxes },
    { key: 'ground', label: t('scene.ground'), icon: <BorderBottomOutlined />, active: showGround, onClick: toggleGround },
    { key: 'traj', label: t('scene.trajectory'), icon: <NodeIndexOutlined />, active: showTrajectory, onClick: toggleTrajectory },
  ];

  return (
    <div className="scene-toggles" style={style} role="group" aria-label={t('scene.options')}>
      {toggles.map((t) => (
        <Tooltip key={t.key} title={t.label} trigger={['hover', 'focus']}>
          <button
            type="button"
            className={`scene-toggle-pill${t.active ? ' active' : ''}`}
            aria-label={t.label}
            aria-pressed={t.active}
            onClick={t.onClick}
          >
            <span className="pill-icon" aria-hidden="true">{t.icon}</span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/** Isolated component so that high-frequency WebSocket updates to robotStateStore
 *  never cause AppLayout (and the 3D canvas tree) to re-render. */
export function ResetButton() {
  const t = useT();
  const compact = useCompactScreen();
  const token = useConnectionStore((s) => s.controlToken);
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
        disabled={compact || !token || resetting || !isErrorState}
        onClick={handleReset}
        title={t('control.reset')}
      >
        {resetting ? <span className="robot-reset-spin">↻</span> : <WarningOutlined />}
        <span className="robot-reset-label">Reset</span>
      </button>
    </div>
  );
}

export function TrajectoryLineWrapper() {
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
