import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Scene from './Scene';
import Feedback from './Feedback';
import LiveConfiguration from './LiveConfiguration';
import ModelResources from './ModelResources';
import { StateText, MotionFeedback } from './Status';
import { useT } from '../../../src/i18n/useT';
import { useUIStore } from '../../../src/stores/uiStore';
import { diagnosticsAddress } from '../../../src/dualarm/logs/address';
import { baseDescription, chains as demoChains, inSelectedBase, modelFile, shoulderTrial } from './profile';
import { FRAME } from '../../../src/core/constants';
import { useUnits } from '../../../src/stores/unitStore';
import './style.css';
import LogConsole from '../../../src/dualarm/logs/LogConsole';
import { useDualArmLogs } from '../../../src/dualarm/logs/useDualArmLogs';

import { DualArmControl } from '../../../src/dualarm/control/live.mjs';
const live = new URLSearchParams(location.search).get('mode') !== 'demo';


const sampleFrame = (x=0,y=0,z=0) => ({ position:{x,y,z}, orientation:{x:0,y:0,z:0,w:1} });
const frameDefinition = values => ({ position:{x:Number(values[0])/1000,y:Number(values[1])/1000,z:Number(values[2])/1000}, orientation:{x:Number(values[3]),y:Number(values[4]),z:Number(values[5]),w:Number(values[6])} });
const demoInitial = side => ({ toolFrames: {TCP_01:sampleFrame(0,0,.1),probe_package:sampleFrame(.02,.01,.13)}, objectFrames:{Workpiece_01:sampleFrame(...inSelectedBase(side,[.4,side==='left'?.2:-.2,0]))}, q: [0, -20, 0, -35, 0, 20, 0].map(v => side === 'right' ? -v : v), target: Array(7).fill(0), owned: side === 'left', enabled: side === 'left', online: true, state: 'STOPPED', tool: 'TCP_01', object: 'Workpiece_01', samples: Array(6).fill(false), result: false, saved: false, activated: false, calibrationTool: 'TCP_01', tolerance: '1.0', revision: 1, generation: 0, sessionGeneration: 0, jogVelocity: '0.10', velocity: '0.10', acceleration: '0.30', jerk: '5.0', pose: [...inSelectedBase(side,[.4,0,.35]).map(v=>String(v*1000)),'0','0','0','1'], load: ['0.0','0.0','0.0','0.0'], framePose: ['0','0','100','0','0','0','1'], frameName: 'TCP_02', frames: ['TCP_01','probe_package'], objects: ['Workpiece_01'] });
const initial = side => live ? {...demoInitial(side), q:Array(7).fill(0), target:Array(7).fill(''), pose:Array(7).fill(''), jogVelocity:'0.01', owned:false, enabled:false, online:false, state:'—', tool:'', object:'', toolFrames:{}, objectFrames:{}, frames:[], objects:[], error:null, runtimeError:'', jogging:false, pending:false, snapshot:null} : demoInitial(side);
const esc = value => String(value);
function Icon({type}) { const paths = { teach: 'M4 18V8l8-5 8 5v10l-8 4-8-4Zm0-10 8 5 8-5M12 13v9', tools:'m14 5 5 5M3 21l8-8m1-9a6 6 0 0 0 7 8l-8 8a3 3 0 0 1-4-4l8-8a6 6 0 0 0-3-4Z', frames:'M4 20V4m0 16h16M4 20 17 7M2 6l2-2 2 2m12 12 2 2-2 2m-3-15h2v2', model:'m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10', logs:'M5 3h14v18H5V3Zm4 5h6M9 12h6m-6 4h4' }; return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.teach}/></svg>; }
function Field({label, value, onChange, unit, ...props}) { return <label className="field"><span>{label}{unit && <small>{unit}</small>}</span><input value={value} onChange={e => onChange(e.target.value)} {...props}/></label>; }
function SpeedSlider({label, value, onChange, unit, max = 0.5, disabled = false}) {
  const id = React.useId(), t = useT();
  return <div className="speed-control"><div className="speed-label"><label htmlFor={id}>{label}</label><output htmlFor={id} className="num">{Number(value).toFixed(2)} <small>{unit}</small></output></div><input id={id} type="range" min="0.01" max={max} step="0.01" value={value} disabled={disabled} aria-valuetext={`${Number(value).toFixed(2)} ${unit}`} onChange={e=>onChange(e.target.value)}/><div className="speed-scale"><span>{t('dual.lowSpeed')} · 0.01</span><span>{max.toFixed(2)} · {t('dual.pageLimit')}</span></div></div>;
}
function App() {
  const logs = useDualArmLogs();
  const t = useT();
  const language = useUIStore(state => state.language);
  const names = {left:t('dual.left'),right:t('dual.right')};
  const pages = [['teach',t('dual.teach')],['tools',t('dual.tools')],['frames',t('dual.frames')],['model',t('dual.model')],['logs',t('dual.logs')]];
  const units = useUnits();
  const [poses,setPoses] = useState({left:null,right:null});
  const [displayFrames,setDisplayFrames] = useState({left:FRAME.FLANGE,right:FRAME.FLANGE});
  const receivePose = useCallback(next=>setPoses(prev=>JSON.stringify(prev)===JSON.stringify(next)?prev:next),[]);
  const [arms, setArms] = useState({left: initial('left'), right: initial('right')});
  const [selected, setSelected] = useState('left'), [page, setPage] = useState(location.hash === '#logs' ? 'logs' : 'teach');
  const [mode, setMode] = useState('jog'), [jogMode, setJogMode] = useState('joint'), [motion, setMotion] = useState('movej');
  const [frame, setFrame] = useState('BASE'), [frameKind, setFrameKind] = useState('tool');
  const [notice, setNotice] = useState(''), [scenario, setScenario] = useState('normal');
  const [events, setEvents] = useState(live ? [] : [{time:'示例', side:'left', text:'已取得左臂控制权，等待操作'}, {time:'示例', side:'right',text:'右臂只读，可独立申请控制权'}]);
  const [menu, setMenu] = useState(false);
  const active = useRef(null), current = useRef(arms); current.current = arms;
  const [model, setModel] = useState(null);
  const controller = useRef(null);
  const chains = live && model ? Object.fromEntries(model.arms.map(a=>[a.arm,{base:a.base_link,tip:a.tip_link}])) : demoChains;
  const [started] = useState(Date.now);
  const diagnosticSeen = useRef(new Set());
  useEffect(() => {
    if (!live) return;
    const control = new DualArmControl({onArm:update, onModel:setModel, onEvent:log,
      onError:(side,error)=>{update(side,{error});log(side,`${error.operation}：${error.message} [${error.code}]${error.requestId ? ` · request_id ${error.requestId}` : ''}`);}});
    controller.current = control; control.start();
    logs.connect(diagnosticsAddress());
    return () => { control.close(); controller.current=null; };
  }, []);
  useEffect(() => {
    if (!live) return;
    for (const e of logs.events) {
      if (diagnosticSeen.current.has(e.id)) continue;
      diagnosticSeen.current.add(e.id);
      if (Date.parse(e.timestamp)<started || !['left','right'].includes(e.arm) || !['error','critical','warn'].includes(e.level)) continue;
      update(e.arm,{lastError:{historical:true,operation:e.operation?.name || e.module,message:e.message,code:e.code,requestId:e.operation?.request_id || '',time:e.timestamp}});
    }
  }, [logs.events,started]);

  const arm = arms[selected], owned = arm.online && arm.owned, idle = ['IDLE','STOPPED'].includes(arm.state), writable = owned && idle && !arm.pending && !arm.stopping && !arm.motionLocked, movable = writable && arm.enabled && !arm.snapshot?.motion_busy;
  const jogSpeed = arm.jogVelocity;
  const update = (side, values) => setArms(prev => ({...prev, [side]: {...prev[side], ...values}}));
  const log = (side, text) => { setEvents(prev => [{side,text,time:new Date().toLocaleTimeString('zh-CN',{hour12:false})},...prev].slice(0,60)); setNotice(`${names[side]} · ${text}`); };
  function stopJog() {
    const held = active.current; if (!held) return;
    active.current = null;
    if (held.element && held.element.hasPointerCapture(held.pointerId)) held.element.releasePointerCapture(held.pointerId);
    if (live) { void controller.current?.stopJog(held.side); return; }
    update(held.side,{state:'STOPPED'}); log(held.side, '点动已停止（演示）');
  }
  useEffect(() => {
    const stop = () => stopJog();
    const visibility = () => { if (document.hidden) stopJog(); };
    window.addEventListener('blur', stop); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); document.addEventListener('visibilitychange', visibility);
    const timer = live ? null : setInterval(() => {
      setArms(prev => {
        let next = prev;
        for (const side of ['left','right']) {
          const a = prev[side]; if (!a.online || !a.enabled) continue;
          let q = a.q, state = a.state;
          if (a.state === 'RUNNING') { q = a.q.map((v,i) => v + Math.sign(a.target[i]-v)*Math.min(Math.abs(a.target[i]-v), Math.max(.05, Number(a.velocity)*180/Math.PI*.08))); if (q.every((v,i) => Math.abs(v-a.target[i])<.001)) state='STOPPED'; }
          const held = active.current;
          if (held?.side === side && a.owned && held.kind === 'joint') q = a.q.map((v,i) => i === held.index ? Math.max(-170,Math.min(170,v+held.sign*held.speed*180/Math.PI*.08)) : v);
          if (q !== a.q || state !== a.state) next = {...next,[side]:{...a,q,state}};
        }
        return next;
      });
    },80);
    return () => { clearInterval(timer); window.removeEventListener('blur',stop); window.removeEventListener('pointerup',stop); window.removeEventListener('pointercancel',stop); document.removeEventListener('visibilitychange',visibility); };
  }, []);
  function choose(side) { stopJog(); setSelected(side); setNotice(''); }
  function navigate(next, side=selected) { stopJog(); setPage(next);history.replaceState(null, '', `${location.pathname}${location.search}${next==='logs'?'#logs':''}`); setNotice(''); setMenu(false); if(live&&['tools','frames'].includes(next)) void controller.current?.configuration.refresh(side); window.scrollTo(0,0); }
  function action(side, kind) {
    const a = current.current[side];
    if (live) {
      if (active.current?.side === side) stopJog();
      if (kind==='stop') void controller.current?.stop(side);
      else void controller.current?.command(side, ['acquire','release'].includes(kind) ? `control/${kind}` : `robot/${kind==='enable' ? (a.enabled?'disable':'enable') : kind}`);
      return;
    }
    if (kind === 'acquire') { if (!a.online) return; update(side,{owned:true,generation:a.generation+1}); log(side,'控制权已申请（演示）'); return; }
    if (!a.online || !a.owned) return;
    if (kind === 'stop') { if (active.current?.side === side) active.current=null; update(side,{state:'STOPPED'}); log(side,'已软件停止；另一臂保持原状态'); }
    if (kind === 'enable' && a.state === 'STOPPED') { update(side,{enabled:!a.enabled}); log(side,a.enabled?'已下使能（演示）':'已使能，示例反馈稳定'); }
    if (kind === 'release') { if (active.current?.side === side) stopJog(); update(side,{owned:false,generation:a.generation+1}); log(side,'已释放控制权；释放不等于停止运动'); }
    if (kind === 'pause' && a.state === 'RUNNING') { update(side,{state:'PAUSED'}); log(side,'已暂停（演示）'); }
    if (kind === 'resume' && a.state === 'PAUSED') { update(side,{state:'RUNNING'}); log(side,'继续执行原目标（演示）'); }
    if (kind === 'reset' && a.state === 'STOPPED') log(side,'复位请求受理（演示）');
  }
  function startJog(event, index, sign) {
    if (!movable || active.current) return;
    if (event.type === 'pointerdown' && (event.button !== 0 || !event.isPrimary)) return;
    const speed = Number(jogSpeed); if (!Number.isFinite(speed) || speed <= 0 || speed > .5) { setNotice('点动速度需大于 0 且不超过演示上限 0.5'); return; }
    if (event.type === 'keydown' && (![' ','Enter'].includes(event.key) || event.repeat)) return;
    event.preventDefault(); if (event.pointerId !== undefined) event.currentTarget.setPointerCapture(event.pointerId);
    if (live && !controller.current?.startJog(selected,jogMode,index,sign,speed,frame)) {
      if (event.pointerId !== undefined && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    active.current = {side:selected,index,sign,speed,kind:jogMode,element:event.pointerId === undefined ? null : event.currentTarget,pointerId:event.pointerId};
    if (live) { log(selected,'正在下发点动；松开停止'); return; }
    update(selected,{state:'JOGGING'});
    log(selected, `${jogMode === 'joint' ? `J${index+1}` : jogMode === 'cartesian' ? ['X','Y','Z','Rx','Ry','Rz'][index] : jogMode} ${sign > 0 ? '+' : '−'} 点动演示${jogMode === 'joint' ? '' : '；仅演示按住/松开流程，未求解位姿'}`);
  }
  function checkJogPointer(event) {
    const held = active.current;
    if (!held?.element || event.pointerId !== held.pointerId) return;
    // Pointer capture keeps delivering events outside the button. Stop there too.
    const bounds = held.element.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right ||
        event.clientY < bounds.top || event.clientY >= bounds.bottom) stopJog();
  }
  function move() {
    if (live) { if (movable) void controller.current?.move(selected,motion,arm); return; }
    if (!movable) return;
    if (![arm.velocity,arm.acceleration,arm.jerk].every(v => v !== '' && Number.isFinite(Number(v)) && Number(v)>0)) { setNotice('速度、加速度、加加速度必须为正数'); return; }
    if (['movej','movel_fk'].includes(motion)) {
      if (!arm.target.every(v => v !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v))<=170)) { setNotice('请填写全部 7 个关节目标；演示范围为 ±170°，实际以设备限位为准'); return; }
      if (motion === 'movej') { update(selected,{target:arm.target.map(Number),state:'RUNNING'}); log(selected,'MoveJ 已受理（本地关节插值演示）'); }
      else log(selected,'MoveL_FK 请求流程已演示；页面不执行直线规划');
    } else {
      if (!arm.pose.every(v => v !== '' && Number.isFinite(Number(v))) || Math.hypot(...arm.pose.slice(3).map(Number))<1e-9) { setNotice('位姿字段必须为有限数值，四元数不能全为零'); return; }
      log(selected,`${motion.toUpperCase()} 请求流程已演示；页面不执行逆解或轨迹规划`);
    }
  }
  function fillPose() {
    const pose = motion === 'movej_ik' ? arm.snapshot?.flange : arm.snapshot?.tcp;
    if (!arm.online || !pose) return;
    update(selected,{pose:[...['x','y','z'].map(axis=>String(pose.position[axis]*1000)),...['x','y','z','w'].map(axis=>String(pose.orientation[axis]))]});
  }
  function capture(index) {
    if (!writable) return;
    if (index !== 0 && (!arm.samples[0] || arm.sessionGeneration !== arm.generation)) return;
    const fresh = index === 0 && arm.sessionGeneration !== arm.generation;
    const samples = fresh ? Array(6).fill(false) : [...arm.samples]; samples[index]=true;
    update(selected,{samples,result:false,saved:false,activated:false,sessionGeneration:arm.generation}); log(selected,`P${index+1} 示例采点已记录；旧计算结果已清除`);
  }
  function scenarioChange(value) {
    stopJog(); setScenario(value);
    if (value === 'normal') { setArms({left:initial('left'),right:initial('right')}); setNotice('已重置为初始示例'); return; }
    if (value === 'offline') update(selected,{online:false,state:'STOPPED',owned:false,generation:arm.generation+1});
    if (value === 'expired') update(selected,{owned:false,generation:arm.generation+1});
    if (value === 'invalid') update(selected,{revision:arm.revision+1,result:false,saved:false,activated:false,samples:Array(6).fill(false)});
    if (value === 'empty') update(selected,{frames:[],tool:'',calibrationTool:'',samples:Array(6).fill(false),result:false,saved:false,activated:false});
    log(selected, {offline:'反馈已过期，运动操作锁定',expired:'控制权已失效，原标定会话只读',invalid:'安装 revision 已变化，标定会话失效',empty:'工具列表为空，请先新增工具坐标系'}[value]);
  }
  const editArray = (key,index,value) => { const next=[...arm[key]]; next[index]=value; update(selected,{[key]:next}); };
  const toolSelect = <select aria-label="标定工具" value={arm.calibrationTool} disabled={!writable} onChange={e => update(selected,{calibrationTool:e.target.value,samples:Array(6).fill(false),result:false,saved:false,activated:false})}>{!arm.frames.length && <option value="">暂无工具</option>}{arm.frames.map(n => <option key={n}>{n}</option>)}</select>;
  const packageTool = arm.calibrationTool === 'probe_package';
  const stale = arm.samples.some(Boolean) && arm.sessionGeneration !== arm.generation;
  return <div className="app-shell" lang={language}>
    <aside className={`sidebar ${menu?'open':''}`}><a className="brand" href="#teach" onClick={()=>navigate('teach')}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25V7h12a6 6 0 0 1 0 12H5m12 0 9 8"/></svg><span>ROCOS<small>{t('dual.workspace')}</small></span></a><span className="nav-label">工作空间</span><nav>{pages.map(([id,label])=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon type={id}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="workspace-mark"><Icon type="model"/><b>MuJoCo DualArm</b></div><p>一个工作站，两臂独立执行</p><span className="muted">{live?'实时 App / 协议 0.5.0-local':'页面预案 / 协议 0.5.0-local'}</span></div></aside>
    <div className="workspace">
    {page!=='logs'&&<section className="arm-strip" aria-label="左右臂状态与独立操作">{['left','right'].map(side=>{const a=arms[side];return <div key={side} data-arm={side} className={`arm-summary ${side} ${selected===side?'selected':''}`}>
      <div className="arm-summary-top"><button className="arm-select" aria-pressed={selected===side} onClick={()=>choose(side)}><i className={`arm-dot ${side}`}/><strong>{names[side]}</strong><span className="muted">{`${side==='left'?'L':'R'} · ${t('dual.master')} ${live?(a.definition?.ecat_id??'—'):(side==='left'?0:1)}`}</span></button><span className="state machine-state" title={a.state}>{t('dual.machine')} <StateText state={a.state} online={a.online}/></span><span className={`state ${a.online&&a.enabled?'good':''}`}>{!a.online?t('dual.stale'):a.enabled?t('dual.enabled'):t('dual.disabled')}</span><span className="owner">{a.owned?t('dual.owned'):a.leaseChecking?t('dual.verifying'):a.owner?t('dual.otherOwner'):t('dual.readOnly')}</span></div>
      <div className="arm-summary-bottom"><div className="arm-tools"><span title="当前工具">{a.tool||t('dual.noTool')}</span><button aria-label={t('dual.armTools',{arm:names[side]})} onClick={()=>{choose(side);navigate('tools',side);}}>{t('dual.manageTools')}</button></div><div className="button-row"><button disabled={!a.online||a.pending||a.stopping||a.leaseChecking} onClick={()=>action(side,a.owned?'release':'acquire')}>{t(a.owned?'dual.release':'dual.acquire')}</button><button disabled={!a.online||!a.owned||a.pending||a.stopping||(!['IDLE','STOPPED'].includes(a.state)||a.motionLocked)} onClick={()=>action(side,'enable')}>{t(a.enabled?'dual.disable':'dual.enable')}</button><button className="danger" disabled={!a.owned} onClick={()=>action(side,'stop')}>{t('dual.stop',{arm:names[side]})}</button></div></div>
      {live&&<div className={`arm-error-slot ${a.error||a.runtimeError?'has-error':''}`} aria-live="polite"><span title={(a.runtimeError ? `${a.runtimeError}${a.error?` · ${a.error.message}`:''}` : '') || (a.error ? `${a.error.operation} · ${a.error.message} [${a.error.code}] · ${a.error.requestId}` : '')}>{(a.runtimeError ? `${a.runtimeError}${a.error?` · ${a.error.message}`:''}` : '') || (a.error ? `${a.error.operation}：${a.error.message} [${a.error.code}]` : a.lastError?`${t(a.lastError.recovered?'dual.recovered':'dual.history')} · ${a.lastError.message}`:a.pending?t('dual.pending'):a.online?`${t('dual.online')} · ${a.definition?.base_link || ''}`:t('dual.connecting'))}</span><button onClick={()=>{choose(side);navigate('logs');}}>{t('dual.details')}</button>{a.error&&!a.runtimeError&&<button aria-label={t('dual.clearArm',{arm:names[side]})} onClick={()=>update(side,{error:null})}>{t('dual.clear')}</button>}</div>}
    </div>;})}</section>}
