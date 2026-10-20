import { useEffect, useMemo, useState } from 'react';
import { readJointRanges } from '@/core/JointRange';

export function useJointRanges(xml: string | null | undefined, connected: boolean) {
  const [demo, setDemo] = useState('');
  useEffect(() => {
    if (connected) return;
    const abort = new AbortController();
    void fetch('/demo/talon/robot.urdf', { signal: abort.signal })
      .then((response) => response.ok ? response.text() : '')
      .then((text) => { if (!abort.signal.aborted) setDemo(text); })
      .catch(() => { /* The readout explicitly labels its fallback as a reference range. */ });
    return () => abort.abort();
  }, [connected]);
  return useMemo(() => readJointRanges(connected ? xml ?? '' : demo), [xml, connected, demo]);
}
