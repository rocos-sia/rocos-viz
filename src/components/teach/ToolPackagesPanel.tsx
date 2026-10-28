import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, InputNumber, Modal, Select } from 'antd';
import type { NamedToolFrame, ToolPackage } from '@/core/types';
import { RobotApiClient } from '@/core/RobotApiClient';
import { toolPackagePose, toolPoseFromValues, toolPoseValues } from '@/core/ToolPose';
import { useUnits } from '@/stores/unitStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';
import { TeachCard } from './TeachCard';
import { ToolPackagePreview } from './ToolPackagePreview';

type Run = (label: string, work: (signal: AbortSignal) => Promise<void>, readOnly?: boolean) => Promise<void>;
const axes = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ToolPackagesPanel({ tools, allowed, busy, client, run, reload, robotId, error, selectedName, onSelect }: {
  tools: NamedToolFrame[]; allowed: boolean; busy: boolean; client: RobotApiClient; run: Run;
  reload: (signal: AbortSignal) => Promise<void>; robotId?: string;
  error: string; selectedName: string; onSelect: (name: string) => void;
}) {
  const t = useT(), units = useUnits();
  const connection = useConnectionStore(s => `${s.host}:${s.port}:${s.isConnected}:${s.controlToken}`);
  const packages = tools.flatMap(tool => tool.package ? [tool.package] : []);
  const tool = packages.find(tool => tool.name === selectedName) ?? packages[0];
  const [edit, setEdit] = useState<{ tool: ToolPackage; mount: number[]; tcp: number[] } | null>(null);
  const [exportVersion, setExportVersion] = useState<{ tool: ToolPackage; version: string } | null>(null);
  const archive = useRef<HTMLInputElement>(null), installation = useRef<HTMLInputElement>(null);
  const expected = useRef<string>();
  useEffect(() => { setEdit(null); setExportVersion(null); expected.current = undefined; }, [connection]);
  const upload = (file: File | undefined, installation: boolean) => {
    const digest = expected.current; expected.current = undefined;
    if (file) void run('import-package', async signal => { await client.importToolFile(file, installation, digest, signal); await reload(signal); });
  };
  const form = (key: 'mount' | 'tcp', label: string) => <fieldset className="teach-package-pose"><legend>{label}</legend>
    <div className="teach-tool-pose-inputs">{axes.map((axis, i) => {
      const unit = i < 3 ? units.length : units.angle;
      return <label key={axis}>{axis}<InputNumber aria-label={`${label} ${axis}`} addonAfter={unit.label}
        value={edit && Number.isFinite(edit[key][i]) ? edit[key][i] * unit.factor : null} disabled={busy}
        onChange={value => setEdit(draft => draft && ({ ...draft, [key]: draft[key].map((old, j) => j === i ? value === null ? NaN : value / unit.factor : old) }))} /></label>;
    })}</div>
  </fieldset>;
  return <TeachCard title={t('tools.packages')}>
    <p className="teach-muted">{t('tools.packageHint')} · {t('tools.robotId')}: {robotId || '—'}</p>
    <input ref={archive} type="file" accept=".zip" hidden aria-label={t('tools.importPackage')} onChange={event => { upload(event.target.files?.[0], false); event.target.value = ''; }} />
    <input ref={installation} type="file" accept=".yaml,.yml" hidden aria-label={t('tools.importInstallation')} onChange={event => { upload(event.target.files?.[0], true); event.target.value = ''; }} />
    <div className="teach-button-row">
      <Button disabled={!allowed || busy} onClick={() => { expected.current = undefined; archive.current?.click(); }}>{t('tools.importPackage')}</Button>
      <Button disabled={!allowed || busy} onClick={() => void run('reload-packages', async signal => { await client.reloadToolPackages(signal); await reload(signal); })}>{t('tools.scanPackages')}</Button>
      <Button disabled={!allowed || busy} onClick={() => installation.current?.click()}>{t('tools.importInstallation')}</Button>
    </div>
    {!tool ? <p className="teach-empty">{t('tools.noPackages')}</p> : <div className="teach-package-layout"><div className="teach-package-details">
      <Select className="teach-package-select" aria-label={t('tools.packageSelection')} value={tool.name} disabled={busy}
        options={packages.map(tool => ({ value: tool.name, label: `${tool.name} · ${tool.package_version}` }))} onChange={onSelect} />
      <p>{t('tools.mount')}: {toolPoseValues(toolPackagePose(tool.mount)).slice(0, 3).map(v => (v * units.length.factor).toFixed(3)).join(' / ')} {units.length.label}</p>
      <p>{t('tools.localTcp')}: {toolPoseValues(toolPackagePose(tool.tcp)).slice(0, 3).map(v => (v * units.length.factor).toFixed(3)).join(' / ')} {units.length.label}</p>
      <div className="teach-button-row">
        <Button disabled={!allowed || busy} onClick={() => setEdit({ tool, mount: toolPoseValues(toolPackagePose(tool.mount)), tcp: toolPoseValues(toolPackagePose(tool.tcp)) })}>{t('tools.editInstallation')}</Button>
        <Button disabled={!allowed || busy} onClick={() => { expected.current = tool.digest; archive.current?.click(); }}>{t('tools.updatePackage')}</Button>
        <Button disabled={busy} onClick={() => void run('export-package', async signal => download(await client.exportToolFile(tool.name, false, undefined, signal), `${tool.name}.zip`), true)}>{t('tools.exportPackage')}</Button>
        <Button disabled={busy} onClick={() => setExportVersion({ tool, version: '' })}>{t('tools.exportCalibrated')}</Button>
        <Button disabled={busy} onClick={() => void run('export-installation', async signal => download(await client.exportToolFile(tool.name, true, undefined, signal), `${tool.name}-installation.yaml`), true)}>{t('tools.exportInstallation')}</Button>
      </div>
      {tool.calibration_yaml && <details className="teach-package-calibration"><summary>{t('tools.calibrationRecord')}</summary><pre>{tool.calibration_yaml}</pre></details>}
    </div><ToolPackagePreview tool={tool} client={client} /></div>}
    <Modal title={t('tools.editInstallation')} open={!!edit} destroyOnClose onCancel={() => { if (!busy) setEdit(null); }}
      okText={t('teach.save')} confirmLoading={busy} okButtonProps={{ 'aria-label': t('teach.save'), disabled: !allowed || busy || !edit || ![...edit.mount, ...edit.tcp].every(Number.isFinite) }}
      onOk={() => void run('save-installation', async signal => {
        if (!edit) return;
        await client.updateToolPackage(edit.tool, toolPoseFromValues(edit.mount), toolPoseFromValues(edit.tcp), signal);
        await reload(signal); if (!signal.aborted) setEdit(null);
      })}>
      <Alert type="info" message={t('tools.installationHint')} />
      {form('mount', t('tools.mount'))}{form('tcp', t('tools.localTcp'))}
      <Button disabled={busy || !edit} onClick={() => setEdit(draft => draft && ({ ...draft,
        mount: toolPoseValues(toolPackagePose(draft.tool.default_mount ?? draft.tool.mount)), tcp: toolPoseValues(toolPackagePose(draft.tool.default_tcp ?? draft.tool.tcp)) }))}>{t('tools.restoreDefaults')}</Button>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
    <Modal title={t('tools.exportCalibrated')} open={!!exportVersion} onCancel={() => { if (!busy) setExportVersion(null); }}
      okText={t('tools.exportPackage')} confirmLoading={busy} okButtonProps={{ disabled: busy || !exportVersion || !/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(exportVersion.version) || exportVersion.version === exportVersion.tool.package_version }}
      onOk={() => void run('export-calibrated', async signal => {
        if (!exportVersion) return;
        download(await client.exportToolFile(exportVersion.tool.name, false, exportVersion.version, signal), `${exportVersion.tool.name}-${exportVersion.version}.zip`);
        if (!signal.aborted) setExportVersion(null);
      }, true)}>
      <p>{t('tools.exportHint')}</p><Input aria-label={t('tools.packageVersion')} placeholder="1.0.1" value={exportVersion?.version}
        onChange={event => setExportVersion(draft => draft && ({ ...draft, version: event.target.value }))} />
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  </TeachCard>;
}
