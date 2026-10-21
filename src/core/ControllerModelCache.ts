import { Mesh, type Material } from 'three';
import type { URDFRobot } from 'urdf-loader';
import { useConnectionStore } from '@/stores/connectionStore';
import { RobotApiClient } from './RobotApiClient';
import { disposePreviewRobot, loadPreviewRobot, readRobotDescription } from './RobotPreview';

interface ModelEntry {
  promise: Promise<URDFRobot>;
  robot?: URDFRobot;
  users: number;
  retired: boolean;
}

const descriptions = new Map<string, Promise<string>>();
const models = new Map<string, ModelEntry>();

function disposeRetired(entry: ModelEntry) {
  if (entry.retired && entry.users === 0 && entry.robot) {
    disposePreviewRobot(entry.robot);
    entry.robot = undefined;
  }
}

/** Connection-scoped cache: route changes never invalidate downloads or parsed geometry. */
function clearControllerModels() {
  descriptions.clear();
  for (const entry of models.values()) {
    entry.retired = true;
    disposeRetired(entry);
  }
  models.clear();
}

const unsubscribe = useConnectionStore.subscribe((state, previous) => {
  if (state.isConnected !== previous.isConnected || state.host !== previous.host
    || state.port !== previous.port || state.autoLoadModel !== previous.autoLoadModel) {
    clearControllerModels();
  }
});

if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); clearControllerModels(); });

/** Share the in-flight request too, including React StrictMode's repeated mount effects. */
export function getControllerUrdf(client: RobotApiClient): Promise<string> {
  const key = client.getMeshBaseUrl();
  let pending = descriptions.get(key);
  if (!pending) {
    pending = client.getUrdf().catch((error: unknown) => {
      if (descriptions.get(key) === pending) descriptions.delete(key);
      throw error;
    });
    descriptions.set(key, pending);
  }
  return pending;
}

function modelEntry(xml: string, meshBase: string): ModelEntry {
  const key = JSON.stringify([meshBase, xml]);
  const cached = models.get(key);
  if (cached) return cached;
  const entry: ModelEntry = {
    users: 0,
    retired: false,
    promise: Promise.resolve().then(() => loadPreviewRobot(readRobotDescription(xml).document,
      (path) => `${meshBase}?path=${encodeURIComponent(path)}`)),
  };
  entry.promise = entry.promise.then((robot) => {
    entry.robot = robot;
    disposeRetired(entry);
    return robot;
  }).catch((error: unknown) => {
    if (models.get(key) === entry) models.delete(key);
    throw error;
  });
  models.set(key, entry);
  return entry;
}

export async function preloadControllerModel(xml: string, meshBase: string): Promise<void> {
  await modelEntry(xml, meshBase).promise;
}

/** Share immutable geometry/textures; each view owns its joints and mutable materials. */
export async function acquireControllerModel(xml: string, meshBase: string) {
  const entry = modelEntry(xml, meshBase);
  entry.users++;
  const materials = new Map<Material, Material>();
  let robot: URDFRobot | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    robot?.removeFromParent();
    materials.forEach((material) => material.dispose());
    entry.users--;
    disposeRetired(entry);
  };
  try {
    const template = await entry.promise;
    robot = template.clone();
    // urdf-loader resets ignoreLimits during clone; telemetry must not be clamped.
    for (const [name, joint] of Object.entries(robot.joints)) {
      joint.ignoreLimits = template.joints[name].ignoreLimits;
    }
    robot.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const copy = (material: Material) => {
        if (!materials.has(material)) materials.set(material, material.clone());
        return materials.get(material)!;
      };
      object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
    });
    return { robot, release };
  } catch (error) {
    release();
    throw error;
  }
}
