import { useEffect, useState } from 'react';
import { useTeachStore } from '@/stores/teachStore';

export function useReducedMotion() {
  const reduced = useTeachStore((s) => s.reducedMotion);
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced || systemReduced;
}
