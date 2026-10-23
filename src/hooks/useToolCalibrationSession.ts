import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useToolCalibrationStore } from '@/stores/toolCalibrationStore';

export function useToolCalibrationSession() {
  const { isConnected, host, port, controlToken } = useConnectionStore();
  useEffect(() => {
    const controllerKey = isConnected ? JSON.stringify([host, port, controlToken]) : '';
    if (useToolCalibrationStore.getState().controllerKey !== controllerKey) {
      useToolCalibrationStore.setState({ controllerKey, session: null, name: 'TCP_01', tolerance: 0.001 });
    }
  }, [isConnected, host, port, controlToken]);
}
