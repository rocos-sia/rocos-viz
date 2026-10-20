import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { parseUrdf } from '@/core/UrdfModelLoader';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { attachRobotVisuals } from './attachRobotVisuals';
import type { URDFRobot } from 'urdf-loader';

interface RobotModelProps {
  /** URDF XML content. When null/empty the robot is cleared. */
  urdfContent: string | null;
  /** Base URL for mesh downloads (default: /api/robot/urdf/mesh) */
  meshBasePath?: string;
}

export function RobotModel({
  urdfContent,
  meshBasePath = '/api/robot/urdf/mesh',
}: RobotModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const robotRef = useRef<URDFRobot | null>(null);
  const robotState = useRobotStateStore((s) => s.robotState);

  // ── Load / reload the URDF model ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let loaded: URDFRobot | null = null;
    let cleanupVisuals: (() => void) | undefined;

    async function loadModel() {
      if (!urdfContent) return;

      try {
        const { robot } = await parseUrdf(urdfContent, meshBasePath);

        if (cancelled) {
          disposeRobot(robot);
          return;
        }

        if (groupRef.current) {
          loaded = robot;
          groupRef.current.add(robot);
          robotRef.current = robot;
          cleanupVisuals = attachRobotVisuals(robot);
        } else {
          disposeRobot(robot);
        }
      } catch (error) {
        console.error('Failed to load URDF model:', error);
      }
    }

    loadModel();

    return () => {
      cancelled = true;
      cleanupVisuals?.();
      loaded?.removeFromParent();
      disposeRobot(loaded);
      if (robotRef.current === loaded) robotRef.current = null;
    };
  }, [urdfContent, meshBasePath]);

  // ── Per-frame joint update ──────────────────────────────────
  useFrame(() => {
    const robot = robotRef.current;
    if (!robot || !robotState) return;

    if (robotState.joint_states?.length) {
      const jointValues: Record<string, number> = {};
      for (const js of robotState.joint_states) {
        jointValues[js.name] = js.position;
      }
      robot.setJointValues(jointValues);
    }
  });

  return <group ref={groupRef} />;
}

function disposeRobot(robot: URDFRobot | null): void {
  if (!robot) return;
  robot.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const m of materials) {
        m.dispose();
      }
    }
  });
}
