import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/useT';
import { DualArmLogClient, type ArmScope } from './client';
import type { DualArmLogsState } from './useDualArmLogs';
import './logConsole.css';
import { diagnosticsAddress } from './address';
const time = (timestamp: string) => { const date = new Date(timestamp); return Number.isNaN(+date) ? timestamp : `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`; };
export default function LogConsole({ logs, initialScope = 'all' }: { logs: DualArmLogsState; initialScope?: ArmScope | 'all' }) {
  const t = useT();
  const [endpoint, setEndpoint] = useState(diagnosticsAddress);
  const [tab, setTab] = useState<'alerts' | 'feedback' | 'file'>('alerts');
  const [scope, setScope] = useState<ArmScope | 'all'>(initialScope), [level, setLevel] = useState('all'), [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ text: string; timestamp: string; truncated: boolean } | null>(null);
  const [fileError, setFileError] = useState(''), [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); request.current = null; setPreview(null); setFileError(''); setLoading(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [logs.origin]);
  const connect = () => { try { localStorage.setItem('rocos.dualarm.diagnostics', new DualArmLogClient(endpoint).origin); } catch { /* Preference is optional. */ } void logs.connect(endpoint); };
  const loadFile = async () => {
    if (!logs.origin) return;
    request.current?.abort(); const abort = new AbortController(); request.current = abort;
    setLoading(true); setFileError(''); setPreview(null);
    const timeout = window.setTimeout(() => abort.abort(), 15000);
    try { const result = await new DualArmLogClient(logs.origin).preview(abort.signal); if (request.current === abort) setPreview(result); }
    catch (error) { if (request.current === abort) setFileError(error instanceof Error ? error.message : 'file_failed'); }
    finally { window.clearTimeout(timeout); if (request.current === abort) setLoading(false); }
  };
  const needle = search.toLocaleLowerCase();
  const filtered = logs.events.filter(e => (tab !== 'alerts' || e.level !== 'info') && (scope === 'all' || e.arm === scope) && (level === 'all' || e.level === level) &&
    [e.message, e.module, e.code, e.operation?.name, e.operation?.request_id].join(' ').toLocaleLowerCase().includes(needle)).reverse();
  const active = ['connecting', 'live', 'reconnecting'].includes(logs.status);
  return <section className="dual-log-console" aria-label={t('dualLogs.title')}>
    <div className={`dual-log-connect ${active ? 'connected' : ''}`}><label className="field"><span>{t('dualLogs.endpoint')}</span><input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} disabled={active} spellCheck={false}/></label>
      <button onClick={active ? logs.disconnect : connect}>{t(active ? 'dualLogs.disconnect' : logs.status === 'failed' ? 'dualLogs.retry' : 'dualLogs.connect')}</button>
      <span className={`state ${logs.status === 'live' ? 'good' : ''}`} role="status">{t(`dualLogs.${logs.status}`)}</span>
      <span className="dual-log-origin muted small">{logs.origin}</span><span className="muted small">{t('dualLogs.last')} · {logs.updated ? time(logs.updated) : '—'}</span></div>
    <p className="muted dual-log-hint dual-log-connection-hint">{t('dualLogs.hint')}</p>
    {logs.status === 'failed' && <p className="error-note" role="alert">{t('dualLogs.error')} <span>{logs.error}</span></p>}
    {logs.gap && <p className="inline-hint" role="status">{t(`dualLogs.gap.${logs.gap.reason}`)} {logs.gap.count != null && `(${logs.gap.count})`}</p>}
    <div className="tabs">{(['alerts', 'feedback', 'file'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setLevel('all'); }}>{t(`dualLogs.${value}`)}</button>)}</div>
    {tab === 'file' ? <div className="dual-log-file"><p className="muted">{t('dualLogs.fileHint')}</p><div className="button-row">
      <button disabled={!logs.origin || loading} onClick={() => void loadFile()}>{t(loading ? 'dualLogs.loading' : 'dualLogs.preview')}</button>
      {logs.origin && <a className="button" href={new DualArmLogClient(logs.origin).fileUrl} target="_blank" rel="noreferrer" download>{t('dualLogs.download')}</a>}
      {preview?.timestamp && <span className="muted small">{t('dualLogs.snapshot')} · {preview.timestamp}</span>}</div>
      {fileError && <p role="alert" className="error-note">{t('dualLogs.error')} {fileError}</p>}
      {preview?.truncated && <p className="inline-hint">{t('dualLogs.truncated')}</p>}
      <pre aria-label={t('dualLogs.file')}>{preview ? preview.text || t('logs.file.empty') : t(logs.origin ? 'dualLogs.fileEmpty' : 'dualLogs.noSource')}</pre></div> : <>
      <div className="dual-log-filters"><label className="field"><span className="sr-only">{t('dualLogs.source')}</span><select value={scope} onChange={e => setScope(e.target.value as ArmScope | 'all')}>{(['all', 'left', 'right', 'process'] as const).map(s => <option value={s} key={s}>{t(`dualLogs.${s}`)}</option>)}</select></label>
        <label className="field"><span className="sr-only">{t('dualLogs.levels')}</span><select value={level} onChange={e => setLevel(e.target.value)}><option value="all">{t('dualLogs.levels')}</option>{(tab === 'alerts' ? ['warn', 'error', 'critical'] : ['info', 'warn', 'error', 'critical']).map(l => <option key={l}>{l}</option>)}</select></label>
        <input type="search" aria-label={t('dualLogs.search')} placeholder={t('dualLogs.search')} value={search} onChange={e => setSearch(e.target.value)}/></div>
      {tab === 'feedback' && <p className="muted dual-log-hint">{t('dualLogs.feedbackHint')}</p>}
      <div className="dual-log-table"><div className="dual-log-head"><span>{t('dualLogs.time')}</span><span>{t('dualLogs.source')}</span><span>{t('dualLogs.detail')}</span></div>
      {filtered.length === 0 ? <p className="dual-log-empty">{t(logs.status === 'disconnected' && logs.events.length === 0 ? 'dualLogs.connectHint' : 'dualLogs.empty')}</p> : filtered.map(e => <article className="dual-log-row" key={e.id}>
        <time className="num" dateTime={e.timestamp} title={e.timestamp}>{time(e.timestamp)}</time><div className="dual-log-source"><b>{e.arm !== 'process' && <i className={`arm-dot ${e.arm}`}/ >}{t(`dualLogs.${e.arm}`)}</b><small className="muted">{e.ecat_id === null ? '—' : `ecat ${e.ecat_id}`}</small></div>
        <div className="dual-log-message"><div className="dual-log-meta"><span className={`dual-log-level ${e.level}`}>{e.level}</span><span>{e.module}</span>{e.code !== null && <span>code {e.code}</span>}{e.operation && <span>{t(`dualLogs.${e.operation.outcome}`)}</span>}</div><p>{e.message}</p>
        {e.operation && <details><summary>{t('dualLogs.details')}</summary><dl><dt>request_id</dt><dd>{e.operation.request_id}</dd><dt>HTTP</dt><dd>{e.operation.http_status} · {e.operation.duration_ms.toFixed(2)} ms</dd><dt>device_id</dt><dd>{e.device_id || '—'}</dd></dl></details>}</div></article>)}</div>
      <p className="dual-log-hint muted small">{filtered.length} / {logs.events.length} · {t('dualLogs.capacity')}</p></>}
  </section>;
}
