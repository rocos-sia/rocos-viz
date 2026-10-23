import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Spin } from 'antd';
import { DownloadOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { RobotLogClient, type RobotLogFile } from '@/core/RobotLogClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';

const PREVIEW_BYTES = 256 * 1024;
type Preview = Omit<RobotLogFile, 'blob'> & { text: string };

/** 只高亮标准日志行的级别，正文保持原样并按文本渲染。 */
function LogFileText({ text }: { text: string }) {
  return <pre className="teach-log-file-text">{text.split('\n').map((line, index) => {
    const match = /^(\[\d{4}-\d{2}-\d{2}[^\]]*\] \[[^\]]*\] )(\[(trace|debug|info|warn|error|critical)\])(.*)$/i.exec(line);
    return <span key={index}>{match ? <>{match[1]}<span className={`teach-log-level-${match[3].toLowerCase()}`}>{match[2]}</span>{match[4]}</> : line}{'\n'}</span>;
  })}</pre>;
}

export function LogFileActions() {
  const t = useT();
  const { host, port, isConnected } = useConnectionStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'view' | 'download' | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    setOpen(false); setPreview(null); setError(''); setBusy(null);
    return () => { request.current?.abort(); };
  }, [host, port, isConnected]);

  const close = () => {
    request.current?.abort();
    setOpen(false); setPreview(null); setError(''); setBusy(null);
  };
  const load = async (action: 'view' | 'download') => {
    if (!isConnected) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(action); setError('');
    if (action === 'view') { setOpen(true); setPreview(null); }
    try {
      const file = await new RobotLogClient(host).latestFile(controller.signal, action === 'view' ? PREVIEW_BYTES : undefined);
      if (action === 'view') {
        const text = await file.blob.text();
        if (!controller.signal.aborted) setPreview({ filename: file.filename, snapshotTime: file.snapshotTime, truncated: file.truncated, text });
      } else if (!controller.signal.aborted) {
        const url = URL.createObjectURL(file.blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = file.filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request.current === controller && !controller.signal.aborted) setBusy(null);
    }
  };

  const failure = error && <Alert type="error" showIcon message={t('logs.file.failed')} description={error} />;
  return <>
    <div className="teach-log-file-actions">
      <Button icon={<FileTextOutlined aria-hidden="true" />} disabled={!isConnected || busy !== null} onClick={() => void load('view')}>{t('logs.file.view')}</Button>
      <Button icon={<DownloadOutlined aria-hidden="true" />} disabled={!isConnected || busy !== null} loading={busy === 'download'} onClick={() => void load('download')}>{t('logs.file.download')}</Button>
    </div>
    {!open && failure}
    <Modal title={t('logs.file.title')} open={open} onCancel={close} width={1100} footer={<>
      <Button aria-label={t('logs.file.close')} onClick={close}>{t('logs.file.close')}</Button>
      <Button icon={<ReloadOutlined aria-hidden="true" />} disabled={busy !== null || !isConnected} onClick={() => void load('view')}>{t('teach.refresh')}</Button>
      <Button type="primary" icon={<DownloadOutlined aria-hidden="true" />} disabled={busy !== null || !isConnected} loading={busy === 'download'} onClick={() => void load('download')}>{t('logs.file.download')}</Button>
    </>}>
      <div className="teach-log-file-preview">
        <p className="teach-muted">{t('logs.file.hint')}</p>
        {failure}
        {busy === 'view' ? <div className="teach-log-empty"><Spin /></div> : preview && <>
          <div className="teach-log-file-meta"><strong>{preview.filename}</strong>{preview.snapshotTime && <span>{t('logs.file.snapshot')}: {preview.snapshotTime}</span>}</div>
          {preview.truncated && <Alert type="info" showIcon message={t('logs.file.truncated')} />}
          {preview.text ? <LogFileText text={preview.text} /> : <div className="teach-log-empty">{t('logs.file.empty')}</div>}
        </>}
      </div>
    </Modal>
  </>;
}
