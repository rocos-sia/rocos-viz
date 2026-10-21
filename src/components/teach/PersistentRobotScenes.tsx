import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RobotOverviewScene } from './RobotOverview';
import { Robot3DCardScene } from './Robot3DCard';
import { SceneSlotContext, type SceneSlotName } from './SceneSlot';

export function PersistentRobotScenes({ urdfContent, children }: { urdfContent: string | null; children: ReactNode }) {
  const parking = useRef<HTMLDivElement>(null);
  const [hosts] = useState(() => Object.fromEntries((['overview', 'workspace'] as const).map((name) => {
    const host = document.createElement('div');
    host.style.display = 'contents';
    return [name, host];
  })) as Record<SceneSlotName, HTMLDivElement>);
  const [active, setActive] = useState<Partial<Record<SceneSlotName, boolean>>>({});
  const attach = useCallback((name: SceneSlotName, target: HTMLDivElement) => {
    target.appendChild(hosts[name]);
    setActive((state) => ({ ...state, [name]: true }));
    return () => {
      if (hosts[name].parentNode !== target) return;
      parking.current?.appendChild(hosts[name]);
      setActive((state) => ({ ...state, [name]: false }));
    };
  }, [hosts]);
  return <SceneSlotContext.Provider value={attach}>
    {children}
    <div ref={parking} style={{ display: 'none' }} aria-hidden="true" />
    {active.overview !== undefined && createPortal(
      <RobotOverviewScene urdfContent={urdfContent} active={!!active.overview} />, hosts.overview)}
    {active.workspace !== undefined && createPortal(
      <Robot3DCardScene urdfContent={urdfContent} active={!!active.workspace} />, hosts.workspace)}
  </SceneSlotContext.Provider>;
}
