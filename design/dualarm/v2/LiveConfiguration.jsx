import React, { useEffect, useState } from 'react';
import { useT } from '../../../src/i18n/useT';
import { useUIStore } from '../../../src/stores/uiStore';

const emptyPose = ['0', '0', '0', '0', '0', '0', '1'];
const poseValues = frame => frame ? [...['x', 'y', 'z'].map(axis => String(frame.position[axis] * 1000)), ...['x', 'y', 'z', 'w'].map(axis => String(frame.orientation[axis]))] : [...emptyPose];
function parsePose(values) {
  if (!values.every(value => String(value).trim() !== '' && Number.isFinite(Number(value)))) throw new Error('Invalid pose');
  const numbers = values.map(Number), norm = Math.hypot(...numbers.slice(3));
  if (!Number.isFinite(norm) || norm < 1e-9) throw new Error('Invalid quaternion');
  return { position: Object.fromEntries(['x', 'y', 'z'].map((axis, index) => [axis, numbers[index] / 1000])), orientation: Object.fromEntries(['x', 'y', 'z', 'w'].map((axis, index) => [axis, numbers[index + 3] / norm])) };
}
function Fields({ values, onChange, disabled = false, payload = false }) {
  return <div className="pose-grid">{values.map((value, index) => <label className="field" key={index}><span>{payload ? ['X', 'Y', 'Z'][index] : ['X', 'Y', 'Z', 'qx', 'qy', 'qz', 'qw'][index]}<small>{index < 3 ? 'mm' : ''}</small></span><input type="number" step="any" disabled={disabled} value={value} onChange={event => onChange(values.map((previous, slot) => slot === index ? event.target.value : previous))}/></label>)}</div>;
}
export default function LiveConfiguration({ side, arm, page, control, onNavigate }) {
  const t = useT();
  const language = useUIStore(state => state.language);
  const [tools, setTools] = useState({ left: '', right: '' });
  const [drafts, setDrafts] = useState({ left: { kind: 'tool', name: '', pose: [...emptyPose] }, right: { kind: 'tool', name: '', pose: [...emptyPose] } });
  const [payloads, setPayloads] = useState({});
  const [tolerances, setTolerances] = useState({ left: '1', right: '1' });
  const [calculatedTolerance, setCalculatedTolerance] = useState({});
  const configuration = arm.configuration, draft = drafts[side], tool = tools[side];
  const toolNames = Object.keys(configuration?.tools || {});
  const writable = arm.online && arm.owned && !arm.pending && !arm.calibrationRestoring && !arm.stopping && !arm.motionLocked && !arm.snapshot?.motion_busy && ['IDLE', 'STOPPED'].includes(arm.state);
  const calibration = arm.calibration?.name === tool ? arm.calibration : null;
  const tolerance = tolerances[side], payload = payloads[side] || ['0', '0', '0', '0'];
  const result = calibration?.result && calculatedTolerance[side] === tolerance ? calibration.result : null;
  const packageInfo = configuration?.tools[tool]?.package;
  const appliedPayload = configuration?.load;
  const payloadApplied = appliedPayload && payload.every(value => String(value).trim() !== '' && Number.isFinite(Number(value))) && Number(payload[0]) === appliedPayload.mass && payload.slice(1).every((value, index) => Math.abs(Number(value) / 1000 - appliedPayload.com[index]) < 1e-9);
  const patchDraft = patch => setDrafts(previous => ({ ...previous, [side]: { ...previous[side], ...patch } }));
  const error = () => control?.error(side, '配置输入', new Error(t('dual.invalidFields')));
  const write = async (operation, body) => {
    const data = await control?.configuration.write(side, operation, body);
    if (data) control.recover(side, '配置输入');
    return data;
  };
  useEffect(() => {
    const preferences = arm.calibrationPreferences;
    if (!preferences) return;
    setTools(previous => ({ ...previous, [side]: preferences.tool }));
    setTolerances(previous => ({ ...previous, [side]: preferences.tolerance }));
    setCalculatedTolerance(previous => ({ ...previous, [side]: preferences.calculatedTolerance ?? null }));
  }, [side, arm.calibrationPreferences]);
  useEffect(() => {
    if (!configuration) return;
    if (!toolNames.includes(tools[side])) setTools(previous => ({ ...previous, [side]: toolNames[0] || '' }));
    if (!payloads[side]) {
      const load = configuration.load;
      setPayloads(previous => ({ ...previous, [side]: [String(load?.mass || 0), ...(load?.com || [0, 0, 0]).map(value => String(value * 1000))] }));
    }
  }, [configuration, side]);
  useEffect(() => {
    if (page === 'tools' && arm.calibration?.session_id) void control?.configuration.readCalibration(side);
  }, [page, side]);
  function selectTool(name) {
    setTools(previous => ({ ...previous, [side]: name }));
    control?.configuration.invalidate(side);
    control?.configuration.remember(side, { tool: name, calculatedTolerance: null });
  }
  function changeTolerance(value) {
    setTolerances(previous => ({ ...previous, [side]: value }));
    setCalculatedTolerance(previous => ({ ...previous, [side]: null }));
    control?.onArm(side, { calibrationSaved: false });
    control?.configuration.remember(side, { tolerance: value, calculatedTolerance: null });
  }
  async function capture(index, fresh = false) {
    if (!tool) return;
    await write('calibration/pose', { name: tool, index, ...(!fresh && calibration ? { session_id: calibration.session_id } : {}) });
  }
  function selectDefinition(name, kind = draft.kind) {
    const entry = configuration?.[kind === 'tool' ? 'tools' : 'objects'][name];
    patchDraft({ kind, name, pose: poseValues(entry?.frame) });
  }
  async function saveDefinition() {
    try {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(draft.name)) throw new Error();
      const frame = parsePose(draft.pose);
      await write(`robot/${draft.kind}_frame`, { name: draft.name, frame });
    } catch { error(); }
  }
  async function applyPayload() {
    if (!payload.every(value => String(value).trim() !== '' && Number.isFinite(Number(value))) || Number(payload[0]) < 0) { error(); return; }
    await write('robot/load_params', { mass: Number(payload[0]), com: payload.slice(1).map(value => Number(value) / 1000) });
  }
  if (!['tools', 'frames'].includes(page)) return null;
  return <div className="live-configuration">
    <div className="configuration-toolbar"><h2>{t(side === 'left' ? 'dual.left' : 'dual.right')} · {t(page === 'tools' ? 'dual.tools' : 'dual.frames')}</h2><button disabled={arm.configurationLoading} onClick={() => control?.configuration.refresh(side)}>{t('dual.refresh')}</button></div>
    {arm.configurationLoading && <p className="muted">{t('dual.loading')}</p>}
    {arm.calibrationRestoring && <p className="inline-hint" role="status">{t('dual.restoringCalibration')}</p>}
    {arm.configurationError && <p role="alert" className="error-note">{arm.configurationError}</p>}
    {arm.error && <p className="error-note" role="alert">{arm.error.operation}: {arm.error.message} [{arm.error.code}]</p>}
    {!writable && <p className="inline-hint">{t(!arm.online ? 'dual.staleHint' : !arm.owned ? 'dual.acquireHint' : 'dual.runningHint')}</p>}
    {page === 'tools' ? <div className="tools-grid">
      <section className="tool-list"><div className="panel-title"><h2>{t('dual.tool')}</h2></div><label className="field"><span>{t('dual.calibrationTool')}</span><select aria-label={t('dual.calibrationTool')} disabled={arm.pending} value={tool} onChange={event => selectTool(event.target.value)}>{!toolNames.length && <option value="">{t('dual.selectTool')}</option>}{toolNames.map(name => <option key={name}>{name}</option>)}</select></label>
        {!toolNames.length && <p className="muted">{t('dual.emptyFrames')}</p>}
        <button className="wide" disabled={arm.pending} onClick={() => { patchDraft({ kind: 'tool', name: tool, pose: poseValues(configuration?.tools[tool]?.frame) }); onNavigate('frames'); }}>{t('dual.manageToolFrames')}</button>
        {tool && <><dl><dt>{t('dual.name')}</dt><dd>{tool}</dd><dt>{t('dual.active')}</dt><dd>{arm.tool || '—'}</dd></dl><button disabled={!writable || !tool || arm.tool === tool} onClick={() => write('robot/active_tool_frame', { name: tool })}>{t('dual.activate')}</button></>}
        {packageInfo && <div className="tool-details"><h3>{t('dual.package')}</h3><dl><dt>Version</dt><dd>{packageInfo.package_version}</dd><dt>Revision</dt><dd>{packageInfo.revision}</dd><dt>Digest</dt><dd>{packageInfo.digest}</dd></dl><p className="muted small">{t('dual.packageHint')}</p></div>}
      </section>
      <section className="calibration"><div className="panel-title"><h2>{t('dual.calibration')}</h2><span className="state">{calibration?.captured || 0} / 6</span></div><p className="calibration-guide">{t('dual.calibrationGuide')}</p>
        <label className="field tolerance-field"><span>{t('dual.tolerance')} · mm</span><input aria-label={t('dual.tolerance')} type="number" min="0.01" max="50" step="0.01" disabled={arm.pending} value={tolerance} onChange={event => changeTolerance(event.target.value)}/></label>
        <div className="sample-list">{Array.from({ length: 6 }, (_, index) => <div className="sample-row" key={index}><span className="sample-number">P{index + 1}</span><div><b>{index < 4 ? t('dual.fixedPoint',{index:index+1}) : index === 4 ? '+X' : '+Z'}</b><small>{calibration?.samples[index] ? new Date(calibration.samples[index].timestamp * 1000).toLocaleTimeString(language==='zh'?'zh-CN':'en-US',{hour12:false}) : t('dual.notCaptured')}</small></div><span className="muted">{t(calibration?.samples[index] ? 'dual.captured' : 'dual.notCaptured')}</span><button disabled={!writable || !tool || (index > 0 && !calibration?.samples[0])} onClick={() => capture(index + 1)}>{t(calibration?.samples[index] ? 'dual.recapture' : 'dual.capture')}</button></div>)}</div>
        <div className="button-row calculation-actions"><button disabled={!writable || !tool} onClick={() => capture(1, true)}>{t('dual.newSession')}</button><button className="primary" disabled={!writable || calibration?.captured !== 6} onClick={async () => {
          const value = Number(tolerance); if (!Number.isFinite(value) || value <= 0 || value > 50) { error(); return; }
          const data = await write('calibration/run', { session_id: calibration.session_id, max_error: value / 1000 });
          if (data) { setCalculatedTolerance(previous => ({ ...previous, [side]: tolerance })); control?.configuration.remember(side, { calculatedTolerance: tolerance }); }
        }}>{t('dual.calculate')}</button></div>
        <div className="result-panel"><div className="panel-title"><h3>TCP</h3><span className="state">{t(arm.calibrationSaved ? 'dual.saved' : 'dual.unsaved')}</span></div>{result ? <><div className="result-metrics">{[['RMS', result.metrics.rms_error * 1000, 'mm'], [t('dual.maxError'), result.metrics.max_error * 1000, 'mm'], ['Condition', result.metrics.condition_number, ''], ['X/Z', result.metrics.axis_angle_degrees, '°']].map(([label, value, unit]) => <div key={label}><span>{label}</span><b>{Number(value).toFixed(3)} <small>{unit}</small></b></div>)}</div><p>{poseValues(result.pose).slice(0, 3).map(value => Number(value).toFixed(3)).join(' / ')} mm</p><p className="muted small">qx/qy/qz/qw: {poseValues(result.pose).slice(3).map(value => Number(value).toFixed(6)).join(' / ')}</p></> : <p className="muted">{t('dual.noResult')}</p>}
          <div className="button-row"><button disabled={!writable || !result || arm.calibrationSaved} onClick={() => write('calibration/save', { session_id: calibration.session_id })}>{t('dual.saveCalibration')}</button><button disabled={!writable || !arm.calibrationSaved || arm.tool === tool} onClick={() => write('robot/active_tool_frame', { name: tool })}>{t('dual.activate')}</button></div></div>
      </section>
    </div> : <div className="settings-grid">
      <section className="settings-panel"><div className="panel-title"><h2>{t('dual.frames')}</h2><div className="segmented">{['tool', 'object'].map(kind => <button aria-pressed={draft.kind === kind} key={kind} onClick={() => selectDefinition('', kind)}>{t(`dual.${kind}`)}</button>)}</div></div><p className="muted small">{t('dual.frameHint')}</p>
        <div className="frame-list">{Object.keys(configuration?.[draft.kind === 'tool' ? 'tools' : 'objects'] || {}).map(name => <div key={name}><button onClick={() => selectDefinition(name)}>{name}</button><span className="muted">{(draft.kind === 'tool' ? arm.tool : arm.object) === name ? t('dual.active') : ''}</span><button disabled={!writable} onClick={() => write(`robot/active_${draft.kind}_frame`, { name })}>{t('dual.activateFrame')}</button></div>)}</div>
        <button disabled={arm.pending} onClick={() => selectDefinition('')}>{t('dual.new')}</button><label className="field"><span>{t('dual.name')}</span><input aria-label={t('dual.name')} disabled={arm.pending} value={draft.name} onChange={event => patchDraft({ name: event.target.value })}/></label><Fields values={draft.pose} onChange={pose => patchDraft({ pose })} disabled={arm.pending}/>
        <button className="primary" disabled={!writable || (draft.kind === 'tool' && !!configuration?.tools[draft.name]?.package)} onClick={saveDefinition}>{t('dual.saveDefinition')}</button>
        <div className="settings-bottom"><p className="muted small">{t('dual.defaultPath')}</p><div className="button-row"><button disabled={!writable} onClick={() => write('robot/frames/save', {})}>{t('dual.saveFile')}</button><button disabled={!writable} onClick={async () => { if (await write('robot/frames/load', {})) patchDraft({ name: '', pose: [...emptyPose] }); }}>{t('dual.reloadFile')}</button></div></div>
      </section>
      <section className="settings-panel"><div className="panel-title"><h2>{t('dual.payload')}</h2></div><label className="field"><span>{t('dual.mass')} · kg</span><input aria-label={t('dual.mass')} type="number" step="any" min="0" value={payload[0]} disabled={arm.pending} onChange={event => setPayloads(previous => ({ ...previous, [side]: [event.target.value, ...payload.slice(1)] }))}/></label><h3>{t('dual.com')}</h3><Fields payload values={payload.slice(1)} disabled={arm.pending} onChange={values => setPayloads(previous => ({ ...previous, [side]: [payload[0], ...values] }))}/>
        <div className="button-row"><button disabled={!writable} onClick={applyPayload}>{t('dual.applyPayload')}</button><button disabled={!writable || !payloadApplied} onClick={() => write('robot/load_params/save', {})}>{t('dual.saveFile')}</button></div><p className="muted small">{t('dual.defaultPath')}</p><dl><dt>{t('dual.mass')}</dt><dd>{configuration?.load?.mass ?? '—'} kg</dd><dt>{t('dual.com')}</dt><dd>{configuration?.load?.com?.map(value => (value * 1000).toFixed(3)).join(' / ') || '—'} mm</dd></dl>
      </section>
    </div>}
  </div>;
}
