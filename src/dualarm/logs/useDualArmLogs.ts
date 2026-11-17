import { useCallback, useEffect, useRef, useState } from 'react';
import { appendEvents, DualArmLogClient, parseEvent, parseGap, type DualArmLog, type LogGap } from './client';
export type LogStatus = 'disconnected' | 'connecting' | 'live' | 'reconnecting' | 'failed';
// Own this once at the dual-arm entry point, not once per arm or per log tab.
export function useDualArmLogs() {
  const [events, setEvents] = useState<DualArmLog[]>([]);
  const [status, setStatus] = useState<LogStatus>('disconnected');
  const [gap, setGap] = useState<LogGap | null>(null);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [updated, setUpdated] = useState('');
  const generation = useRef(0), stream = useRef<EventSource | null>(null), pending = useRef<AbortController | null>(null);
  const dispose = useCallback(() => {
    ++generation.current;
    pending.current?.abort(); pending.current = null;
    stream.current?.close(); stream.current = null;
  }, []);
  const disconnect = useCallback(() => { dispose(); setStatus('disconnected'); }, [dispose]);
  const connect = useCallback(async (endpoint: string) => {
    dispose(); const own = generation.current;
    setError(''); setGap(null); setEvents([]); setUpdated(''); setOrigin(''); setStatus('connecting');
    try {
      const client = new DualArmLogClient(endpoint);
      setOrigin(client.origin);
      const abort = new AbortController(); pending.current = abort;
      const timeout = window.setTimeout(() => abort.abort(), 8000);
      let page;
      try { page = await client.history(abort.signal); } finally { window.clearTimeout(timeout); }
      if (own !== generation.current) return;
      setEvents(page.events); setGap(page.gap); setUpdated(new Date().toISOString());
      const source = client.stream(page.next_id); stream.current = source;
      source.onopen = () => { if (own === generation.current) { setStatus('live'); setError(''); } };
      source.onerror = () => { if (own === generation.current) setStatus(source.readyState === EventSource.CLOSED ? 'failed' : 'reconnecting'); };
      const invalid = () => { source.close(); setStatus('failed'); setError('invalid_event'); };
      source.addEventListener('log', raw => {
        if (own !== generation.current) return;
        try {
          const event = parseEvent(JSON.parse((raw as MessageEvent).data));
          setEvents(prev => appendEvents(prev, [event])); setUpdated(new Date().toISOString());
        } catch { invalid(); }
      });
      source.addEventListener('gap', raw => {
        if (own !== generation.current) return;
        try { setGap(parseGap(JSON.parse((raw as MessageEvent).data))); } catch { invalid(); }
      });
    } catch (failure) {
      if (own !== generation.current) return;
      setStatus('failed'); setError(failure instanceof Error ? failure.message : 'connection_failed');
    }
  }, [dispose]);
  useEffect(() => dispose, [dispose]);
  return { events, status, gap, error, origin, updated, connect, disconnect };
}
export type DualArmLogsState = ReturnType<typeof useDualArmLogs>;
