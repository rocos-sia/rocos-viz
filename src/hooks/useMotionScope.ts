import { useEffect, useRef, useState } from 'react';
import { animate, createScope } from 'animejs';
import { useTeachStore } from '@/stores/teachStore';

export function useMotionScope(key: string) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useTeachStore((s) => s.reducedMotion);
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!root.current || reduced || systemReduced) return;
    const scope = createScope({ root }).add(() => {
      animate('[data-motion]', { opacity: [0.6, 1], duration: 180, ease: 'out(3)' });
    });
    return () => scope.revert();
  }, [key, reduced, systemReduced]);
  return root;
}
