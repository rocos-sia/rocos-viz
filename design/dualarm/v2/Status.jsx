import React from 'react';
import { useT } from '../../../src/i18n/useT';

export function stateTone(state, online = true) {
  if (!online) return 'offline';
  if (/ERROR|FAULT/.test(state)) return 'fault';
  if (state === 'STOPPED') return 'ready';
  if (state === 'PAUSED') return 'paused';
  if (['RUNNING', 'JOGGING', 'SERVOING', 'RCI'].includes(state)) return 'running';
  if (['ENABLING', 'DISABLING', 'STARTING', 'STOPPING', 'PAUSING', 'RESUMING', 'RESETTING'].includes(state)) return 'transition';
  return 'idle';
}
export function StateText({ state, online = true }) {
  return <b className={`state-text state-${stateTone(state, online)}`}>{online ? state : '—'}</b>;
}
export function MotionFeedback({ motion }) {
  const t = useT();
  return <div className={`motion-feedback ${motion ? '' : 'empty'}`} aria-live="polite">
    {!motion && <><b>{t('dual.noMotion')}</b><span className="muted">{t('dual.motionHint')}</span></>}
    {motion && <><b className={`motion-phase phase-${motion.phase}`}>{motion.ended ? `${t('dual.previousMotion')} · ${new Date(motion.ended).toLocaleTimeString()} · ` : ''}{motion.kind.toUpperCase()} · {t(`dual.motion.${motion.phase}`)}</b>
      <span className="muted">{t('dual.target')}: {motion.body.joints ? `${motion.body.joints.map(value => (value * 180 / Math.PI).toFixed(2)).join(' / ')} °` : `${['x', 'y', 'z'].map(axis => (motion.body.pose.position[axis] * 1000).toFixed(2)).join(' / ')} mm`}</span>
      {motion.error && <span>{t('dual.maxError')}: {motion.error.joint !== undefined ? `${(motion.error.joint * 180 / Math.PI).toFixed(3)} °` : `${(motion.error.position * 1000).toFixed(3)} mm · ${(motion.error.angle * 180 / Math.PI).toFixed(3)} °`}</span>}
    </>}
  </div>;
}
