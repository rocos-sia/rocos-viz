import { Box3, LoadingManager, Mesh, Texture, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import type { RobotModelSummary } from './types';

/** Model metadata only; missing inertial data is not assumed to mean zero mass. */
export function readRobotDescription(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (document.querySelector('parsererror') || root.tagName !== 'robot') throw new Error('Invalid URDF');
  const children = Array.from(root.children);
  const links = children.filter((node) => node.tagName === 'link');
  const joints = children.filter((node) => node.tagName === 'joint' && !node.querySelector('mimic'));
  const freedoms: Record<string, number> = { revolute: 1, continuous: 1, prismatic: 1, planar: 3, floating: 6 };
  const masses = links.flatMap((link) => {
    const value = link.querySelector('inertial > mass')?.getAttribute('value');
    const mass = value?.trim() ? Number(value) : NaN;
    return Number.isFinite(mass) && mass >= 0 ? [mass] : [];
  });
  const definedMass = masses.length ? masses.reduce((sum, mass) => sum + mass, 0) : null;
  const summary: RobotModelSummary = {
    name: root.getAttribute('name')?.trim() || '',
    dof: joints.reduce((sum, joint) => sum + (freedoms[joint.getAttribute('type') ?? ''] ?? 0), 0),
    linkCount: links.length,
    massLinkCount: masses.length,
    definedMass,
    totalMass: masses.length === links.length ? definedMass : null,
  };
  return { document, summary };
}

export function disposePreviewRobot(robot: Object3D) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<import('three').Material>();
  const textures = new Set<Texture>();
  robot.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
  });
  robot.removeFromParent();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    Object.values(material).forEach((value) => { if (value instanceof Texture) textures.add(value); });
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
}

/** An isolated zero-joint model, with no telemetry or scene-option subscriptions. */
export function loadPreviewRobot(document: Document, meshUrl: (path: string) => string): Promise<URDFRobot> {
  return new Promise((resolve, reject) => {
    const manager = new LoadingManager();
    const loader = new URDFLoader(manager);
    let robot: URDFRobot | undefined;
    let failure: Error | undefined;
    manager.onError = () => { failure = new Error('Unable to load robot mesh'); };
    manager.onLoad = () => {
      if (failure || !robot) {
        if (robot) disposePreviewRobot(robot);
        reject(failure ?? new Error('Unable to load robot'));
      } else resolve(robot);
    };
    loader.parseCollision = false;
    loader.packages = () => '';
    loader.loadMeshCb = (path, mgr, material, complete) => {
      if (!/\.(stl|dae)$/i.test(path)) {
        failure = new Error('Unsupported robot mesh format');
        return;
      }
      loader.defaultMeshLoader(meshUrl(path.replace(/^\/+/, '')), mgr, material, complete);
    };
    // Keep the manager open through parsing (also handles primitive-only URDFs).
    manager.itemStart('preview-parse');
    try {
      robot = loader.parse(document);
      for (const joint of Object.values(robot.joints)) {
        // Zero is a display pose, even when outside the physical joint limits.
        joint.ignoreLimits = true;
      }
      for (const joint of Object.values(robot.joints)) {
        if (!joint.urdfNode?.querySelector('mimic')) joint.setJointValue(...joint.jointValue.map(() => 0));
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      manager.itemEnd('preview-parse');
    }
  });
}

export function previewBounds(robot: Object3D) {
  robot.updateMatrixWorld(true);
  const box = new Box3().setFromObject(robot);
  if (box.isEmpty()) return { center: new Vector3(), radius: 0.5 };
  return { center: box.getCenter(new Vector3()), radius: Math.max(box.getSize(new Vector3()).length() / 2, 0.01) };
}

/** A bounding sphere fits all turntable angles, including narrow cards. */
export function fitPreviewCamera(camera: PerspectiveCamera, radius: number, aspect: number) {
  const halfFov = camera.fov * Math.PI / 360;
  const limitingAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * aspect));
  const distance = radius / Math.sin(limitingAngle) * 1.12;
  camera.position.copy(new Vector3(1.5, -2, 1).normalize().multiplyScalar(distance));
  camera.up.set(0, 0, 1);
  camera.near = Math.max(radius / 100, 0.001);
  camera.far = distance + radius * 10;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