<header className="topbar"><button className="menu-button" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{t('dual.menu')}</button><h1>{pages.find(([id])=>id===page)[1]}</h1><div className="notice topbar-notice" role="status" title={notice}>{notice}</div><div className="demo-label">{live?t('dual.live'):page==='logs'?'只读日志 · 可连接控制器':(shoulderTrial?'肩部基座试验 · 示例数据':'运动预案 · 示例数据')}</div>{!live&&page!=='logs'&&<label className="scenario">状态演示<select value={scenario} onChange={e=>scenarioChange(e.target.value)}><option value="normal">正常</option><option value="offline">当前臂失联</option><option value="expired">当前臂控制权过期</option><option value="invalid">工具安装发生变化</option><option value="empty">工具列表为空</option></select></label>}</header>
    <main className={page==='teach'?'teach-page':''}>

    {page==='teach' && <><div className="teach-grid"><div className="view-column">{(!live||model)?<Scene key={model?.revision || 'demo'} model={model} arms={arms} selected={selected} onPose={receivePose}/>:<div className="scene-panel">{t('dual.modelPending')}</div>}</div>
    <section className="control-panel"><div className="panel-title"><h2><i className={`arm-dot ${selected}`}/>{t('dual.operation',{arm:names[selected]})}</h2><div className="segmented">{['left','right'].map(s=><button key={s} aria-pressed={selected===s} onClick={()=>choose(s)}>{names[s]}</button>)}</div></div><div className="tabs">{[['jog',t('dual.jog')],['motion',t('dual.precise')]].map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>{stopJog();setMode(id);}}>{label}</button>)}</div>
    <div className={`operation-status ${arm.error||arm.runtimeError?'has-error':''}`} aria-live="polite">{live ? (arm.runtimeError?t('dual.faultHint'):arm.error?`${arm.error.operation}: ${arm.error.message} [${arm.error.code}]`:!arm.online?t('dual.staleHint'):!arm.owned?t('dual.acquireHint'):!arm.enabled?t('dual.enableHint'):arm.jogging?t('dual.hold'):<>{t('dual.machine')} <StateText state={arm.state}/> · {t(arm.snapshot?.motion_busy?'dual.runningHint':'dual.idleHint')}</>) : (!movable&&arm.state!=='JOGGING'?'请检查控制权、使能和当前状态。':'')}</div>
    <div className="operation-body">
    {mode==='jog'?<><div className="form-row"><label className="field"><span>{t('dual.jogKind')}</span><select value={jogMode} onChange={e=>{stopJog();setJogMode(e.target.value);}}><option value="joint">{t('dual.jointJog')}</option><option value="cartesian">{t('dual.cartesianJog')}</option><option value="nullspace">{t('dual.nullspaceJog')}</option><option value="svd">{t('dual.svdJog')}</option></select></label><label className="field"><span>{t('dual.reference')}</span><select value={frame} disabled={jogMode!=='cartesian'} onChange={e=>{stopJog();setFrame(e.target.value);}}>{['BASE','FLANGE','TOOL','OBJECT'].map((v,i)=><option key={v} value={v}>{[t(shoulderTrial?'dual.shoulder':'dual.base'),t('dual.flange'),t('dual.tool'),t('dual.object')][i]}</option>)}</select></label></div><div className="jog-speed"><SpeedSlider label={t('dual.jogSpeed')} unit={jogMode==='cartesian'?'平移 m/s · 转动 rad/s':'rad/s'} value={jogSpeed} onChange={v=>{stopJog();update(selected,{jogVelocity:v});}}/></div><div className="jog-heading"><span>{t('dual.hold')}</span><span className="muted">{jogMode==='joint'?`${t('dual.position')} ${units.angle.label}`:t('dual.direction')}</span></div><div className="jog-list">{(jogMode==='cartesian'?['X','Y','Z','Rx','Ry','Rz']:jogMode==='svd'?['维度 1']:Array.from({length:7},(_,i)=>`J${i+1}`)).map((name,i)=><div className="jog-row" key={name}><button className="jog-button" aria-label={t('dual.jogNegative',{arm:names[selected],axis:name})} disabled={!movable && !((arm.state==='JOGGING'||arm.jogging)&&owned)} onPointerDown={e=>startJog(e,i,-1)} onPointerMove={checkJogPointer} onPointerLeave={stopJog} onPointerUp={stopJog} onPointerCancel={stopJog} onLostPointerCapture={stopJog} onKeyDown={e=>startJog(e,i,-1)} onKeyUp={e=>{if([' ','Enter'].includes(e.key))stopJog();}} onBlur={stopJog}>−</button><div><b>{name}</b>{jogMode==='joint'&&<span className="num">{arm.online?(arm.q[i]*Math.PI/180*units.angle.factor).toFixed(2):'—'}<small> {units.angle.label}</small></span>}</div><button className="jog-button" aria-label={t('dual.jogPositive',{arm:names[selected],axis:name})} disabled={!movable && !((arm.state==='JOGGING'||arm.jogging)&&owned)} onPointerDown={e=>startJog(e,i,1)} onPointerMove={checkJogPointer} onPointerLeave={stopJog} onPointerUp={stopJog} onPointerCancel={stopJog} onLostPointerCapture={stopJog} onKeyDown={e=>startJog(e,i,1)} onKeyUp={e=>{if([' ','Enter'].includes(e.key))stopJog();}} onBlur={stopJog}>+</button></div>)}</div>{!live&&jogMode!=='joint'&&<p className="muted small">本地流程演示，未执行位姿求解。</p>}</>:<><MotionFeedback motion={arm.motion}/><label className="field"><span>{t('dual.motionKind')}</span><select value={motion} disabled={arm.pending} onChange={e=>setMotion(e.target.value)}><option value="movej">MoveJ · {t('dual.targetAngles')}</option><option value="movej_ik">MoveJ_IK · {t('dual.pose')}</option><option value="movel">MoveL · {t('dual.tool')}</option><option value="movel_fk">MoveL_FK · {t('dual.targetAngles')}</option></select></label><div className="motion-speed"><SpeedSlider label={t('dual.motionSpeed')} unit={['movel','movel_fk'].includes(motion)?'m/s':'rad/s'} value={arm.velocity} onChange={v=>update(selected,{velocity:v})} disabled={!idle}/></div>{['movej','movel_fk'].includes(motion)?<><div className="joint-target-header"><span>{t('dual.targetAngles')}</span><button className="text-button" disabled={!arm.online||arm.pending} onClick={()=>update(selected,{target:[...arm.q]})}>{t('dual.fillJoints')}</button></div><div className="target-grid">{arm.target.map((v,i)=><Field key={i} label={`J${i+1}`} value={v} onChange={v=>editArray('target',i,v)} type="number" step="0.1"/>)}</div></>:<><div className="pose-target-header"><p className="muted small">{t('dual.target')} {t(motion==='movej_ik'?'dual.flange':'dual.tool')} {t('dual.pose')} · {chains[selected].base} / {t('dual.quaternion')}</p>{live&&<button className="text-button" disabled={!arm.online||arm.pending} onClick={fillPose}>{t('dual.fillPose')}</button>}</div><div className="pose-grid">{arm.pose.map((v,i)=><Field key={i} label={['X','Y','Z','qx','qy','qz','qw'][i]} unit={i<3?'mm':undefined} value={v} onChange={v=>editArray('pose',i,v)} type="number" step="0.01"/>)}</div></>}<div className="parameters motion-parameters">{[['acceleration',t('dual.acceleration'),['movel','movel_fk'].includes(motion)?'m/s²':'rad/s²'],['jerk',t('dual.jerk'),['movel','movel_fk'].includes(motion)?'m/s³':'rad/s³']].map(([key,label,unit])=><Field key={key} label={label} unit={unit} type="number" min="0.01" step="0.1" value={arm[key]} onChange={v=>update(selected,{[key]:v})}/>)}</div><button className="primary wide" disabled={!movable||arm.jogging} onClick={move}>{t('dual.submit',{arm:names[selected],kind:motion.toUpperCase()})}</button><p className="muted small">{t('dual.motionHint')}</p></>}
    </div><div className="control-footer"><button disabled={!owned||!['RUNNING','PAUSED'].includes(arm.state)} onClick={()=>action(selected,arm.state==='PAUSED'?'resume':'pause')}>{t(arm.state==='PAUSED'?'dual.resume':'dual.pause',{arm:names[selected]})}</button><button disabled={live?(!owned||arm.pending||arm.snapshot?.motion_busy):!writable} onClick={()=>action(selected,'reset')}>{t('dual.reset',{arm:names[selected]})}</button></div></section></div><Feedback live={live} chains={chains} arms={arms} poses={poses} frames={displayFrames} onFrame={(side,value)=>setDisplayFrames(prev=>({...prev,[side]:value}))}/></>}
    {live&&<LiveConfiguration side={selected} arm={arm} page={page} control={controller.current} onNavigate={navigate}/>}
    {!live&&page==='tools' && <div className="tools-grid"><section className="tool-list"><div className="panel-title"><h2>{names[selected]}工具</h2><span className="muted">{arm.frames.length} 个</span></div>{arm.frames.length?arm.frames.map(n=><button className={`tool-row ${arm.calibrationTool===n?'selected':''}`} key={n} onClick={()=>update(selected,{calibrationTool:n,samples:Array(6).fill(false),result:false,saved:false,activated:false})}><span><b>{n}</b><small>{n==='probe_package'?'已配置工具包':'普通 TCP'}</small></span>{arm.tool===n?<span className="state good">使用中</span>:<span>查看</span>}</button>):<p>尚无工具。先在坐标与负载中新增。</p>}<button className="wide" onClick={()=>navigate('frames')}>管理工具坐标系</button><div className="tool-details"><h3>{packageTool?'工具包安装':'工具坐标系'}</h3><dl><dt>所属臂</dt><dd>{names[selected]}</dd><dt>当前工具</dt><dd>{arm.tool||'—'}</dd><dt>类型</dt><dd>{packageTool?'已配置工具包':'普通 TCP'}</dd>{packageTool&&<><dt>包版本</dt><dd>1.0.0（示例）</dd><dt>安装 revision</dt><dd>{arm.revision}</dd><dt>安装平移</dt><dd>20 / 10 / 30 mm</dd><dt>包摘要</dt><dd>示例包 · 未连接</dd></>}</dl><p className="muted small">{packageTool?'标定只更新本机局部 TCP；保留安装位姿与原始包资源。':'六点结果为法兰到工具的完整位姿。'}</p></div><p className="muted small">本版支持已配置工具包的标定，工具包导入、导出与安装管理未开放。</p></section>
    <section className="calibration"><div className="panel-title"><h2>六点工具标定 <span className="muted">/ {names[selected]}</span></h2><span className="state">{arm.samples.filter(Boolean).length} / 6 点</span></div><div className="form-row"><label className="field"><span>目标工具</span>{toolSelect}</label><Field label="最大允许误差" unit="mm" type="number" min="0.01" max="50" step="0.1" value={arm.tolerance} onChange={v=>update(selected,{tolerance:v,result:false,saved:false,activated:false})}/></div><div className="calibration-guide"><b>固定点 → 工具 +X → 工具 +Z</b><p>P1–P4：工具尖端保持同一固定点，改变法兰姿态。P5、P6 保持 P4 姿态，分别沿工具 +X、+Z 移动至少 1 mm。</p></div>{stale && <p className="error-note">控制权已变更。原会话只读，请重新采集 P1 开始新会话。</p>}<div className="sample-list">{['固定点 · 姿态一','固定点 · 姿态二','固定点 · 姿态三','固定点 · 方向参考','工具 +X 方向','工具 +Z 方向'].map((text,i)=><div className="sample-row" key={i}><span className={`sample-number ${arm.samples[i]?'captured':''}`}>P{i+1}</span><div><b>{text}</b><small>{arm.samples[i]?'已记录示例采点':i<4?'尖端对准同一个固定点':'保持 P4 姿态，沿指定方向平移'}</small></div><span className="muted">{arm.samples[i]?'已采集':'待采集'}</span><button disabled={!writable||!arm.calibrationTool||(i>0&&(!arm.samples[0]||stale))} onClick={()=>capture(i)}>{arm.samples[i]?'重新采集':'采集此点'}</button></div>)}</div><div className="calculation-actions"><p className="muted small">真实接入时只采集控制器反馈；计算不会运动、保存或激活工具。</p><button className="primary" disabled={!writable||stale||!arm.samples.every(Boolean)} onClick={()=>{const t=Number(arm.tolerance);if(!Number.isFinite(t)||t<=0||t>50){setNotice('允许误差应大于 0 且不超过 50 mm');return;} if(t<.06){update(selected,{result:false,saved:false,activated:false});log(selected,'示例最大误差 0.060 mm 超过阈值；请重采或调整阈值');return;}update(selected,{result:true,saved:false,activated:false});log(selected,'示例计算完成；尚未保存');}}>计算 TCP</button></div><div className="result-panel"><div className="panel-title"><h3>标定结果</h3><span className="state">{arm.saved?(arm.activated?'已保存 · 已激活':'已保存 · 待明确激活'):arm.result?'已计算 · 未保存':'等待计算'}</span></div>{arm.result?<><div className="result-metrics"><div><span>RMS 误差</span><b>0.025 <small>mm</small></b></div><div><span>最大误差</span><b>0.060 <small>mm</small></b></div><div><span>条件数</span><b>18.4</b></div><div><span>轴夹角</span><b>89.8 <small>°</small></b></div></div><p>法兰 TCP（示例）：X 15.00 / Y −10.00 / Z 100.00 mm</p><p className="muted small">以上为页面示例结果，未执行六点求解。{packageTool?'保存时由服务端转换为包局部 TCP。':''}</p></>:<p className="muted">采齐六点后计算。重采任一点会清除原结果。</p>}<div className="button-row"><button disabled={!writable||stale||!arm.result||arm.saved} onClick={()=>{update(selected,{saved:true,toolFrames:{...arm.toolFrames,[arm.calibrationTool]:sampleFrame(.015,-.01,.1)},revision:packageTool?arm.revision+1:arm.revision});log(selected,'标定结果已保存到本臂（演示），未自动激活');}}>保存到{names[selected]}</button><button disabled={!writable||!arm.saved||stale} onClick={()=>{update(selected,{tool:arm.calibrationTool,activated:true});log(selected,`${arm.calibrationTool} 已明确激活（演示）`);}}>激活此工具</button></div></div></section></div>}
    {!live&&page==='frames' && <div className="settings-grid"><section className="settings-panel"><div className="panel-title"><h2>{names[selected]}坐标系</h2><div className="segmented">{[['tool','工具'],['object','工件']].map(([id,name])=><button key={id} aria-pressed={frameKind===id} onClick={()=>setFrameKind(id)}>{name}</button>)}</div></div><div className="frame-list">{(frameKind==='tool'?arm.frames:arm.objects).map(n=><div key={n}><span><b>{n}</b>{(frameKind==='tool'?arm.tool:arm.object)===n&&<span className="state">使用中</span>}</span><button disabled={!writable} onClick={()=>{update(selected,{[frameKind==='tool'?'tool':'object']:n});log(selected,`${n} 已激活（演示）`);}}>激活</button></div>)}</div><h3>新增 / 更新{frameKind==='tool'?'工具':'工件'}坐标系</h3><p className="muted small">相对{frameKind==='tool'?'本臂法兰':chains[selected].base}定义 · 长度 mm</p><Field label="名称" value={arm.frameName} onChange={v=>update(selected,{frameName:v})}/><div className="pose-grid">{arm.framePose.map((v,i)=><Field key={i} label={['X','Y','Z','qx','qy','qz','qw'][i]} unit={i<3?'mm':undefined} type="number" step="0.01" value={v} onChange={v=>editArray('framePose',i,v)}/>)}</div><button className="primary" disabled={!writable} onClick={()=>{if(!/^[A-Za-z0-9_.-]{1,64}$/.test(arm.frameName)||!arm.framePose.every(v=>v!==''&&Number.isFinite(Number(v)))||Math.hypot(...arm.framePose.slice(3).map(Number))<1e-9){setNotice('请填写有效名称、有限数值和非零四元数');return;}const key=frameKind==='tool'?'frames':'objects';update(selected,{[key]:[...new Set([...arm[key],arm.frameName])],[frameKind==='tool'?'toolFrames':'objectFrames']:{...arm[frameKind==='tool'?'toolFrames':'objectFrames'],[arm.frameName]:frameDefinition(arm.framePose)}});log(selected,`${arm.frameName} 已更新（示例内存），未激活`);}}>保存坐标定义</button><div className="settings-bottom"><p className="muted small">坐标定义与文件持久化分开操作。</p><button disabled={!writable} onClick={()=>log(selected,'本臂 frames 文件已保存（演示）')}>保存至文件</button><button disabled={!writable} onClick={()=>{update(selected,{samples:Array(6).fill(false),result:false,saved:false,activated:false});log(selected,'本臂坐标重新加载（演示）；原标定会话已清除');}}>重新加载</button></div></section><section className="settings-panel"><div className="panel-title"><h2>{names[selected]}负载</h2><span className="muted">工具末端</span></div><Field label="质量" unit="kg" type="number" min="0" value={arm.load[0]} onChange={v=>editArray('load',0,v)}/><h3>质心位置</h3><div className="parameters">{['X','Y','Z'].map((n,i)=><Field key={n} label={n} unit="mm" type="number" value={arm.load[i+1]} onChange={v=>editArray('load',i+1,v)}/>)}</div><p className="muted">质量与质心分别归属当前臂；质心使用法兰坐标系，界面 mm 在请求时换算为 m。</p><div className="button-row"><button disabled={!writable} onClick={()=>{if(!arm.load.every(v=>v!==''&&Number.isFinite(Number(v)))||Number(arm.load[0])<0){setNotice('质量不能为负数，质心必须为有限数值');return;}log(selected,'负载参数已应用（演示），未写入文件');}}>应用负载参数</button><button disabled={!writable} onClick={()=>log(selected,'负载已保存至本臂默认文件（演示）')}>保存至文件</button></div><div className="context-note"><h3>修改条件</h3><p>本臂持有控制权，且处于 IDLE / STOPPED。另一臂仍可独立执行。</p></div></section></div>}
    {page==='model'&&<ModelResources live={live} model={model} arms={arms} selected={selected} chains={chains}/>}
    {page==='logs' && <><LogConsole logs={logs} initialScope={live?selected:'all'}/><details className="dual-log-demo"><summary>{live?'页面请求记录':'本地预案操作'} · {events.length} 条</summary><p className="muted small">{live?'包含请求失败与网络错误；控制器运行日志见上方。':'以下仅为浏览器演示记录，不属于控制器日志。'}</p><div className="log-table">{events.map((e,i)=><div className="log-row" key={i}><span className="num">{e.time}</span><b>{names[e.side]}</b><span>{esc(e.text)}</span></div>)}</div></details></>}

    <footer><span>{page==='logs'?'ROCOS 双臂诊断 · 只读':`ROCOS 双臂 · ${names[selected]} · ${live?chains[selected].base:baseDescription}`}</span><span>{t('dual.softwareStop')} · {t('dual.independent')}</span></footer>
    </main></div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
