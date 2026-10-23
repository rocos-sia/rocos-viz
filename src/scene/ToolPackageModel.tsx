import { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { Quaternion } from 'three';
import type { URDFRobot } from 'urdf-loader';
import { FRAME } from '@/core/constants';
import { preciseReference } from '@/core/PreciseMotion';
import { RobotApiClient } from '@/core/RobotApiClient';
import { acquireControllerModel, getToolUrdf } from '@/core/ControllerModelCache';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useT } from '@/i18n/useT';

/** Like ToolFrameAxes, this component lives in the robot's base space. */
export function ToolPackageModel() {
  const t = useT();
  const { host, port, isConnected } = useConnectionStore();
  const state = useRobotStateStore(s => s.robotState);
  const tool = state?.active_tool_package;
  const name = tool?.name, digest = tool?.digest, urdf = tool?.urdf;
  const client = useMemo(() => new RobotApiClient(host, port), [host, port]);
  const identity = useMemo(() => ({ name, digest, urdf }), [name, digest, urdf, isConnected, client]);
  const [loaded, setLoaded] = useState<{ identity: typeof identity; model?: URDFRobot; error?: boolean } | null>(null);
  useEffect(() => {
    if (!isConnected || !name || !digest || !urdf) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    const resourceTool = { name, digest, urdf };
    void getToolUrdf(client, resourceTool).then(xml => acquireControllerModel(xml, client.toolAssetUrl(resourceTool))).then(resource => {
      if (cancelled) resource.release();
      else { release = resource.release; setLoaded({ identity, model: resource.robot }); }
    }).catch(() => { if (!cancelled) setLoaded({ identity, error: true }); });
    return () => { cancelled = true; release?.(); };
  }, [client, isConnected, name, digest, urdf, identity]);
  const flange = preciseReference(FRAME.FLANGE, state);
  const mount = tool && preciseReference(FRAME.FLANGE, { joint_states: [], flange: tool.mount });
  if (!isConnected || !tool || tool.name !== state?.active_tool_frame_name || !flange || !mount || state.tcp === null || !urdf || loaded?.identity !== identity) return null;
  const q = (value: typeof flange.orientation) => new Quaternion(value.x, value.y, value.z, value.w).normalize();
  return <group position={[flange.position.x, flange.position.y, flange.position.z]} quaternion={q(flange.orientation)}>
    <group name="active-tool-model" position={[mount.position.x, mount.position.y, mount.position.z]} quaternion={q(mount.orientation)} userData={{ toolName: tool.name, digest: tool.digest }}>
      {loaded.model && <primitive object={loaded.model} dispose={null} />}
      {loaded.error && <Html style={{ pointerEvents: 'none' }}><span className="scene-tool-frame-label" role="status">{t('tools.modelFailed')}</span></Html>}
    </group>
  </group>;
}
