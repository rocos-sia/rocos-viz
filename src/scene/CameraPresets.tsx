import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

const CAMERA_PRESETS = {
  axonometric: { position: [1.6, -1.6, 1.5] as [number, number, number], target: [0, 0, 0.5] as [number, number, number] },
  top: { position: [0, 0, 2.8] as [number, number, number], target: [0, 0, 0.5] as [number, number, number] },
  front: { position: [0, -2.5, 0.5] as [number, number, number], target: [0, 0, 0.5] as [number, number, number] },
  right: { position: [2.5, 0, 0.5] as [number, number, number], target: [0, 0, 0.5] as [number, number, number] },
};

type CameraPresetKey = keyof typeof CAMERA_PRESETS;

let onPresetChange: ((key: CameraPresetKey) => void) | null = null;

export function setCameraPreset(key: CameraPresetKey) {
  onPresetChange?.(key);
}

export function CameraPresets() {
  const { camera } = useThree();
  useEffect(() => {
    onPresetChange = (key) => {
      const preset = CAMERA_PRESETS[key];
      camera.position.set(...preset.position);
      camera.lookAt(...preset.target);
      camera.updateProjectionMatrix();
    };
    return () => { onPresetChange = null; };
  }, [camera]);
  return null;
}
