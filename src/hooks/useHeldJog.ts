import { useCallback, useEffect, useRef, useState } from 'react';
import type { ButtonProps } from 'antd';
import { message } from 'antd';
import { startHeldJog } from '@/core/HeldJog';
import { RobotApiClient } from '@/core/RobotApiClient';
import { JOG_FEED_INTERVAL_MS } from '@/core/constants';
import { useConnectionStore } from '@/stores/connectionStore';
import { useControlStore } from '@/stores/controlStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useT } from '@/i18n/useT';

export function useHeldJog(feed: (client: RobotApiClient, sign: number) => Promise<unknown>) {
  const t = useT();
  const connected = useConnectionStore((s) => s.isConnected);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const token = useConnectionStore((s) => s.controlToken);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const frame = useControlStore((s) => s.currentFrame);
  const speed = useControlStore((s) => s.speedFactor);
  const mode = useRobotStateStore((s) => s.robotState?.work_mode);
  const [small, setSmall] = useState(() => matchMedia('(max-width: 599px)').matches);
  const cancel = useRef<(() => void) | null>(null);
  const stop = useCallback(() => { cancel.current?.(); cancel.current = null; }, []);
  const allowed = connected && enabled && !!token && !small;
  useEffect(() => {
    const query = matchMedia('(max-width: 599px)');
    const resize = () => setSmall(query.matches);
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [stop]);
  useEffect(() => stop, [allowed, token, host, port, frame, speed, mode, stop]);
  const start = (sign: number) => {
    if (!allowed || cancel.current) return;
    const client = new RobotApiClient(host, port);
    cancel.current = startHeldJog({
      feed: () => feed(client, sign),
      stop: () => client.jogStop(),
      intervalMs: JOG_FEED_INTERVAL_MS,
      onError: () => { message.error(t('teach.jogFailed')); },
    });
  };
  const bind = (sign: number): ButtonProps => ({
    disabled: !allowed,
    onPointerDown: (e) => { if (e.button !== 0 || !e.isPrimary) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start(sign); },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onBlur: stop,
    onKeyDown: (e) => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) start(sign); } },
    onKeyUp: (e) => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); stop(); } },
  });
  return { bind, allowed };
}
