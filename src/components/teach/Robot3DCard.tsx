import { useEffect, useState } from 'react';
import { Button, Segmented } from 'antd';
import { ExpandOutlined, ShrinkOutlined } from '@ant-design/icons';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import * as THREE from 'three';
import { AxesIndicator } from '@/scene/AxesIndicator';
import { RobotViewer } from '@/scene/RobotViewer';
import { RobotModel } from '@/scene/RobotModel';
import { SceneErrorBoundary } from '@/scene/SceneErrorBoundary';
import { setCameraPreset } from '@/scene/CameraPresets';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useUIStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { ResetButton, SceneToggles, TrajectoryLineWrapper } from '@/components/layout/SceneControls';

function dispose(robot: URDFRobot) {
  robot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function DemoRobot() {
  const wireframe = useUIStore((s) => s.showWireframe);
  const axes = useUIStore((s) => s.showJointFrames);
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loaded: URDFRobot | null = null;
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
      setRobot(loaded);
    };
    loader.parseCollision = false;
    loader.load('/demo/talon/robot.urdf', (model) => {
      loaded = model;
      if (cancelled) { dispose(model); return; }
      model.setJointValues({ joint_2: -0.5, joint_3: 0.7, joint_5: 0.7 });
    });
    return () => { cancelled = true; if (loaded) dispose(loaded); };
  }, []);
  useEffect(() => {
    if (!robot) return;
    robot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => { (material as THREE.MeshStandardMaterial).wireframe = wireframe; });
    });
    const helpers = axes ? Object.values(robot.joints).map((joint) => {
      const helper = new THREE.AxesHelper(0.08); joint.add(helper); return helper;
    }) : [];
    return () => helpers.forEach((helper) => { helper.removeFromParent(); helper.dispose(); });
  }, [robot, wireframe, axes]);
  return robot ? <primitive object={robot} /> : null;
}

export function Robot3DCard({ urdfContent }: { urdfContent: string | null }) {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  return <TeachCard className={`teach-3d ${expanded ? 'teach-3d-expanded' : ''}`} title={t('teach.scene')}
    extra={<>{!connected && <DemoBadge />}<Button aria-label={t('teach.expand')} icon={expanded ? <ShrinkOutlined /> : <ExpandOutlined />} onClick={() => setExpanded(!expanded)} /></>}>
    <div className="teach-scene-canvas">
    <div className="teach-scene-toolbar">
      <Segmented options={[{ label: t('view.axonometric'), value: 'axonometric' }, { label: t('view.top'), value: 'top' }, { label: t('view.front'), value: 'front' }, { label: t('view.right'), value: 'right' }]}
        onChange={(value) => setCameraPreset(value as 'axonometric' | 'top' | 'front' | 'right')} />
    </div>
      <SceneErrorBoundary>
        <RobotViewer>
          <AxesIndicator />
          {connected ? <RobotModel urdfContent={urdfContent} meshBasePath={new RobotApiClient(host, port).getMeshBaseUrl()} /> : <DemoRobot />}
          {connected && <TrajectoryLineWrapper />}
        </RobotViewer>
      </SceneErrorBoundary>
      {connected && !urdfContent && <div className="teach-scene-note">{t('teach.loadingModel')}</div>}
      <ResetButton />
      <SceneToggles />
    </div>
  </TeachCard>;
}
