import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Button, Checkbox, Spin } from 'antd';
import { Box3, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { URDFRobot } from 'urdf-loader';
import { acquireControllerModel, getToolUrdf } from '@/core/ControllerModelCache';
import { fitPreviewCamera } from '@/core/RobotPreview';
import type { RobotApiClient } from '@/core/RobotApiClient';
import type { Pose, ToolPackage } from '@/core/types';
import { toolPackagePose } from '@/core/ToolPose';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';
import { SceneErrorBoundary } from '@/scene/SceneErrorBoundary';

const axes = [
  { name: 'X', direction: new Vector3(1, 0, 0), color: '#ef4444' },
  { name: 'Y', direction: new Vector3(0, 1, 0), color: '#22c55e' },
  { name: 'Z', direction: new Vector3(0, 0, 1), color: '#3b82f6' },
].map(axis => ({ ...axis, rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis.direction) }));

function poseMatrix(pose: Pose) {
  const p = new Vector3(pose.position.x, pose.position.y, pose.position.z);
  const q = new Quaternion(pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w);
  if (![...p.toArray(), ...q.toArray()].every(Number.isFinite) || q.lengthSq() < 1e-12) return null;
  return new Matrix4().compose(p, q.normalize(), new Vector3(1, 1, 1));
}

function FrameAxes({ name, label, matrix, length, kind }: {
  name: string; label: string; matrix: Matrix4; length: number; kind: 'mount' | 'tcp';
}) {
  return <group name={name} matrix={matrix} matrixAutoUpdate={false}>
    {axes.map(axis => <group key={axis.name} quaternion={axis.rotation}>
      <mesh position={[0, length * 0.4, 0]} renderOrder={1001}>
        <cylinderGeometry args={[length * 0.016, length * 0.016, length * 0.8, 12]} />
        <meshBasicMaterial color={axis.color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, length * 0.9, 0]} renderOrder={1001}>
        <coneGeometry args={[length * 0.055, length * 0.2, 12]} />
        <meshBasicMaterial color={axis.color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>)}
    <Html position={[0, 0, 0]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <span className={`teach-package-frame-label ${kind}`}>{label}</span>
    </Html>
  </group>;
}

function PreviewScene({ model, mount, tcp, showMount, showTcp, reset }: {
  model?: URDFRobot; mount: Matrix4; tcp: Matrix4; showMount: boolean; showTcp: boolean; reset: number;
}) {
  const t = useT();
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const modelBounds = useMemo(() => model ? new Box3().setFromObject(model) : new Box3(), [model]);
  const layout = useMemo(() => {
    const box = modelBounds.clone().applyMatrix4(mount);
    box.expandByPoint(new Vector3());
    box.expandByPoint(new Vector3().setFromMatrixPosition(mount));
    box.expandByPoint(new Vector3().setFromMatrixPosition(tcp));
    const length = Math.max(0.04, Math.min(0.12, box.getSize(new Vector3()).length() * 0.3));
    const floor = box.min.z - length * 0.12;
    box.expandByScalar(length * 1.3);
    return { center: box.getCenter(new Vector3()), radius: box.getSize(new Vector3()).length() / 2, length, floor };
  }, [modelBounds, mount, tcp]);
  useEffect(() => {
    // Clear residual orbit damping before placing the reset camera.
    const orbit = controls.current;
    if (orbit) {
      const damping = orbit.enableDamping;
      orbit.enableDamping = false;
      orbit.update();
      orbit.enableDamping = damping;
    }
    fitPreviewCamera(camera as PerspectiveCamera, layout.radius, size.width / Math.max(size.height, 1));
    // Keep the entire preview visible at the maximum orbit zoom distance.
    camera.far = Math.max(camera.far, layout.radius * 18);
    camera.updateProjectionMatrix();
    camera.position.add(layout.center);
    camera.lookAt(layout.center);
    controls.current?.target.copy(layout.center);
    controls.current?.update();
    invalidate();
  }, [camera, invalidate, layout, reset, size.width, size.height]);
  return <>
    <ambientLight intensity={0.8} />
    <directionalLight position={[3, -4, 5]} intensity={1.6} />
    <directionalLight position={[-3, 2, 2]} intensity={0.5} />
    <group name="package-preview-model" matrix={mount} matrixAutoUpdate={false}>
      {model && <primitive object={model} dispose={null} />}
    </group>
    <gridHelper args={[layout.radius * 3, 20, '#aab8ca', '#dde4ed']} rotation={[Math.PI / 2, 0, 0]}
      position={[layout.center.x, layout.center.y, layout.floor]} />
    <group name="package-preview-flange">
      <mesh><sphereGeometry args={[layout.length * 0.04, 12, 8]} /><meshBasicMaterial color="#64748b" /></mesh>
    </group>
    {showMount && <FrameAxes name="package-preview-mount" label={t('tools.previewMount')} matrix={mount} length={layout.length} kind="mount" />}
    {showTcp && <FrameAxes name="package-preview-tcp" label={t('tools.previewTcp')} matrix={tcp} length={layout.length * 1.3} kind="tcp" />}
    <OrbitControls ref={controls} makeDefault enableDamping minDistance={layout.radius * 0.15} maxDistance={layout.radius * 15} />
  </>;
}

function SelectedPackagePreview({ tool, client, connected }: { tool: ToolPackage; client: RobotApiClient; connected: boolean }) {
  const t = useT();
  const [resource, setResource] = useState<{ model?: URDFRobot; failed?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  const [reset, setReset] = useState(0);
  const [showMount, setShowMount] = useState(true), [showTcp, setShowTcp] = useState(true);
  const { name, digest, urdf } = tool;
  useEffect(() => {
    if (!connected || !urdf) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    setResource({});
    const descriptor = { name, digest, urdf };
    void getToolUrdf(client, descriptor).then(xml => {
      if (cancelled) return;
      return acquireControllerModel(xml, client.toolAssetUrl(descriptor));
    }).then(loaded => {
      if (!loaded) return;
      if (cancelled) loaded.release();
      else { release = loaded.release; setResource({ model: loaded.robot }); }
    }).catch(() => { if (!cancelled) setResource({ failed: true }); });
    return () => { cancelled = true; release?.(); };
  }, [client, connected, name, digest, urdf, attempt]);
  const transforms = useMemo(() => {
    const mount = poseMatrix(toolPackagePose(tool.mount)), local = poseMatrix(toolPackagePose(tool.tcp));
    return mount && local ? { mount, tcp: mount.clone().multiply(local) } : null;
  }, [tool.mount, tool.tcp]);
  const status = !connected ? 'disconnected' : !transforms ? 'invalid' : !urdf ? 'axes-only' : resource.failed ? 'error' : resource.model ? 'ready' : 'loading';
  return <section className="teach-package-preview" aria-label={t('tools.preview')} data-model-status={status}>
    <header><h3>{t('tools.preview')}</h3><Button size="small" onClick={() => setReset(value => value + 1)}>{t('tools.previewReset')}</Button></header>
    <div className="teach-package-preview-options">
      <Checkbox checked={showMount} onChange={event => setShowMount(event.target.checked)}>{t('tools.previewMount')}</Checkbox>
      <Checkbox checked={showTcp} onChange={event => setShowTcp(event.target.checked)}>{t('tools.previewTcp')}</Checkbox>
      <span className="teach-package-axis-key"><b>X</b><b>Y</b><b>Z</b></span>
    </div>
    <div className="teach-package-preview-canvas">
      {connected && transforms && <SceneErrorBoundary><Canvas frameloop="demand" camera={{ fov: 38, up: [0, 0, 1] }} dpr={[1, 1.5]}
        role="img" aria-label={`${t('tools.preview')}: ${name}`}>
        <PreviewScene model={resource.model} mount={transforms.mount} tcp={transforms.tcp} showMount={showMount} showTcp={showTcp} reset={reset} />
      </Canvas></SceneErrorBoundary>}
      {status !== 'ready' && <div className="teach-package-preview-status" role="status">
        {status === 'loading' && <Spin size="small" />}
        <span>{t(status === 'disconnected' ? 'tools.connect' : status === 'invalid' ? 'tools.previewInvalid' : status === 'axes-only' ? 'tools.previewNoModel' : status === 'error' ? 'tools.modelFailed' : 'teach.model.loading')}</span>
        {status === 'error' && <Button size="small" onClick={() => setAttempt(value => value + 1)}>{t('tools.previewRetry')}</Button>}
      </div>}
    </div>
    <p className="teach-muted teach-package-preview-hint">{t('tools.previewHint')}</p>
    {(tool.mount == null || tool.tcp == null) && <p className="teach-muted teach-package-preview-hint">{t('tools.previewIdentity')}</p>}
  </section>;
}

/** Package inspection uses the saved transforms, independently of the active robot tool. */
export function ToolPackagePreview({ tool, client }: { tool: ToolPackage; client: RobotApiClient }) {
  const connected = useConnectionStore(s => s.isConnected);
  const autoLoadModel = useConnectionStore(s => s.autoLoadModel);
  const key = `${client.toolAssetUrl(tool, tool.urdf)}:${connected}:${autoLoadModel}`;
  return <SelectedPackagePreview key={key} tool={tool} client={client} connected={connected} />;
}
