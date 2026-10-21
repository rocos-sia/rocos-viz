import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { acquireControllerModel } from '@/core/ControllerModelCache';
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

  // ── Load / reload the URDF model ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let loaded: URDFRobot | null = null;
    let releaseModel: (() => void) | undefined;
    let cleanupVisuals: (() => void) | undefined;

    async function loadModel() {
      if (!urdfContent) return;

      try {
        const resource = await acquireControllerModel(urdfContent, meshBasePath);
        const { robot } = resource;

        if (cancelled) {
          resource.release();
          return;
        }

        if (groupRef.current) {
          loaded = robot;
          releaseModel = resource.release;
          groupRef.current.add(robot);
          robotRef.current = robot;
          cleanupVisuals = attachRobotVisuals(robot);
        } else {
          resource.release();
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
      releaseModel?.();
      if (robotRef.current === loaded) robotRef.current = null;
    };
  }, [urdfContent, meshBasePath]);

  // ── Per-frame joint update ──────────────────────────────────
  useFrame(() => {
    const robot = robotRef.current;
    const robotState = useRobotStateStore.getState().robotState;
    if (!robot || !robotState) return;

    if (robotState.joint_states?.length) {
      const jointValues: Record<string, number> = {};
      for (const js of robotState.joint_states) {
        jointValues[js.name] = js.position;
      }
      robot.setJointValues(jointValues);
    }
  });

  return <group ref={groupRef} dispose={null} />;
}
