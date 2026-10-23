import { useEffect, useRef, useState } from 'react';
import { Alert, Button, InputNumber, message } from 'antd';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useUnits } from '@/stores/unitStore';
import { useT } from '@/i18n/useT';
import { TeachCard } from './TeachCard';

export function ToolPayloadPanel({ allowed }: { allowed: boolean }) {
  const t = useT();
  const units = useUnits();
  const { isConnected, host, port, controlToken } = useConnectionStore();
  const [mass, setMass] = useState<number | null>(null);
  const [com, setCom] = useState<(number | null)[]>([null, null, null]);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setMass(null); setCom([null, null, null]); setValid(false); setError(''); setBusy(false);
    if (isConnected) {
      setBusy(true);
      void new RobotApiClient(host, port).getLoadParameters(controller.signal).then((data) => {
        if (controller.signal.aborted) return;
        if (!Number.isFinite(data.mass) || !Array.isArray(data.com) || data.com.length !== 3 || !data.com.every(Number.isFinite)) throw new Error('Invalid payload response');
        setMass(data.mass); setCom(data.com); setValid(data.valid);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }
    return () => controller.abort();
  }, [isConnected, host, port, controlToken]);

  const save = async () => {
    const signal = request.current?.signal;
    if (!signal || signal.aborted || !allowed || busy || mass === null || com.some((v) => v === null)) return;
    const client = new RobotApiClient(host, port);
    let updated = false;
    setBusy(true); setError('');
    try {
      await client.setLoadParameters(mass, com as number[], signal);
      updated = true;
      if (signal.aborted) return;
      await client.saveLoadParameters(signal);
      if (!signal.aborted) { setValid(true); message.success(t('tools.payloadSaved')); }
    } catch (cause) {
      if (!signal.aborted) setError((updated ? `${t('tools.payloadPartial')} ` : '') + (cause instanceof Error ? cause.message : String(cause)));
    } finally { if (!signal.aborted) setBusy(false); }
  };
  return <TeachCard title={t('teach.payload')}>
    <p className="teach-muted">{t('tools.payloadHint')}</p>
    {error && <Alert type="error" showIcon message={error} />}
    {isConnected && !valid && <p className="teach-muted">{t('tools.payloadUnset')}</p>}
    <div className="teach-tool-calibration-controls">
      <label>{t('teach.payload')}<InputNumber aria-label={t('teach.payload')} addonAfter={units.mass.label} min={0} value={mass === null ? null : mass * units.mass.factor} disabled={!allowed || busy} onChange={(value) => setMass(value === null ? null : value / units.mass.factor)} /></label>
      {['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{t('tools.com')} {axis}<InputNumber aria-label={`${t('tools.com')} ${axis}`} addonAfter={units.length.label} value={com[i] === null ? null : com[i]! * units.length.factor} disabled={!allowed || busy} onChange={(value) => setCom((old) => old.map((v, j) => i === j ? value === null ? null : value / units.length.factor : v))} /></label>)}
      <Button type="primary" loading={busy} disabled={!allowed || busy || mass === null || mass < 0 || !Number.isFinite(mass) || com.some((v) => v === null || !Number.isFinite(v))} onClick={() => void save()}>{t('tools.savePayload')}</Button>
    </div>
  </TeachCard>;
}
