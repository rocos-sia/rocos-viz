import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Tooltip } from 'antd';
import { ExpandOutlined, ShrinkOutlined } from '@ant-design/icons';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import * as THREE from 'three';
import { AxesIndicator } from '@/scene/AxesIndicator';
import { RobotViewer } from '@/scene/RobotViewer';
import { RobotModel } from '@/scene/RobotModel';
import { ToolFrameAxes } from '@/scene/ToolFrameAxes';
import { ToolPackageModel } from '@/scene/ToolPackageModel';
import { SceneErrorBoundary } from '@/scene/SceneErrorBoundary';
import { setCameraPreset } from '@/scene/CameraPresets';
import { RobotApiClient } from '@/core/RobotApiClient';
import { attachRobotVisuals } from '@/scene/attachRobotVisuals';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { ResetButton, SceneToggles, TrajectoryLineWrapper } from '@/components/layout/SceneControls';
import { SceneSlot } from './SceneSlot';

type CameraPreset = Parameters<typeof setCameraPreset>[0];
const VIEW_PRESETS: CameraPreset[] = ['axonometric', 'top', 'front', 'right'];

function ViewPresetIcon({ preset }: { preset: CameraPreset }) {
  const faces = {
    top: '12,3 21,7.5 12,12 3,7.5',
    front: '3,7.5 12,12 12,21 3,16.5',
    right: '12,12 21,7.5 21,16.5 12,21',
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {Object.entries(faces).map(([face, points]) => (
        <polygon key={face} points={points} stroke="none" fill="currentColor"
          fillOpacity={preset === face ? 0.45 : preset === 'axonometric' ? 0.12 : 0} />
      ))}
      <path d="M12 3 21 7.5v9L12 21 3 16.5v-9L12 3ZM3 7.5l9 4.5 9-4.5M12 12v9" />
    </svg>
  );
}

function dispose(robot: URDFRobot) {
  robot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function DemoRobot() {
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loaded: URDFRobot | null = null;
    let cleanupVisuals: (() => void) | undefined;
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    manager.onLoad = () => {
      if (!loaded) return;
      if (cancelled) { dispose(loaded); return; }
      loaded.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            const mat = material as THREE.MeshStandardMaterial;
            if (mat.color) mat.color.set('#b8c9de');
          });
        }
      });
      cleanupVisuals = attachRobotVisuals(loaded);
      setRobot(loaded);
    };
    loader.parseCollision = false;
    loader.load('/demo/talon/robot.urdf', (model) => {
      loaded = model;
      if (cancelled) { dispose(model); return; }
      model.setJointValues({ joint_2: -0.5, joint_3: 0.7, joint_5: 0.7 });
    });
    return () => {
      cancelled = true;
      cleanupVisuals?.();
      if (loaded) dispose(loaded);
    };
  }, []);
  return robot ? <primitive object={robot} /> : null;
}

export function Robot3DCardScene({ urdfContent, active }: { urdfContent: string | null; active: boolean }) {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const [expanded, setExpanded] = useState(false);
  const [viewPreset, setViewPreset] = useState<CameraPreset>('axonometric');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [nearToolbar, setNearToolbar] = useState(false);
  useEffect(() => {
    if (!active) {
      setExpanded(false);
      setNearToolbar(false);
    }
  }, [active]);
  const updateToolbarProximity = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !toolbarRef.current) return;
    const rect = toolbarRef.current.getBoundingClientRect();
    const margin = 32;
    setNearToolbar(event.clientX >= rect.left - margin && event.clientX <= rect.right + margin
      && event.clientY >= rect.top - margin && event.clientY <= rect.bottom + margin);
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  return <TeachCard className={`teach-3d ${expanded ? 'teach-3d-expanded' : ''}`} title={t('teach.scene')}
    extra={<>{!connected && <DemoBadge />}<Button aria-label={t('teach.expand')} icon={expanded ? <ShrinkOutlined /> : <ExpandOutlined />} onClick={() => setExpanded(!expanded)} /></>}>
    <div className="teach-scene-canvas" onPointerMoveCapture={updateToolbarProximity}
      onPointerLeave={() => setNearToolbar(false)}>
      <div ref={toolbarRef} className={`teach-scene-toolbar${nearToolbar ? ' is-near' : ''}`} role="group" aria-label={t('scene.views')}>
        {VIEW_PRESETS.map((preset) => (
          <Tooltip key={preset} title={t(`view.${preset}`)} placement="bottom" trigger={['hover', 'focus']}>
            <button
              type="button"
              className={`scene-toggle-pill${viewPreset === preset ? ' active' : ''}`}
              aria-label={t(`view.${preset}`)}
              aria-pressed={viewPreset === preset}
              onClick={() => { setViewPreset(preset); setCameraPreset(preset); }}
            >
              <span className="pill-icon"><ViewPresetIcon preset={preset} /></span>
            </button>
          </Tooltip>
        ))}
      </div>
      <SceneErrorBoundary>
        <RobotViewer active={active}>
          <AxesIndicator />
          {connected ? <RobotModel urdfContent={urdfContent} meshBasePath={new RobotApiClient(host, port).getMeshBaseUrl()} /> : <DemoRobot />}
          {connected && urdfContent && <ToolFrameAxes />}
          {connected && urdfContent && <ToolPackageModel />}
          {connected && active && <TrajectoryLineWrapper />}
        </RobotViewer>
      </SceneErrorBoundary>
      {connected && !urdfContent && <div className="teach-scene-note">{t('teach.loadingModel')}</div>}
      {active && <ResetButton />}
      <SceneToggles />
    </div>
  </TeachCard>;
}

export function Robot3DCard() {
  return <SceneSlot name="workspace" />;
}
