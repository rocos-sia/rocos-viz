import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Scene from './Scene';
import Feedback from './Feedback';
import { FRAME } from '../../../src/core/constants';
import { useUnits } from '../../../src/stores/unitStore';
import './style.css';
import LogConsole from '../../../src/dualarm/logs/LogConsole';
import { useDualArmLogs } from '../../../src/dualarm/logs/useDualArmLogs';

const names = { left: '左臂', right: '右臂' };
const pages = [['teach','手动示教'],['tools','工具与标定'],['frames','坐标与负载'],['model','模型资源'],['logs','控制器日志']];
const sampleFrame = (x=0,y=0,z=0) => ({ position:{x,y,z}, orientation:{x:0,y:0,z:0,w:1} });
const frameDefinition = values => ({ position:{x:Number(values[0])/1000,y:Number(values[1])/1000,z:Number(values[2])/1000}, orientation:{x:Number(values[3]),y:Number(values[4]),z:Number(values[5]),w:Number(values[6])} });
const initial = side => ({ toolFrames: {TCP_01:sampleFrame(0,0,.1),probe_package:sampleFrame(.02,.01,.13)}, objectFrames:{Workpiece_01:sampleFrame(.4,side==='left'?.2:-.2,0)}, q: [0, -20, 0, -35, 0, 20, 0].map(v => side === 'right' ? -v : v), target: Array(7).fill(0), owned: side === 'left', enabled: side === 'left', online: true, state: 'STOPPED', tool: 'TCP_01', object: 'Workpiece_01', samples: Array(6).fill(false), result: false, saved: false, activated: false, calibrationTool: 'TCP_01', tolerance: '1.0', revision: 1, generation: 0, sessionGeneration: 0, jogVelocity: '0.10', velocity: '0.10', acceleration: '0.30', jerk: '5.0', pose: ['400','0','350','0','0','0','1'], load: ['0.0','0.0','0.0','0.0'], framePose: ['0','0','100','0','0','0','1'], frameName: 'TCP_02', frames: ['TCP_01','probe_package'], objects: ['Workpiece_01'] });
const esc = value => String(value);
function Icon({type}) { const paths = { teach: 'M4 18V8l8-5 8 5v10l-8 4-8-4Zm0-10 8 5 8-5M12 13v9', tools:'m14 5 5 5M3 21l8-8m1-9a6 6 0 0 0 7 8l-8 8a3 3 0 0 1-4-4l8-8a6 6 0 0 0-3-4Z', frames:'M4 20V4m0 16h16M4 20 17 7M2 6l2-2 2 2m12 12 2 2-2 2m-3-15h2v2', model:'m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10', logs:'M5 3h14v18H5V3Zm4 5h6M9 12h6m-6 4h4' }; return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.teach}/></svg>; }
function Field({label, value, onChange, unit, ...props}) { return <label className="field"><span>{label}{unit && <small>{unit}</small>}</span><input value={value} onChange={e => onChange(e.target.value)} {...props}/></label>; }
function SpeedSlider({label, value, onChange, unit, max = 0.5, disabled = false}) {
  const id = React.useId();
  return <div className="speed-control"><div className="speed-label"><label htmlFor={id}>{label}</label><output htmlFor={id} className="num">{Number(value).toFixed(2)} <small>{unit}</small></output></div><input id={id} type="range" min="0.01" max={max} step="0.01" value={value} disabled={disabled} aria-valuetext={`${Number(value).toFixed(2)} ${unit}`} onChange={e=>onChange(e.target.value)}/><div className="speed-scale"><span>低速 · 0.01</span><span>{max.toFixed(2)} · 演示上限</span></div></div>;
}
function App() {
  const logs = useDualArmLogs();
  const units = useUnits();
  const [poses,setPoses] = useState({left:null,right:null});
  const [displayFrames,setDisplayFrames] = useState({left:FRAME.FLANGE,right:FRAME.FLANGE});
  const receivePose = useCallback(next=>setPoses(prev=>JSON.stringify(prev)===JSON.stringify(next)?prev:next),[]);
  const [arms, setArms] = useState({left: initial('left'), right: initial('right')});
  const [selected, setSelected] = useState('left'), [page, setPage] = useState(location.hash === '#logs' ? 'logs' : 'teach');
  const [mode, setMode] = useState('jog'), [jogMode, setJogMode] = useState('joint'), [motion, setMotion] = useState('movej');
  const [frame, setFrame] = useState('BASE'), [frameKind, setFrameKind] = useState('tool');
  const [notice, setNotice] = useState(''), [scenario, setScenario] = useState('normal');
  const [events, setEvents] = useState([{time:'示例', side:'left', text:'已取得左臂控制权，等待操作'}, {time:'示例', side:'right',text:'右臂只读，可独立申请控制权'}]);
  const [menu, setMenu] = useState(false);
  const active = useRef(null), current = useRef(arms); current.current = arms;
  const arm = arms[selected], owned = arm.online && arm.owned, idle = arm.state === 'STOPPED', writable = owned && idle, movable = writable && arm.enabled;
  const jogSpeed = arm.jogVelocity;
  const update = (side, values) => setArms(prev => ({...prev, [side]: {...prev[side], ...values}}));
  const log = (side, text) => { setEvents(prev => [{side,text,time:new Date().toLocaleTimeString('zh-CN',{hour12:false})},...prev].slice(0,60)); setNotice(`${names[side]} · ${text}`); };
  function stopJog() {
    const held = active.current; if (!held) return;
    active.current = null; update(held.side,{state:'STOPPED'}); log(held.side, '点动已停止（演示）');
  }
  useEffect(() => {
    const stop = () => stopJog();
    const visibility = () => { if (document.hidden) stopJog(); };
    window.addEventListener('blur', stop); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(() => {
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
  function navigate(next) { stopJog(); setPage(next);history.replaceState(null, '', next==='logs'?'#logs':location.pathname); setNotice(''); setMenu(false); window.scrollTo(0,0); }
  function action(side, kind) {
    const a = current.current[side];
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
    const speed = Number(jogSpeed); if (!Number.isFinite(speed) || speed <= 0 || speed > .5) { setNotice('点动速度需大于 0 且不超过演示上限 0.5'); return; }
    if (event.type === 'keydown' && (![' ','Enter'].includes(event.key) || event.repeat)) return;
    event.preventDefault(); if (event.pointerId !== undefined) event.currentTarget.setPointerCapture(event.pointerId);
    active.current = {side:selected,index,sign,speed,kind:jogMode}; update(selected,{state:'JOGGING'});
    log(selected, `${jogMode === 'joint' ? `J${index+1}` : jogMode === 'cartesian' ? ['X','Y','Z','Rx','Ry','Rz'][index] : jogMode} ${sign > 0 ? '+' : '−'} 点动演示${jogMode === 'joint' ? '' : '；仅演示按住/松开流程，未求解位姿'}`);
  }
  function move() {
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
  return <div className="app-shell">
    <aside className={`sidebar ${menu?'open':''}`}><a className="brand" href="#teach" onClick={()=>navigate('teach')}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25V7h12a6 6 0 0 1 0 12H5m12 0 9 8"/></svg><span>ROCOS<small>双臂工作站</small></span></a><span className="nav-label">工作空间</span><nav>{pages.map(([id,label])=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon type={id}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="workspace-mark"><Icon type="model"/><b>MuJoCo DualArm</b></div><p>一个工作站，两臂独立执行</p><span className="muted">页面预案 / 协议 0.4.0-local</span></div></aside>
    <div className="workspace">
    {page!=='logs'&&<section className="arm-strip" aria-label="左右臂状态与独立操作">{['left','right'].map(side=>{const a=arms[side];return <div key={side} className={`arm-summary ${side} ${selected===side?'selected':''}`}>
      <div className="arm-summary-top"><button className="arm-select" aria-pressed={selected===side} onClick={()=>choose(side)}><i className={`arm-dot ${side}`}/><strong>{names[side]}</strong><span className="muted">{side==='left'?'L · 主站 0':'R · 主站 1'}</span></button><span className="state machine-state" title={a.state==='RUNNING'?'运动中':a.state==='JOGGING'?'点动中':a.state==='PAUSED'?'已暂停':'已停止'}>状态机 <b>{a.online?a.state:'—'}</b></span><span className={`state ${a.online&&a.enabled?'good':''}`}>{!a.online?'反馈过期':a.enabled?'已使能':'未使能'}</span><span className="owner">{a.owned?'已获控制权':'只读'}</span></div>
      <div className="arm-summary-bottom"><div className="arm-tools"><span title="当前工具">{a.tool||'无工具'}</span><button aria-label={`${names[side]}管理工具`} onClick={()=>{choose(side);navigate('tools');}}>管理工具</button></div><div className="button-row"><button disabled={!a.online} onClick={()=>action(side,a.owned?'release':'acquire')}>{a.owned?'释放':'申请控制权'}</button><button disabled={!a.online||!a.owned||a.state!=='STOPPED'} onClick={()=>action(side,'enable')}>{a.enabled?'下使能':'使能'}</button><button className="danger" disabled={!a.online||!a.owned} onClick={()=>action(side,'stop')}>停止{names[side]}</button></div></div>
    </div>;})}</section>}
<header className="topbar"><button className="menu-button" aria-expanded={menu} onClick={()=>setMenu(!menu)}>菜单</button><h1>{pages.find(([id])=>id===page)[1]}</h1><div className="demo-label">{page==='logs'?'只读日志 · 可连接控制器':'运动预案 · 示例数据'}</div>{page!=='logs'&&<label className="scenario">状态演示<select value={scenario} onChange={e=>scenarioChange(e.target.value)}><option value="normal">正常</option><option value="offline">当前臂失联</option><option value="expired">当前臂控制权过期</option><option value="invalid">工具安装发生变化</option><option value="empty">工具列表为空</option></select></label>}</header>
    <main className={page==='teach'?'teach-page':''}>
    {page!=='logs'&&<div className="notice" role="status">{notice}</div>}
    {page==='teach' && <><div className="teach-grid"><div className="view-column"><Scene arms={arms} selected={selected} onPose={receivePose}/></div>
    <section className="control-panel"><div className="panel-title"><h2><i className={`arm-dot ${selected}`}/>{names[selected]}操作</h2><div className="segmented">{['left','right'].map(s=><button key={s} aria-pressed={selected===s} onClick={()=>choose(s)}>{names[s]}</button>)}</div></div><div className="tabs">{[['jog','点动控制'],['motion','精确运动']].map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>{stopJog();setMode(id);}}>{label}</button>)}</div>
    {!movable && <p className="inline-hint">{!arm.online?'反馈已过期，等待重新连接。':!arm.owned?'先申请当前臂控制权，再使能。':!arm.enabled?'已持有控制权，请使能当前臂。':`当前${arm.state}，可独立停止本臂。`}</p>}
    {mode==='jog'?<><div className="form-row"><label className="field"><span>点动方式</span><select value={jogMode} onChange={e=>{stopJog();setJogMode(e.target.value);}}><option value="joint">关节点动</option><option value="cartesian">笛卡尔点动</option><option value="nullspace">零空间点动</option><option value="svd">SVD 维度点动</option></select></label><label className="field"><span>参考坐标系</span><select value={frame} disabled={jogMode!=='cartesian'} onChange={e=>{stopJog();setFrame(e.target.value);}}>{['BASE','FLANGE','TOOL','OBJECT'].map((v,i)=><option key={v} value={v}>{['基座','法兰','工具','工件'][i]}</option>)}</select></label></div><div className="jog-speed"><SpeedSlider label="点动速度" unit={jogMode==='cartesian'?'平移 m/s · 转动 rad/s':'rad/s'} value={jogSpeed} onChange={v=>{stopJog();update(selected,{jogVelocity:v});}}/></div><div className="jog-heading"><span>按住运动，松开停止</span><span className="muted">{jogMode==='joint'?`当前位置 ${units.angle.label}`:'方向输入'}</span></div><div className="jog-list">{(jogMode==='cartesian'?['X','Y','Z','Rx','Ry','Rz']:jogMode==='svd'?['维度 1']:Array.from({length:7},(_,i)=>`J${i+1}`)).map((name,i)=><div className="jog-row" key={name}><button className="jog-button" aria-label={`${names[selected]} ${name} 负向点动`} disabled={!movable && !(arm.state==='JOGGING'&&owned)} onPointerDown={e=>startJog(e,i,-1)} onPointerUp={stopJog} onLostPointerCapture={stopJog} onKeyDown={e=>startJog(e,i,-1)} onKeyUp={e=>{if([' ','Enter'].includes(e.key))stopJog();}} onBlur={stopJog}>−</button><div><b>{name}</b>{jogMode==='joint'&&<span className="num">{arm.online?(arm.q[i]*Math.PI/180*units.angle.factor).toFixed(2):'—'}<small> {units.angle.label}</small></span>}</div><button className="jog-button" aria-label={`${names[selected]} ${name} 正向点动`} disabled={!movable && !(arm.state==='JOGGING'&&owned)} onPointerDown={e=>startJog(e,i,1)} onPointerUp={stopJog} onLostPointerCapture={stopJog} onKeyDown={e=>startJog(e,i,1)} onKeyUp={e=>{if([' ','Enter'].includes(e.key))stopJog();}} onBlur={stopJog}>+</button></div>)}</div>{jogMode!=='joint'&&<p className="muted small">本地流程演示，未执行位姿求解。</p>}</>:<><label className="field"><span>运动类型</span><select value={motion} onChange={e=>setMotion(e.target.value)}><option value="movej">MoveJ · 关节目标</option><option value="movej_ik">MoveJ_IK · 位姿目标</option><option value="movel">MoveL · 直线位姿</option><option value="movel_fk">MoveL_FK · 关节终点直线</option></select></label><div className="motion-speed"><SpeedSlider label="运动速度" unit={['movel','movel_fk'].includes(motion)?'m/s':'rad/s'} value={arm.velocity} onChange={v=>update(selected,{velocity:v})} disabled={!idle}/></div>{['movej','movel_fk'].includes(motion)?<><div className="joint-target-header"><span>目标角度 · °</span><button className="text-button" onClick={()=>update(selected,{target:[...arm.q]})}>填入当前反馈</button></div><div className="target-grid">{arm.target.map((v,i)=><Field key={i} label={`J${i+1}`} value={v} onChange={v=>editArray('target',i,v)} type="number" step="0.1"/>)}</div></>:<><p className="muted small">目标位姿 · 基座坐标系 / 四元数</p><div className="pose-grid">{arm.pose.map((v,i)=><Field key={i} label={['X','Y','Z','qx','qy','qz','qw'][i]} unit={i<3?'mm':undefined} value={v} onChange={v=>editArray('pose',i,v)} type="number" step="0.01"/>)}</div></>}<div className="parameters motion-parameters">{[['acceleration','加速度',['movel','movel_fk'].includes(motion)?'m/s²':'rad/s²'],['jerk','加加速度',['movel','movel_fk'].includes(motion)?'m/s³':'rad/s³']].map(([key,label,unit])=><Field key={key} label={label} unit={unit} type="number" min="0.01" step="0.1" value={arm[key]} onChange={v=>update(selected,{[key]:v})}/>)}</div><button className="primary wide" disabled={!movable} onClick={move}>下发{names[selected]} {motion.toUpperCase()}</button><p className="muted small">指令受理后检查反馈到位；超时不自动重发。</p></>}
    <div className="control-footer"><button disabled={!owned||!['RUNNING','PAUSED'].includes(arm.state)} onClick={()=>action(selected,arm.state==='PAUSED'?'resume':'pause')}>{arm.state==='PAUSED'?'继续':'暂停'}{names[selected]}</button><button disabled={!writable} onClick={()=>action(selected,'reset')}>复位{names[selected]}</button></div></section></div><Feedback arms={arms} poses={poses} frames={displayFrames} onFrame={(side,value)=>setDisplayFrames(prev=>({...prev,[side]:value}))}/></>}
    {page==='tools' && <div className="tools-grid"><section className="tool-list"><div className="panel-title"><h2>{names[selected]}工具</h2><span className="muted">{arm.frames.length} 个</span></div>{arm.frames.length?arm.frames.map(n=><button className={`tool-row ${arm.calibrationTool===n?'selected':''}`} key={n} onClick={()=>update(selected,{calibrationTool:n,samples:Array(6).fill(false),result:false,saved:false,activated:false})}><span><b>{n}</b><small>{n==='probe_package'?'已配置工具包':'普通 TCP'}</small></span>{arm.tool===n?<span className="state good">使用中</span>:<span>查看</span>}</button>):<p>尚无工具。先在坐标与负载中新增。</p>}<button className="wide" onClick={()=>navigate('frames')}>管理工具坐标系</button><div className="tool-details"><h3>{packageTool?'工具包安装':'工具坐标系'}</h3><dl><dt>所属臂</dt><dd>{names[selected]}</dd><dt>当前工具</dt><dd>{arm.tool||'—'}</dd><dt>类型</dt><dd>{packageTool?'已配置工具包':'普通 TCP'}</dd>{packageTool&&<><dt>包版本</dt><dd>1.0.0（示例）</dd><dt>安装 revision</dt><dd>{arm.revision}</dd><dt>安装平移</dt><dd>20 / 10 / 30 mm</dd><dt>包摘要</dt><dd>示例包 · 未连接</dd></>}</dl><p className="muted small">{packageTool?'标定只更新本机局部 TCP；保留安装位姿与原始包资源。':'六点结果为法兰到工具的完整位姿。'}</p></div><p className="muted small">本版支持已配置工具包的标定，工具包导入、导出与安装管理未开放。</p></section>
    <section className="calibration"><div className="panel-title"><h2>六点工具标定 <span className="muted">/ {names[selected]}</span></h2><span className="state">{arm.samples.filter(Boolean).length} / 6 点</span></div><div className="form-row"><label className="field"><span>目标工具</span>{toolSelect}</label><Field label="最大允许误差" unit="mm" type="number" min="0.01" max="50" step="0.1" value={arm.tolerance} onChange={v=>update(selected,{tolerance:v,result:false,saved:false,activated:false})}/></div><div className="calibration-guide"><b>固定点 → 工具 +X → 工具 +Z</b><p>P1–P4：工具尖端保持同一固定点，改变法兰姿态。P5、P6 保持 P4 姿态，分别沿工具 +X、+Z 移动至少 1 mm。</p></div>{stale && <p className="error-note">控制权已变更。原会话只读，请重新采集 P1 开始新会话。</p>}<div className="sample-list">{['固定点 · 姿态一','固定点 · 姿态二','固定点 · 姿态三','固定点 · 方向参考','工具 +X 方向','工具 +Z 方向'].map((text,i)=><div className="sample-row" key={i}><span className={`sample-number ${arm.samples[i]?'captured':''}`}>P{i+1}</span><div><b>{text}</b><small>{arm.samples[i]?'已记录示例采点':i<4?'尖端对准同一个固定点':'保持 P4 姿态，沿指定方向平移'}</small></div><span className="muted">{arm.samples[i]?'已采集':'待采集'}</span><button disabled={!writable||!arm.calibrationTool||(i>0&&(!arm.samples[0]||stale))} onClick={()=>capture(i)}>{arm.samples[i]?'重新采集':'采集此点'}</button></div>)}</div><div className="calculation-actions"><p className="muted small">真实接入时只采集控制器反馈；计算不会运动、保存或激活工具。</p><button className="primary" disabled={!writable||stale||!arm.samples.every(Boolean)} onClick={()=>{const t=Number(arm.tolerance);if(!Number.isFinite(t)||t<=0||t>50){setNotice('允许误差应大于 0 且不超过 50 mm');return;} if(t<.06){update(selected,{result:false,saved:false,activated:false});log(selected,'示例最大误差 0.060 mm 超过阈值；请重采或调整阈值');return;}update(selected,{result:true,saved:false,activated:false});log(selected,'示例计算完成；尚未保存');}}>计算 TCP</button></div><div className="result-panel"><div className="panel-title"><h3>标定结果</h3><span className="state">{arm.saved?(arm.activated?'已保存 · 已激活':'已保存 · 待明确激活'):arm.result?'已计算 · 未保存':'等待计算'}</span></div>{arm.result?<><div className="result-metrics"><div><span>RMS 误差</span><b>0.025 <small>mm</small></b></div><div><span>最大误差</span><b>0.060 <small>mm</small></b></div><div><span>条件数</span><b>18.4</b></div><div><span>轴夹角</span><b>89.8 <small>°</small></b></div></div><p>法兰 TCP（示例）：X 15.00 / Y −10.00 / Z 100.00 mm</p><p className="muted small">以上为页面示例结果，未执行六点求解。{packageTool?'保存时由服务端转换为包局部 TCP。':''}</p></>:<p className="muted">采齐六点后计算。重采任一点会清除原结果。</p>}<div className="button-row"><button disabled={!writable||stale||!arm.result||arm.saved} onClick={()=>{update(selected,{saved:true,toolFrames:{...arm.toolFrames,[arm.calibrationTool]:sampleFrame(.015,-.01,.1)},revision:packageTool?arm.revision+1:arm.revision});log(selected,'标定结果已保存到本臂（演示），未自动激活');}}>保存到{names[selected]}</button><button disabled={!writable||!arm.saved||stale} onClick={()=>{update(selected,{tool:arm.calibrationTool,activated:true});log(selected,`${arm.calibrationTool} 已明确激活（演示）`);}}>激活此工具</button></div></div></section></div>}
    {page==='frames' && <div className="settings-grid"><section className="settings-panel"><div className="panel-title"><h2>{names[selected]}坐标系</h2><div className="segmented">{[['tool','工具'],['object','工件']].map(([id,name])=><button key={id} aria-pressed={frameKind===id} onClick={()=>setFrameKind(id)}>{name}</button>)}</div></div><div className="frame-list">{(frameKind==='tool'?arm.frames:arm.objects).map(n=><div key={n}><span><b>{n}</b>{(frameKind==='tool'?arm.tool:arm.object)===n&&<span className="state">使用中</span>}</span><button disabled={!writable} onClick={()=>{update(selected,{[frameKind==='tool'?'tool':'object']:n});log(selected,`${n} 已激活（演示）`);}}>激活</button></div>)}</div><h3>新增 / 更新{frameKind==='tool'?'工具':'工件'}坐标系</h3><Field label="名称" value={arm.frameName} onChange={v=>update(selected,{frameName:v})}/><div className="pose-grid">{arm.framePose.map((v,i)=><Field key={i} label={['X','Y','Z','qx','qy','qz','qw'][i]} unit={i<3?'mm':undefined} type="number" step="0.01" value={v} onChange={v=>editArray('framePose',i,v)}/>)}</div><button className="primary" disabled={!writable} onClick={()=>{if(!/^[A-Za-z0-9_.-]{1,64}$/.test(arm.frameName)||!arm.framePose.every(v=>v!==''&&Number.isFinite(Number(v)))||Math.hypot(...arm.framePose.slice(3).map(Number))<1e-9){setNotice('请填写有效名称、有限数值和非零四元数');return;}const key=frameKind==='tool'?'frames':'objects';update(selected,{[key]:[...new Set([...arm[key],arm.frameName])],[frameKind==='tool'?'toolFrames':'objectFrames']:{...arm[frameKind==='tool'?'toolFrames':'objectFrames'],[arm.frameName]:frameDefinition(arm.framePose)}});log(selected,`${arm.frameName} 已更新（示例内存），未激活`);}}>保存坐标定义</button><div className="settings-bottom"><p className="muted small">坐标定义与文件持久化分开操作。</p><button disabled={!writable} onClick={()=>log(selected,'本臂 frames 文件已保存（演示）')}>保存至文件</button><button disabled={!writable} onClick={()=>{update(selected,{samples:Array(6).fill(false),result:false,saved:false,activated:false});log(selected,'本臂坐标重新加载（演示）；原标定会话已清除');}}>重新加载</button></div></section><section className="settings-panel"><div className="panel-title"><h2>{names[selected]}负载</h2><span className="muted">工具末端</span></div><Field label="质量" unit="kg" type="number" min="0" value={arm.load[0]} onChange={v=>editArray('load',0,v)}/><h3>质心位置</h3><div className="parameters">{['X','Y','Z'].map((n,i)=><Field key={n} label={n} unit="mm" type="number" value={arm.load[i+1]} onChange={v=>editArray('load',i+1,v)}/>)}</div><p className="muted">质量与质心分别归属当前臂；质心使用法兰坐标系，界面 mm 在请求时换算为 m。</p><div className="button-row"><button disabled={!writable} onClick={()=>{if(!arm.load.every(v=>v!==''&&Number.isFinite(Number(v)))||Number(arm.load[0])<0){setNotice('质量不能为负数，质心必须为有限数值');return;}log(selected,'负载参数已应用（演示），未写入文件');}}>应用负载参数</button><button disabled={!writable} onClick={()=>log(selected,'负载已保存至本臂默认文件（演示）')}>保存至文件</button></div><div className="context-note"><h3>修改条件</h3><p>本臂持有控制权，且处于 IDLE / STOPPED。另一臂仍可独立执行。</p></div></section></div>}
    {page==='model' && <div className="model-grid"><Scene arms={arms} selected={selected}/><section className="settings-panel"><div className="panel-title"><h2>共享模型资源</h2><span className="state">本地已加载</span></div><dl><dt>模型</dt><dd>dualarm.urdf</dd><dt>来源</dt><dd>config/dualarm</dd><dt>资源</dt><dd>15 个 STL / 14 个运动关节</dd><dt>左臂</dt><dd>Left_Joint1…7</dd><dt>右臂</dt><dd>Right_Joint1…7</dd><dt>获取方式</dt><dd>工作站下载一次，两臂共用</dd></dl><a className="button primary" href="./model/urdf/dualarm.urdf" download="dualarm.urdf">下载双臂 URDF</a><p className="muted small">下载的是 URDF 文件，网格资源需一并保存；它不是包含所有网格的模型包。</p><details><summary>网格资源 · 15 个文件</summary><div className="mesh-links">{['base_link',...['Left','Right'].flatMap(s=>Array.from({length:7},(_,i)=>`${s}_Link${i+1}`))].map(n=><a key={n} href={`./model/meshes/${n}.STL`} download>{n}.STL</a>)}</div></details><div className="context-note"><h3>控制器接入</h3><p>正式页面通过工作站模型清单解析运动链与资源，按模型版本缓存；左右状态分别更新对应关节。</p><p>两臂快照时间分别保留，不显示为同一时刻的同步采样。</p></div></section></div>}
    {page==='logs' && <><LogConsole logs={logs}/><details className="dual-log-demo"><summary>本地预案操作 · {events.length} 条</summary><p className="muted small">以下仅为浏览器演示记录，不属于控制器日志。</p><div className="log-table">{events.map((e,i)=><div className="log-row" key={i}><span className="num">{e.time}</span><b>{names[e.side]}</b><span>{esc(e.text)}</span></div>)}</div></details></>}

    <footer><span>{page==='logs'?'ROCOS 双臂诊断 · 只读':`ROCOS 双臂 · ${names[selected]}为当前操作臂`}</span><span>软件停止不等同硬件急停 · 两臂各自执行，无同步启动承诺</span></footer>
    </main></div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
