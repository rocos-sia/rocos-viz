import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const output = mkdtempSync(join(tmpdir(), 'rocos-visuals-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
symlinkSync(resolve('node_modules'), join(output, 'node_modules'), 'dir');
execFileSync('node_modules/.bin/tsc', [
  '--target', 'ES2020', '--module', 'commonjs', '--skipLibCheck', '--outDir', output,
  'src/scene/RobotVisuals.ts',
]);
const require = createRequire(import.meta.url);
const THREE = require('three');
const { createJointAxisHelper, createRobotVisuals } = require(join(output, 'RobotVisuals.js'));
const off = { showTransparent: false, showJointFrames: false, showJointAxes: false };

function joint(type, axis = [0, 0, 1]) {
  return Object.assign(new THREE.Group(), { name: type, jointType: type, axis: new THREE.Vector3(...axis) });
}

test('joint indicators use the URDF axis and right-hand positive rotation', () => {
  for (const direction of [[0, 0, 1], [0, 0, -1], [1, 2, -3]]) {
    const root = new THREE.Group();
    root.rotation.set(0.4, -0.7, 0.2);
    const j = joint('revolute', direction);
    j.rotation.set(0.2, 0.5, -0.3);
    root.add(j);
    const helper = createJointAxisHelper(j);
    j.add(helper);
    root.updateMatrixWorld(true);
    const axis = new THREE.Vector3(0, 0, 1).transformDirection(helper.matrixWorld);
    const expected = j.axis.clone().normalize().transformDirection(j.matrixWorld);
    assert.ok(axis.distanceTo(expected) < 1e-6);
    const head = helper.getObjectByName('positive-rotation-head');
    const tangent = new THREE.Vector3(0, 1, 0).applyQuaternion(head.quaternion);
    assert.ok(new THREE.Vector3().crossVectors(head.position, tangent).z > 0);
  }
  assert.ok(createJointAxisHelper(joint('continuous')).getObjectByName('positive-rotation'));
  assert.equal(createJointAxisHelper(joint('prismatic')).getObjectByName('positive-rotation'), undefined);
  for (const type of ['fixed', 'floating', 'planar']) assert.equal(createJointAxisHelper(joint(type)), null);
  assert.equal(createJointAxisHelper(joint('revolute', [0, 0, 0])), null);
});

test('transparency and helpers are independent; toggling off restores original materials', () => {
  const robot = new THREE.Group();
  const j = joint('revolute');
  robot.joints = { j };
  const solid = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ opacity: 0.6, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [solid, glass]);
  j.add(mesh);
  robot.add(j);
  const visuals = createRobotVisuals(robot);
  visuals.update({ ...off, showJointAxes: true, showJointFrames: true });
  assert.equal(solid.opacity, 1);
  const axis = j.getObjectByName('joint-axis:revolute');
  assert.equal(axis.visible, true);
  visuals.update({ ...off, showTransparent: true, showJointAxes: true });
  assert.equal(solid.opacity, 0.3);
  assert.equal(glass.opacity, 0.18);
  assert.equal(solid.depthWrite, false);
  assert.equal(axis.getObjectByName('positive-rotation').material.opacity, 1);
  assert.equal(j.getObjectByName('joint-frame:revolute').visible, false);
  visuals.update(off);
  assert.equal(solid.transparent, false);
  assert.equal(solid.opacity, 1);
  assert.equal(solid.depthWrite, true);
  assert.equal(glass.opacity, 0.6);
  assert.equal(glass.transparent, true);
  assert.equal(glass.depthWrite, false);
  assert.equal(axis.visible, false);
  let disposed = 0;
  axis.getObjectByName('positive-rotation').geometry.addEventListener('dispose', () => disposed++);
  visuals.dispose();
  visuals.dispose();
  assert.deepEqual(j.children, [mesh]);
  assert.equal(disposed, 1);
});
