import { useCompactScreen } from '@/hooks/useCompactScreen';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Popconfirm, Tabs, message } from 'antd';
import { DownloadOutlined, ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useTeachStore, demoPrograms } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { downloadText } from '@/core/downloadText';

const BlockEditor = lazy(() => import('./BlockEditor').then((m) => ({ default: m.BlockEditor })));

function LuaEditor() {
  const element = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>();
  const source = useTeachStore((s) => s.source);
  const setSource = useTeachStore((s) => s.setSource);
  useEffect(() => {
    if (!element.current) return;
    const view = new EditorView({
      parent: element.current,
      doc: useTeachStore.getState().source,
      extensions: [
        basicSetup, StreamLanguage.define(lua), EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontFamily: 'AlibabaPuHuiTi', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text)' },
          '.cm-scroller': { fontFamily: 'AlibabaPuHuiTi', overflow: 'auto' },
          '.cm-content': { padding: '20px 0', fontFamily: 'AlibabaPuHuiTi' },
          '.cm-gutters': { backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', border: 'none', fontFamily: 'AlibabaPuHuiTi' },
          '.cm-activeLine': { backgroundColor: 'var(--teach-selected)' },
        }),
        EditorView.updateListener.of((update) => { if (update.docChanged) setSource(update.state.doc.toString()); }),
      ],
    });
    editor.current = view;
    return () => { view.destroy(); editor.current = undefined; };
  }, [setSource]);
  useEffect(() => {
    const view = editor.current;
    if (view && source !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
  }, [source]);
  return <div className="teach-code-editor" ref={element} />;
}

export function Programming() {
  const t = useT();
  const compact = useCompactScreen();
  const connected = useConnectionStore((s) => s.isConnected);
  const token = useConnectionStore((s) => s.controlToken);
  const enabled = useConnectionStore((s) => s.isRobotEnabled);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const robotStatus = useRobotStateStore((s) => s.robotState?.robot_state);
  const [files, setFiles] = useState<string[]>([]);
  const [filename, setFilename] = useState('program.lua');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState('lua');
  const source = useTeachStore((s) => s.source);
  const refresh = async () => {
    if (!connected) return;
    try { const result = await new RobotApiClient(host, port).listScripts(); setFiles(result.scripts); setError(''); }
    catch (e) { setError(String(e)); }
  };
  useEffect(() => {
    let cancelled = false;
    setFiles([]); setError('');
    if (connected) new RobotApiClient(host, port).listScripts().then((result) => { if (!cancelled) setFiles(result.scripts); }).catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [connected, host, port]);
  const open = async (name: string) => {
    setFilename(name); setActive('lua');
    if (!connected) {
      useTeachStore.getState().setSource(`-- ${name}\n-- PREVIEW ONLY: sample program.\nfunction main()\n  -- Move to P002\n  -- Wait for DI 00\n  -- Set DO 01\nend\n`);
      return;
    }
    setBusy(true);
    try { useTeachStore.getState().setSource(await new RobotApiClient(host, port).downloadScript(name)); }
    catch (e) { message.error(String(e)); }
    finally { setBusy(false); }
  };
  const command = async (action: 'upload' | 'run' | 'pause' | 'resume' | 'stop' | 'step') => {
    if (!connected || !token || (compact && action !== 'stop' && action !== 'pause')) return;
    setBusy(true);
    try {
      const client = new RobotApiClient(host, port);
      if (action === 'run' || action === 'upload') await client.uploadScript(filename, source);
      if (action === 'run') await client.runScript();
      if (action === 'pause') await client.pauseScript();
      if (action === 'resume') await client.resumeScript();
      if (action === 'stop') await client.stopScript();
      if (action === 'step') await client.stepScript();
      message.success(t('common.sent', { cmd: action }));
    } catch (e) { message.error(String(e)); }
    finally { setBusy(false); }
  };
  const canUpload = !compact && connected && !!token && !!filename.trim() && !!source.trim() && !source.includes('PREVIEW ONLY') && !busy;
  return <div className="teach-programming" data-motion>
    <TeachCard title={t('teach.programLibrary')} extra={connected ? <Button icon={<ReloadOutlined />} aria-label={t('teach.refresh')} onClick={() => void refresh()} /> : <DemoBadge />}>
      {error && <Alert type="error" message={t('teach.loadFailed')} description={error} />}
      <div className="teach-file-list">{(connected ? files : demoPrograms.map((p) => p.name)).map((name) => <Button type={filename === name ? 'primary' : 'text'} key={name} onClick={() => void open(name)}>{name}</Button>)}</div>
      <Button block onClick={() => { setFilename('program.lua'); useTeachStore.getState().setSource('-- ROCOS Teach\nfunction main()\nend\n'); }}>{t('teach.newProgram')}</Button>
      <p className="teach-muted">{t('teach.draft')}</p>
    </TeachCard>
    <TeachCard title={t('teach.programming')} extra={<span className="teach-muted">{t('teach.scriptState')}: {connected ? robotStatus ?? '—' : t('teach.offline')}</span>}>
      <Tabs className="teach-fill-tabs" activeKey={active} onChange={setActive} destroyInactiveTabPane items={[
        { key: 'lua', label: t('teach.luaEditor'), children: <>
          <div className="teach-editor-toolbar"><Input aria-label={t('teach.name')} value={filename} onChange={(e) => setFilename(e.target.value)} />
            <Button icon={<DownloadOutlined />} onClick={() => downloadText(filename || 'program.lua', source)}>{t('teach.download')}</Button>
            <Button disabled={!canUpload} loading={busy} onClick={() => void command('upload')}>{t('teach.upload')}</Button>
            <Popconfirm title={t('teach.runConfirm')} onConfirm={() => command('run')}><Button type="primary" icon={<PlayCircleOutlined />} disabled={!canUpload || !enabled}>{t('teach.runScript')}</Button></Popconfirm>
          </div><LuaEditor /><div className="teach-button-row">
            <Button disabled={!connected || !token || busy} onClick={() => void command('pause')}>{t('teach.pause')}</Button>
            <Button disabled={compact || !connected || !token || busy || !enabled} onClick={() => void command('resume')}>{t('teach.resume')}</Button>
            <Button disabled={compact || !connected || !token || busy || !enabled} onClick={() => void command('step')}>{t('teach.singleStep')}</Button>
            <Button danger disabled={!connected || !token} onClick={() => void command('stop')}>{t('teach.softwareStop')}</Button>
          </div>
        </> },
        { key: 'blocks', label: <>{t('teach.blocks')} <DemoBadge /></>, children: <Suspense fallback={<div>…</div>}><BlockEditor /></Suspense> },
      ]} />
    </TeachCard>
  </div>;
}
