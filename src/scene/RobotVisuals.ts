import * as THREE from 'three';
import type { URDFJoint, URDFRobot } from 'urdf-loader';

export interface RobotVisualOptions {
  showTransparent: boolean;
  showJointFrames: boolean;
  showJointAxes: boolean;
}

/** Solid shafts keep coordinate axes thick on platforms with 1px WebGL lines. */
function createJointFrameHelper(name: string): THREE.Group {
  const frame = new THREE.Group();
  frame.name = `joint-frame:${name}`;
  const shaftGeometry = new THREE.CylinderGeometry(0.002, 0.002, 0.06, 12);
  const headGeometry = new THREE.ConeGeometry(0.007, 0.02, 12);
  const directions = [
    { name: 'x', direction: new THREE.Vector3(1, 0, 0), color: 0xef4444 },
    { name: 'y', direction: new THREE.Vector3(0, 1, 0), color: 0x22c55e },
    { name: 'z', direction: new THREE.Vector3(0, 0, 1), color: 0x3b82f6 },
  ];
  for (const { name: axisName, direction, color } of directions) {
    const material = new THREE.MeshBasicMaterial({
      color, depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
    });
    const arrow = new THREE.Group();
    arrow.name = axisName;
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const shaft = new THREE.Mesh(shaftGeometry, material);
    shaft.position.y = 0.03;
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 0.07;
    shaft.renderOrder = head.renderOrder = 1000;
    arrow.add(shaft, head);
    frame.add(arrow);
  }
  return frame;
}

/** Joint-local +Z is mapped to the URDF axis, including negative axes. */
export function createJointAxisHelper(joint: URDFJoint): THREE.Group | null {
  const rotary = joint.jointType === 'revolute' || joint.jointType === 'continuous';
  if ((!rotary && joint.jointType !== 'prismatic') || joint.axis.lengthSq() < 1e-12) return null;

  const helper = new THREE.Group();
  helper.name = `joint-axis:${joint.name}`;
  helper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), joint.axis.clone().normalize());
  const color = 0xf59e0b;
  const axisMaterial = new THREE.MeshBasicMaterial({ color });
  // Use a solid shaft instead of a platform-dependent single-pixel line.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.205, 12), axisMaterial,
  );
  shaft.name = 'axis-shaft';
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.0325;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.009, 0.035, 12), axisMaterial,
  );
  head.name = 'axis-head';
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.1525;
  helper.add(shaft, head);

  if (rotary) {
    // Increasing angle around +Z follows the right-hand rule.
    const radius = 0.055;
    const end = Math.PI * 1.5;
    const points = Array.from({ length: 49 }, (_, i) => {
      const angle = i / 48 * end;
      return new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0);
    });
    const curve = new THREE.CatmullRomCurve3(points);
    const arc = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.002, 6, false),
      new THREE.MeshBasicMaterial({ color }),
    );
    arc.name = 'positive-rotation';
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.009, 0.025, 12),
      new THREE.MeshBasicMaterial({ color }),
    );
    const tangent = new THREE.Vector3(-Math.sin(end), Math.cos(end), 0);
    tip.position.copy(points[points.length - 1]).addScaledVector(tangent, 0.0125);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    tip.name = 'positive-rotation-head';
    helper.add(arc, tip);
  }

  helper.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    object.renderOrder = 1000;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.depthTest = false;
      material.depthWrite = false;
      material.transparent = true;
      material.toneMapped = false;
    }
  });
  return helper;
}

/** Capture model materials before adding helpers so arrows never become transparent. */
export function createRobotVisuals(robot: URDFRobot) {
  const originals = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  robot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!originals.has(material)) {
        originals.set(material, {
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
        });
      }
    }
  });
  const frames: THREE.Group[] = [];
  const axes: THREE.Group[] = [];
  for (const joint of Object.values(robot.joints)) {
    const frame = createJointFrameHelper(joint.name);
    frame.visible = false;
    joint.add(frame);
    frames.push(frame);
    const axis = createJointAxisHelper(joint);
    if (axis) {
      axis.visible = false;
      joint.add(axis);
      axes.push(axis);
    }
  }
  let disposed = false;
  return {
    update({ showTransparent, showJointFrames, showJointAxes }: RobotVisualOptions) {
      if (disposed) return;
      for (const [material, original] of originals) {
        const transparent = showTransparent || original.transparent;
        if (material.transparent !== transparent) material.needsUpdate = true;
        material.transparent = transparent;
        material.opacity = showTransparent ? original.opacity * 0.3 : original.opacity;
        material.depthWrite = showTransparent ? false : original.depthWrite;
      }
      frames.forEach((frame) => { frame.visible = showJointFrames; });
      axes.forEach((axis) => { axis.visible = showJointAxes; });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [material, original] of originals) {
        Object.assign(material, original);
        material.needsUpdate = true;
      }
      // Release each owned resource once.
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const helper of [...frames, ...axes]) {
        helper.removeFromParent();
        helper.traverse((object) => {
          if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material])
            .forEach((material) => materials.add(material));
        });
      }
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
