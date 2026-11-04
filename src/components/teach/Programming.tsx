import { useCompactScreen } from '@/hooks/useCompactScreen';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Popconfirm, Tabs, message } from 'antd';
import { DownloadOutlined, ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { basicSetup } from 'codemirror';
import { Decoration, EditorView, gutter, GutterMarker, keymap } from '@codemirror/view';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useConnectionStore } from '@/stores/connectionStore';
import type { ScriptStatus } from '@/core/types';
import { useTeachStore, demoPrograms } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { downloadText } from '@/core/downloadText';

const BlockEditor = lazy(() => import('./BlockEditor').then((m) => ({ default: m.BlockEditor })));

class BreakpointMarker extends GutterMarker {
  toDOM() { const marker = document.createElement('span'); marker.textContent = '●'; return marker; }
}
const breakpointMarker = new BreakpointMarker();

function LuaEditor({ breakpoints, currentLine, readOnly, canDebug, onToggleBreakpoint }: {
  breakpoints: number[];
  currentLine: number;
  readOnly: boolean;
  canDebug: boolean;
  onToggleBreakpoint: (line: number) => void;
}) {
  const t = useT();
  const element = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>();
  const debug = useRef(new Compartment());
  const toggleBreakpoint = useRef(onToggleBreakpoint);
  toggleBreakpoint.current = onToggleBreakpoint;
  const source = useTeachStore((s) => s.source);
  const setSource = useTeachStore((s) => s.setSource);
  useEffect(() => {
    if (!element.current) return;
    const view = new EditorView({
      parent: element.current,
      doc: useTeachStore.getState().source,
      extensions: [
        basicSetup, StreamLanguage.define(lua), EditorView.lineWrapping,
        debug.current.of([]),
        EditorView.theme({
          '&': { height: '100%', fontSize: 'var(--font-body)', lineHeight: '1.5', fontFamily: 'AlibabaPuHuiTi', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text)' },
          '.cm-scroller': { fontFamily: 'AlibabaPuHuiTi', overflow: 'auto' },
          '.cm-content': { padding: '20px 0', fontFamily: 'AlibabaPuHuiTi' },
          '.cm-gutters': { backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', border: 'none', fontFamily: 'AlibabaPuHuiTi' },
          '.cm-activeLine': { backgroundColor: 'var(--teach-selected)' },
          '.cm-breakpoints': { width: '20px', color: 'var(--teach-danger)', cursor: 'pointer' },
          '.cm-breakpoints .cm-gutterElement': { textAlign: 'center' },
          '.cm-executionLine': { backgroundColor: 'var(--teach-warning-bg)', boxShadow: 'inset 3px 0 var(--teach-warning)' },
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
  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    view.dispatch({ effects: debug.current.reconfigure([
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ 'aria-label': t('teach.luaEditor'), tabindex: '0' }),
      Prec.high(gutter({
        class: 'cm-breakpoints',
        renderEmptyElements: true,
        initialSpacer: () => breakpointMarker,
        lineMarker: (editor, block) => breakpoints.includes(editor.state.doc.lineAt(block.from).number) ? breakpointMarker : null,
        domEventHandlers: { mousedown: (editor, block) => {
          if (canDebug) toggleBreakpoint.current(editor.state.doc.lineAt(block.from).number);
          return true;
        } },
      })),
      keymap.of([{ key: 'F9', run: (editor) => {
        if (canDebug) toggleBreakpoint.current(editor.state.doc.lineAt(editor.state.selection.main.head).number);
        return true;
      } }]),
      EditorView.decorations.of((editor) => currentLine > 0 && currentLine <= editor.state.doc.lines
        ? Decoration.set([Decoration.line({ class: 'cm-executionLine' }).range(editor.state.doc.line(currentLine).from)]) : Decoration.none),
    ]) });
  }, [breakpoints, currentLine, readOnly, canDebug, source, t]);
  useEffect(() => {
    const view = editor.current;
    if (view && currentLine > 0 && currentLine <= view.state.doc.lines) {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(currentLine).from, { y: 'nearest' }) });
    }
  }, [currentLine]);
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
  const [status, setStatus] = useState<ScriptStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const statusRequest = useRef(0);
  const statusController = useRef<AbortController>();
  const [files, setFiles] = useState<string[]>([]);
  const [filename, setFilename] = useState('program.lua');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState('lua');
  const source = useTeachStore((s) => s.source);
  const refreshStatus = useCallback(async (signal: AbortSignal) => {
    const request = ++statusRequest.current;
    try {
      const result = await new RobotApiClient(host, port).getScriptStatus(signal);
      if (!signal.aborted && request === statusRequest.current) { setStatus(result); setStatusError(''); }
    } catch (e) {
      if (!signal.aborted && request === statusRequest.current) { setStatus(null); setStatusError(String(e)); }
    }
  }, [host, port]);
  useEffect(() => {
    const controller = new AbortController();
    statusController.current = controller;
    setStatus(null); setStatusError(''); setBusy(false);
    if (!connected) return () => controller.abort();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refreshStatus(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 300);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connected, refreshStatus]);
  const executing = !!status && ['RUNNING', 'PAUSING', 'PAUSED', 'STOPPING'].includes(status.state);
  const sameFile = status?.filename === filename;
  const paused = status?.state === 'PAUSED' && sameFile;
  const breakpoints = status?.breakpoints?.filter((point) => point.filename === filename).map((point) => point.line) ?? [];
  const currentLine = executing && sameFile ? status.line : 0;
  const canDebug = !compact && connected && !!token && !!status && !!filename.trim() && !busy;
  const toggleBreakpoint = async (line: number) => {
    if (!canDebug) return;
    const controller = statusController.current!;
    setBusy(true);
    try {
      const client = new RobotApiClient(host, port);
      if (breakpoints.includes(line)) await client.removeScriptBreakpoint(filename, line);
      else await client.addScriptBreakpoint(filename, line);
      await refreshStatus(controller.signal);
    } catch (e) { if (!controller.signal.aborted) message.error(String(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
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
    const controller = statusController.current!;
    try {
      const client = new RobotApiClient(host, port);
      if (action === 'run' || action === 'upload' || (action === 'step' && !paused)) await client.uploadScript(filename, source);
      if (action === 'run') await client.runScript();
      if (action === 'pause') await client.pauseScript();
      if (action === 'resume') await client.resumeScript();
      if (action === 'stop') await client.stopScript();
      if (action === 'step') await client.stepScript();
      await refreshStatus(controller.signal);
      if (!controller.signal.aborted) message.success(t('common.sent', { cmd: action }));
    } catch (e) { if (!controller.signal.aborted) message.error(String(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const canUpload = canDebug && !executing && !!source.trim() && !source.includes('PREVIEW ONLY');
  const stepButton = <Button disabled={!canDebug || !enabled || (executing ? !paused : !canUpload)} onClick={paused ? () => void command('step') : undefined}>{t('teach.singleStep')}</Button>;
  return <div className="teach-programming" data-motion>
    <TeachCard title={t('teach.programLibrary')} extra={connected ? <Button icon={<ReloadOutlined />} aria-label={t('teach.refresh')} onClick={() => void refresh()} /> : <DemoBadge />}>
      {error && <Alert type="error" message={t('teach.loadFailed')} description={error} />}
      <div className="teach-file-list">{(connected ? files : demoPrograms.map((p) => p.name)).map((name) => <Button type={filename === name ? 'primary' : 'text'} key={name} onClick={() => void open(name)}>{name}</Button>)}</div>
      <Button block onClick={() => { setFilename('program.lua'); useTeachStore.getState().setSource('-- ROCOS HMI\nfunction main()\nend\n'); }}>{t('teach.newProgram')}</Button>
      <p className="teach-muted">{t('teach.draft')}</p>
    </TeachCard>
    <TeachCard title={t('teach.programming')} extra={<span className="teach-muted">{t('teach.scriptState')}: {connected ? status?.state ?? '—' : t('teach.offline')}{executing && ` · ${status.filename}:${status.line}`}</span>}>
      {(statusError || status?.error) && <Alert type="error" message={t('teach.loadFailed')} description={statusError || status?.error} />}
      <Tabs className="teach-fill-tabs" activeKey={active} onChange={setActive} destroyInactiveTabPane items={[
        { key: 'lua', label: t('teach.luaEditor'), children: <>
          <div className="teach-editor-toolbar"><Input aria-label={t('teach.name')} value={filename} onChange={(e) => setFilename(e.target.value)} />
            <Button icon={<DownloadOutlined />} onClick={() => downloadText(filename || 'program.lua', source)}>{t('teach.download')}</Button>
            <Button disabled={!canUpload} loading={busy} onClick={() => void command('upload')}>{t('teach.upload')}</Button>
            <Popconfirm title={t('teach.runConfirm')} onConfirm={() => command('run')}><Button type="primary" icon={<PlayCircleOutlined />} disabled={!canUpload || !enabled}>{t('teach.runScript')}</Button></Popconfirm>
          </div><LuaEditor breakpoints={breakpoints} currentLine={currentLine} readOnly={executing && sameFile} canDebug={canDebug} onToggleBreakpoint={(line) => void toggleBreakpoint(line)} />
          <p className="teach-muted">{t('teach.breakpointHint')}</p><div className="teach-button-row">
            <Button disabled={!connected || !token || busy || status?.state !== 'RUNNING'} onClick={() => void command('pause')}>{t('teach.pause')}</Button>
            <Button disabled={!canDebug || !enabled || !paused} onClick={() => void command('resume')}>{t('teach.resume')}</Button>
            {paused ? stepButton : <Popconfirm title={t('teach.stepConfirm')} onConfirm={() => command('step')}>{stepButton}</Popconfirm>}
            <Button danger disabled={!connected || !token} onClick={() => void command('stop')}>{t('teach.softwareStop')}</Button>
          </div>
        </> },
        { key: 'blocks', label: <>{t('teach.blocks')} <DemoBadge /></>, children: <Suspense fallback={<div>…</div>}><BlockEditor /></Suspense> },
      ]} />
    </TeachCard>
  </div>;
}
