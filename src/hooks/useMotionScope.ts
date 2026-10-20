import { useEffect, useRef } from 'react';
import { animate, createScope } from 'animejs';
import { useReducedMotion } from './useReducedMotion';

export function useMotionScope(key: string) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!root.current || reduced) return;
    const scope = createScope({ root }).add(() => {
      animate('[data-motion]', { opacity: [0.6, 1], duration: 180, ease: 'out(3)' });
    });
    return () => scope.revert();
  }, [key, reduced]);
  return root;
}
