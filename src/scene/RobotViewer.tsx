import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useUIStore } from '@/stores/uiStore';
import { SceneHelpers } from './SceneHelpers';
import { CameraPresets } from './CameraPresets';
import * as THREE from 'three';

interface RobotViewerProps {
  children?: React.ReactNode;
}

/** Probe whether the browser can actually create a WebGL context. */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export function RobotViewer({ children }: RobotViewerProps) {
  const showGround = useUIStore((s) => s.showGround);
  const isLight = useUIStore((s) => s.themeMode === 'light');

  // Throw a clear, actionable error (caught by SceneErrorBoundary) instead of
  // letting @react-three/fiber crash with an opaque internal failure when the
  // client machine has no working WebGL (no GPU acceleration, VM, old driver…).
  if (!isWebGLAvailable()) {
    throw new Error('WebGL is not available in this browser/device.');
  }

  return (
    <Canvas
      camera={{
        position: [1.6, -1.6, 1.5],
        fov: 50,
        near: 0.01,
        far: 1000,
        up: [0, 0, 1],
      }}
      // Track container size with no debounce so the canvas re-syncs its drawing
      // buffer and camera aspect immediately while the right panel is dragged.
      // The default debounce leaves the scene stretched until the drag settles.
      resize={{ scroll: false, debounce: 0 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: isLight ? 1.0 : 1.2,
        failIfMajorPerformanceCaveat: false,
      }}
      shadows={isLight ? { type: THREE.PCFSoftShadowMap } : undefined}
      style={{
        width: '100%',
        height: '100%',
        background: isLight ? '#f8f9fa' : '#111318',
      }}
    >
      <color attach="background" args={[isLight ? '#f8f9fa' : '#111318']} />
      <SceneHelpers showGround={showGround} />
      <OrbitControls
        makeDefault
        target={[0, 0, 0.5]}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.5}
        maxDistance={50}
      />
      <CameraPresets />
      {children}
    </Canvas>
  );
}
