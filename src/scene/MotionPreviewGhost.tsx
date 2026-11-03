import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Mesh, MeshStandardMaterial } from 'three';
import type { URDFRobot } from 'urdf-loader';
import { acquireControllerModel } from '@/core/ControllerModelCache';
import { advancePreviewPlayback, previewPositionsAt } from '@/core/MotionPreview';
import { useMotionPreviewStore } from '@/stores/motionPreviewStore';
import { useT } from '@/i18n/useT';

const GHOST_COLOR = '#22a6b3';

export function MotionPreviewGhost({ xml, meshBase }: { xml: string; meshBase: string }) {
  const t = useT();
  const mode = useMotionPreviewStore(s => s.mode);
  const trajectory = useMotionPreviewStore(s => s.trajectory);
  const [robots, setRobots] = useState<URDFRobot[]>([]);
  const moving = useRef<URDFRobot | null>(null);
  const lastFrame = useRef<number | null>(null);
  useEffect(() => {
    const resetClock = () => { lastFrame.current = null; };
    document.addEventListener('visibilitychange', resetClock);
    return () => document.removeEventListener('visibilitychange', resetClock);
  }, []);
  useEffect(() => {
    lastFrame.current = null;
    if (mode !== 'simulation' || !trajectory) return;
    let cancelled = false;
    const releases: (() => void)[] = [];
    const count = Math.min(8, trajectory.points.length);
    const load = async () => {
      const copies: URDFRobot[] = [];
      // Share geometry and downloads; each ghost owns only transforms/materials.
      for (let i = 0; i <= count; i++) {
        const resource = await acquireControllerModel(xml, meshBase);
        if (cancelled) { resource.release(); return; }
        releases.push(resource.release);
        const robot = resource.robot;
        robot.name = i === count ? 'motion-preview-cursor' : `motion-preview-ghost-${i}`;
        robot.traverse(object => {
          if (!(object instanceof Mesh)) return;
          object.castShadow = false;
          object.receiveShadow = false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
            const mat = material as MeshStandardMaterial;
            mat.color?.set(GHOST_COLOR);
            mat.transparent = true;
            mat.opacity = i === count ? 0.55 : 0.03 + 0.05 * i / Math.max(1, count - 1);
            mat.depthWrite = false;
            mat.needsUpdate = true;
          });
        });
        const point = trajectory.points[count === 1 ? 0 : Math.round(Math.min(i, count - 1) * (trajectory.points.length - 1) / (count - 1))];
        robot.setJointValues(Object.fromEntries(trajectory.joint_names.map((name, j) => [name, point.positions[j]])));
        copies.push(robot);
      }
      moving.current = copies[count];
      setRobots(copies);
    };
    void load().catch(() => {
      releases.forEach(release => release());
      if (!cancelled) useMotionPreviewStore.setState({ error: t('preview.modelFailed'), playing: false });
    });
    return () => { cancelled = true; moving.current = null; setRobots([]); releases.forEach(release => release()); };
  }, [mode, trajectory, xml, meshBase, t]);
  useFrame(() => {
    const now = performance.now();
    const elapsed = lastFrame.current === null ? 0 : (now - lastFrame.current) / 1000;
    lastFrame.current = now;
    const state = useMotionPreviewStore.getState();
    if (state.mode !== 'simulation' || !state.trajectory) return;
    let time = state.time;
    if (state.playing && moving.current && !document.hidden) {
      time = advancePreviewPlayback(time, elapsed, state.trajectory.duration);
      useMotionPreviewStore.setState({ time });
    }
    if (moving.current) {
      const values = previewPositionsAt(state.trajectory, time);
      moving.current.setJointValues(Object.fromEntries(state.trajectory.joint_names.map((name, i) => [name, values[i]])));
    }
  });
  if (mode !== 'simulation' || !trajectory) return null;
  return <group name="motion-preview">
    {robots.map(robot => <primitive key={robot.uuid} object={robot} dispose={null} />)}
    {trajectory.points.length > 1 && <Line color={GHOST_COLOR} lineWidth={2}
      points={trajectory.points.map(p => [p.flange.position.x, p.flange.position.y, p.flange.position.z])} />}
  </group>;
}
