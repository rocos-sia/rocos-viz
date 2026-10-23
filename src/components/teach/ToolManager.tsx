import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, InputNumber, Modal, Popconfirm, Spin, Tabs, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { RobotApiClient } from '@/core/RobotApiClient';
import { toolPoseFromValues, toolPoseValues } from '@/core/ToolPose';
import type { NamedToolFrame, Pose, ToolFrameList } from '@/core/types';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useToolCalibrationStore } from '@/stores/toolCalibrationStore';
import { useUnits } from '@/stores/unitStore';
import { useT } from '@/i18n/useT';
import { TeachCard } from './TeachCard';
import { ToolPayloadPanel } from './ToolPayloadPanel';
import { ToolPackagesPanel } from './ToolPackagesPanel';

const axes = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];
const validName = (value: string) => /^[A-Za-z0-9_.-]{1,64}$/.test(value);

export function ToolManager() {
  const t = useT();
  const units = useUnits();
  const { host, port, isConnected, controlToken } = useConnectionStore();
  const robot = useRobotStateStore((s) => s.robotState);
  const { name, session, tolerance } = useToolCalibrationStore();
  const client = useMemo(() => new RobotApiClient(host, port), [host, port]);
  const lifetime = useRef<AbortController | null>(null);
  const [tools, setTools] = useState<NamedToolFrame[]>([]);
  const [list, setList] = useState<ToolFrameList>({ names: [], active: '', file_path: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState(session ? 'calibration' : 'tools');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [edit, setEdit] = useState<{ original: string; name: string; values: number[] } | null>(null);
  const allowed = isConnected && !!controlToken && !!list.file_path && !robot?.motion_busy && !robot?.is_running
    && ['STOPPED', 'IDLE'].includes(robot?.robot_state || '');

  const load = useCallback(async (signal: AbortSignal) => {
    if (signal.aborted) return;
    const next = await client.listToolFrames(signal);
    if (!Array.isArray(next.names)) throw new Error('Invalid tool list response');
    const rows = await Promise.all(next.names.map((name) => client.getToolFrame(name, signal)));
    if (signal.aborted) return;
    setList(next); setTools(rows);
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setTools([]); setList({ names: [], active: '', file_path: '' }); setError(''); setEdit(null); setBusy('');
    setSelectedPackage(''); setTab(current => current === 'packages' ? 'tools' : current);
    if (isConnected) {
      setBusy('load');
      const synchronize = async () => {
        const key = JSON.stringify([host, port, controlToken]);
        const initial = useToolCalibrationStore.getState();
        const draft = initial.controllerKey === key ? initial.session : null;
        // 重新进入页面时先撤销可保存结果，避免采集响应被页面卸载取消后使用旧解。
        if (draft) useToolCalibrationStore.setState({ session: { ...draft, result: null } });
        await load(controller.signal);
        if (draft && !controller.signal.aborted) {
          try {
            const latest = await client.getToolCalibration(draft.session_id, controller.signal);
            const current = useToolCalibrationStore.getState();
            if (!controller.signal.aborted && current.controllerKey === key && current.session?.session_id === draft.session_id)
              useToolCalibrationStore.setState({ session: latest });
          } catch (cause) {
            const current = useToolCalibrationStore.getState();
            if (!controller.signal.aborted && current.controllerKey === key && current.session?.session_id === draft.session_id)
              useToolCalibrationStore.setState({ session: null });
            throw cause;
          }
        }
      };
      void synchronize().catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }).finally(() => { if (!controller.signal.aborted) setBusy(''); });
    }
    return () => controller.abort();
  }, [client, isConnected, host, port, controlToken, load]);

  const run = async (label: string, work: (signal: AbortSignal) => Promise<void>, readOnly = false) => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busy || !isConnected || (!readOnly && !allowed)) return;
    setBusy(label); setError('');
    try { await work(signal); }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (!signal.aborted) setBusy(''); }
  };
  const save = async (toolName: string, pose: Pose, signal: AbortSignal, previousName?: string) => {
    await client.setToolFrame(toolName, pose, signal, previousName);
    if (signal.aborted) return;
    await load(signal);
    if (!signal.aborted) message.success(t('tools.saved'));
  };
  const activate = (toolName: string) => void run('activate', async (signal) => {
    await client.activateToolFrame(toolName, signal);
    await load(signal);
  });
  const renderPose = (pose: Pose) => {
    const values = toolPoseValues(pose);
    return <div className="teach-tool-pose"><span>{values.slice(0, 3).map((v) => (v * units.length.factor).toFixed(3)).join(' / ')} {units.length.label}</span>
      <small>{values.slice(3).map((v) => (v * units.angle.factor).toFixed(3)).join(' / ')} {units.angle.label}</small></div>;
  };
  const result = session?.result;
  const sessionOwned = !!session && session.name === name;
  const capture = (index: number) => void run(`capture-${index}`, async (signal) => {
    if (session) useToolCalibrationStore.setState({ session: { ...session, result: null } });
    const captured = await client.captureToolCalibration(name, index, session?.session_id, signal);
    if (!signal.aborted) useToolCalibrationStore.setState({ session: captured });
  });
  const saveResult = () => void run('save-calibration', async (signal) => {
    if (!session?.result) return;
    if (tools.find(tool => tool.name === session.name)?.package) {
      await client.savePackageCalibration(session.session_id, signal);
      await load(signal);
      const updated = await client.getToolCalibration(session.session_id, signal);
      if (!signal.aborted) useToolCalibrationStore.setState({ session: updated });
    } else await save(session.name, session.result.pose, signal);
  });

  return <div className="teach-tool-manager">
    {!isConnected ? <Alert type="info" showIcon message={t('tools.connect')} />
      : !allowed && <Alert type="info" showIcon message={t('tools.writeHint')} />}
    {isConnected && !busy && !list.file_path && !error && <Alert type="warning" showIcon message={t('tools.updateApp')} />}
    {error && <Alert type="error" showIcon message={error} />}
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'tools', label: t('tools.manage'), children: <div className="teach-tool-manager"><TeachCard title={t('tools.manage')} extra={<div className="teach-button-row">
        <Button aria-label={t('teach.refresh')} icon={<ReloadOutlined aria-hidden="true" />} disabled={!isConnected || !!busy} onClick={() => void run('load', load, true)}>{t('teach.refresh')}</Button>
        <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} disabled={!allowed || !!busy} onClick={() => setEdit({ original: '', name: '', values: [0, 0, 0, 0, 0, 0] })}>{t('tools.add')}</Button>
      </div>}>
        <p className="teach-muted">{t('tools.poseHint', { length: units.length.label, angle: units.angle.label })}</p>
        {busy === 'load' ? <div className="teach-log-empty"><Spin /></div> : <div className="teach-table-scroll"><table className="teach-table teach-tool-table">
          <thead><tr><th>{t('teach.name')}</th><th>{t('tools.tcp')}</th><th>{t('teach.actions')}</th></tr></thead>
          <tbody>{tools.map((tool) => <tr key={tool.name}><td><strong>{tool.name}</strong>{tool.package && <Tag>{t('tools.package')}</Tag>}{list.active === tool.name && <Tag color="blue">{t('tools.active')}</Tag>}</td><td>{renderPose(tool.frame)}</td><td><div className="teach-button-row">
            <Button disabled={!allowed || !!busy || list.active === tool.name} onClick={() => activate(tool.name)}>{t('tools.activate')}</Button>
            <Button aria-label={`${t('tools.edit')} ${tool.name}`} icon={<EditOutlined aria-hidden="true" />} disabled={!allowed || !!busy} onClick={() => {
              if (tool.package) { setSelectedPackage(tool.name); setTab('packages'); }
              else setEdit({ original: tool.name, name: tool.name, values: toolPoseValues(tool.frame) });
            }} />
            <Popconfirm title={t('tools.deleteConfirm', { name: tool.name })} onConfirm={() => run('delete', async (signal) => { await client.deleteToolFrame(tool.name, signal); await load(signal); })}>
              <Button danger aria-label={`${t('tools.delete')} ${tool.name}`} icon={<DeleteOutlined aria-hidden="true" />} disabled={!allowed || !!busy} />
            </Popconfirm>
          </div></td></tr>)}</tbody>
        </table>{!tools.length && <p className="teach-empty">{t('tools.empty')}</p>}</div>}
        <div className="teach-tool-footer"><Button disabled={!allowed || !!busy || !list.active} onClick={() => activate('')}>{t('tools.flange')}</Button>
          <Popconfirm title={t('tools.reloadConfirm')} onConfirm={() => run('reload', async (signal) => { await client.loadToolFrames(signal); await load(signal); })}>
            <Button disabled={!allowed || !!busy}>{t('tools.reload')}</Button>
          </Popconfirm><span className="teach-muted">{t('tools.persistHint')}</span></div>
      </TeachCard><ToolPayloadPanel allowed={allowed && !busy} /></div> },
      ...(list.package_support ? [{ key: 'packages', label: t('tools.packages'), children: <ToolPackagesPanel tools={tools} allowed={allowed} busy={!!busy} client={client} run={run} reload={load} robotId={list.robot_id} error={error} selectedName={selectedPackage} onSelect={setSelectedPackage} /> }] : []),
      { key: 'calibration', label: t('tools.sixPoint'), children: <TeachCard title={t('tools.sixPoint')}>
        <Alert type="info" showIcon message={t('tools.sixGuide')} description={t('tools.sixGuideDetail')} />
        <div className="teach-tool-calibration-controls">
          <label>{t('tools.resultName')}<Input aria-label={t('tools.resultName')} value={name} maxLength={64} disabled={!!session || !!busy} onChange={(event) => useToolCalibrationStore.setState({ name: event.target.value })} /></label>
          <label>{t('tools.tolerance')}<InputNumber aria-label={t('tools.tolerance')} min={0.000001 * units.length.factor} max={0.05 * units.length.factor} addonAfter={units.length.label} value={tolerance * units.length.factor} disabled={!!busy} onChange={(value) => {
            if (value !== null && value > 0) useToolCalibrationStore.setState({ tolerance: value / units.length.factor, session: session ? { ...session, result: null } : null });
          }} /></label>
          <Button disabled={!!busy} onClick={() => useToolCalibrationStore.setState({ session: null })}>{t('tools.reset')}</Button>
          <Link to="/teaching">{t('tools.adjustPose')}</Link>
        </div>
        {!validName(name) && <p className="teach-warning">{t('tools.nameRule')}</p>}
        <div className="teach-table-scroll"><table className="teach-table teach-calibration-table">
          <thead><tr><th>{t('tools.point')}</th><th>{t('tools.captureGuide')}</th><th>{t('tools.flangePose')}</th><th>{t('teach.actions')}</th></tr></thead>
          <tbody>{Array.from({ length: 6 }, (_, i) => {
            const sample = sessionOwned ? session.samples[i] : null;
            return <tr key={i}><td>P{i + 1}</td><td>{i < 4 ? t('tools.pivotPoint') : t(i === 4 ? 'tools.xPoint' : 'tools.zPoint')}</td><td>{sample ? <div title={`${t('tools.joints')}: ${sample.joints.map((q) => (q * units.angle.factor).toFixed(3)).join(', ')} ${units.angle.label}`}>{renderPose(sample.flange)}<small className="teach-muted">{new Date(sample.timestamp * 1000).toLocaleTimeString()}</small></div> : '—'}</td><td>
              <Button aria-label={`${t(sample ? 'tools.recapture' : 'tools.capture')} P${i + 1}`} disabled={!allowed || !!busy || !validName(name) || (!session && i !== 0)} loading={busy === `capture-${i + 1}`} onClick={() => capture(i + 1)}>{t(sample ? 'tools.recapture' : 'tools.capture')}</Button>
            </td></tr>;
          })}</tbody>
        </table></div>
        <div className="teach-tool-footer"><span>{t('tools.progress', { count: sessionOwned ? session.captured : 0 })}</span><Button type="primary" disabled={!allowed || !!busy || session?.captured !== 6} loading={busy === 'calculate'} onClick={() => void run('calculate', async (signal) => {
          if (!session) return;
          const calculated = await client.calculateToolCalibration(session.session_id, tolerance, signal);
          if (!signal.aborted) useToolCalibrationStore.setState({ session: calculated });
        })}>{t('tools.calculate')}</Button></div>
        {result && <div className="teach-tool-calibration-result">
          <h3>{t('tools.result')}</h3>{renderPose(result.pose)}
          <div className="teach-tool-metrics"><span>RMS: {(result.metrics.rms_error * units.length.factor).toFixed(4)} {units.length.label}</span><span>{t('tools.maxError')}: {(result.metrics.max_error * units.length.factor).toFixed(4)} {units.length.label}</span><span>{t('tools.condition')}: {result.metrics.condition_number.toFixed(2)}</span><span>{t('tools.axisAngle')}: {result.metrics.axis_angle_degrees.toFixed(2)}°</span></div>
          <p className="teach-muted">{t('tools.resultHint')}</p>
          {list.names.includes(name) ? <Popconfirm title={t('tools.overwrite', { name })} onConfirm={saveResult}><Button type="primary" disabled={!allowed || !!busy}>{t('tools.saveResult')}</Button></Popconfirm>
            : <Button type="primary" disabled={!allowed || !!busy} onClick={saveResult}>{t('tools.saveResult')}</Button>}
        </div>}
      </TeachCard> },
    ]} />
    <Modal title={t(edit?.original ? 'tools.edit' : 'tools.add')} open={!!edit} onCancel={() => { if (!busy) setEdit(null); }}
      onOk={() => void run('save', async (signal) => {
        if (!edit) return;
        await save(edit.name, toolPoseFromValues(edit.values), signal, edit.original || undefined);
        if (!signal.aborted) setEdit(null);
      })} okText={t('teach.save')} confirmLoading={busy === 'save'} okButtonProps={{ 'aria-label': t('teach.save'), disabled: !allowed || !!busy || !edit || !validName(edit.name) || !edit.values.every(Number.isFinite) || (edit.name !== edit.original && list.names.includes(edit.name)) }}>
      <label className="teach-tool-name">{t('teach.name')}<Input aria-label={t('tools.toolName')} value={edit?.name} maxLength={64} disabled={!!busy} onChange={(event) => setEdit((value) => value && ({ ...value, name: event.target.value }))} /></label>
      <p className="teach-muted">{t('tools.nameRule')}</p>
      {edit && edit.name !== edit.original && list.names.includes(edit.name) && <p className="teach-warning">{t('tools.duplicate')}</p>}
      <div className="teach-tool-pose-inputs">{axes.map((axis, index) => {
        const unit = index < 3 ? units.length : units.angle;
        return <label key={axis}>{axis}<InputNumber aria-label={`${t('tools.tcp')} ${axis}`} addonAfter={unit.label} value={edit && Number.isFinite(edit.values[index]) ? edit.values[index] * unit.factor : null} disabled={!!busy} onChange={(value) => setEdit((draft) => draft && ({ ...draft, values: draft.values.map((old, i) => i === index ? value === null ? NaN : value / unit.factor : old) }))} /></label>;
      })}</div>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  </div>;
}
