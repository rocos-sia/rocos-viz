import { useUnits } from '@/stores/unitStore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Button, Spin, Tooltip } from 'antd';
import { PauseOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Group, PerspectiveCamera } from 'three';
import type { URDFRobot } from 'urdf-loader';
import { RobotApiClient } from '@/core/RobotApiClient';
import { acquireControllerModel } from '@/core/ControllerModelCache';
import { disposePreviewRobot, fitPreviewCamera, loadPreviewRobot, previewBounds, readRobotDescription } from '@/core/RobotPreview';
import type { RobotModelSummary } from '@/core/types';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useT } from '@/i18n/useT';
import { SceneErrorBoundary } from '@/scene/SceneErrorBoundary';
import { ToolFrameAxes } from '@/scene/ToolFrameAxes';
import { SceneSlot } from './SceneSlot';

function Turntable({ robot, rotating, connected }: { robot: URDFRobot; rotating: boolean; connected: boolean }) {
  const group = useRef<Group>(null);
  const { camera, size } = useThree();
  const { center, radius } = useMemo(() => previewBounds(robot), [robot]);
  useEffect(() => {
    fitPreviewCamera(camera as PerspectiveCamera, radius, size.width / Math.max(size.height, 1));
  }, [camera, radius, size]);
  useFrame((_, delta) => {
    if (connected) {
      const joints = useRobotStateStore.getState().robotState?.joint_states ?? [];
      for (const joint of joints) {
        if (Number.isFinite(joint.position)) robot.setJointValue(joint.name, joint.position);
      }
    }
    // Positive Z rotation is counterclockwise when viewed from above; two turns/minute.
    if (rotating && group.current) group.current.rotation.z += Math.min(delta, 0.1) * Math.PI / 15;
  });
  return <group ref={group}><group position={[-center.x, -center.y, -center.z]}>
    <primitive object={robot} dispose={null} />
    {connected && <ToolFrameAxes />}
  </group></group>;
}

function Preview({ xml, connected, meshBase, active }: { xml: string | null; connected: boolean; meshBase: string; active: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  const units = useUnits();
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [model, setModel] = useState<URDFRobot | null>(null);
  const [summary, setSummary] = useState<RobotModelSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let releaseModel: (() => void) | undefined;
    const abort = new AbortController();
    setFailed(false);
    setModel(null);
    async function load() {
      // A connected controller without a URDF must never show the demo as its model.
      if (connected && !xml) return;
      const response = xml ? null : await fetch('/demo/talon/robot.urdf', { signal: abort.signal });
      if (response && !response.ok) throw new Error('Unable to load URDF');
      const description = readRobotDescription(xml ?? await response!.text());
      if (cancelled) return;
      setSummary(description.summary);
      const resource = connected
        ? await acquireControllerModel(xml!, meshBase)
        : await loadPreviewRobot(description.document, (path) => new URL(path, `${window.location.origin}/demo/talon/`).href)
          .then((robot) => ({ robot, release: () => disposePreviewRobot(robot) }));
      if (cancelled) resource.release();
      else { releaseModel = resource.release; setModel(resource.robot); }
    }
    void load().catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      abort.abort();
      releaseModel?.();
    };
  }, [xml, connected, meshBase, attempt]);
  const missing = t('teach.model.missing');
  const spinLabel = paused ? t('teach.model.rotate') : t('teach.model.pause');
  return <div className="teach-robot-overview">
    <div className="teach-robot-preview" data-model-status={failed ? 'error' : model ? 'ready' : 'loading'}>
      {model ? <SceneErrorBoundary>
        <Canvas frameloop={active ? 'always' : 'never'} camera={{ fov: 38 }} dpr={[1, 1.5]} aria-label={t(connected ? 'teach.model.livePreview' : 'teach.model.preview')} role="img">
          <ambientLight intensity={0.45} />
          <directionalLight position={[3, -4, 5]} intensity={1} />
          <directionalLight position={[-3, 2, 2]} intensity={0.4} />
          <Turntable robot={model} rotating={!paused && !reduced} connected={connected} />
        </Canvas>
      </SceneErrorBoundary> : <div className="teach-model-placeholder" role="status">
        {!failed && <Spin size="small" />}
        <span>{failed ? t('teach.model.error') : connected && !xml ? t('teach.model.unavailable') : t('teach.model.loading')}</span>
        {failed && <Button icon={<ReloadOutlined />} onClick={() => setAttempt((n) => n + 1)}>{t('teach.model.retry')}</Button>}
      </div>}
      {model && !reduced && <Tooltip title={spinLabel}><Button className="teach-model-spin" size="small"
        icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />} aria-label={spinLabel}
        aria-pressed={paused} onClick={() => setPaused((value) => !value)} /></Tooltip>}
    </div>
    <div className="teach-robot-info">
      <span className="teach-eyebrow">{connected ? t('teach.controller') : t('teach.demoRobot')}</span>
      <h3>{summary?.name || missing}</h3>
      <dl>
        <dt>{t('teach.dof')}</dt><dd>{summary?.dof ?? '—'}</dd>
        <dt>{t('teach.model.mass')}</dt><dd>{summary?.totalMass != null ? `${(summary.totalMass * units.mass.factor).toFixed(3)} ${units.mass.label}` : missing}</dd>
        <dt>{t('teach.model.serial')}</dt><dd>{missing}</dd>
        <dt>{t('teach.model.links')}</dt><dd>{summary?.linkCount ?? '—'}</dd>
        <dt>{t('teach.source')}</dt><dd>{connected ? 'URDF' : t('teach.demo')}</dd>
      </dl>
      {summary?.totalMass == null && summary?.definedMass != null && <p className="teach-model-note">{t('teach.model.partialMass', {
        mass: (summary.definedMass * units.mass.factor).toFixed(3), unit: units.mass.label, count: summary.massLinkCount, total: summary.linkCount,
      })}</p>}
      <p className="teach-model-note">{t(connected ? 'teach.model.livePose' : 'teach.model.initialPose')}</p>
    </div>
  </div>;
}

export function RobotOverviewScene({ urdfContent, active }: { urdfContent: string | null; active: boolean }) {
  const connected = useConnectionStore((s) => s.isConnected);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const meshBase = useMemo(() => new RobotApiClient(host, port).getMeshBaseUrl(), [host, port]);
  const xml = connected ? urdfContent : null;
  // Remount immediately on source changes so metadata and geometry cannot be stale.
  return <Preview key={`${connected}:${meshBase}:${xml}`} xml={xml} connected={connected} meshBase={meshBase} active={active} />;
}

export function RobotOverview() {
  return <SceneSlot name="overview" />;
}
