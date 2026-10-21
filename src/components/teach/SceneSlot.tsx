import { createContext, useContext, useLayoutEffect, useRef } from 'react';

export type SceneSlotName = 'overview' | 'workspace';
export const SceneSlotContext = createContext<((name: SceneSlotName, target: HTMLDivElement) => () => void) | null>(null);

/** Only the DOM destination changes; the portal and its WebGL renderer stay mounted. */
export function SceneSlot({ name }: { name: SceneSlotName }) {
  const attach = useContext(SceneSlotContext);
  const target = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (attach && target.current) return attach(name, target.current);
  }, [attach, name]);
  return <div ref={target} style={{ display: 'contents' }} />;
}
