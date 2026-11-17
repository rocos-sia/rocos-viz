import React from 'react';
import { displayPose } from '../../../src/core/DisplayPose';
import { FRAME } from '../../../src/core/constants';
import { useUnits, useUnitStore } from '../../../src/stores/unitStore';

const sides = ['left', 'right'];
const names = { left: '左臂', right: '右臂' };
export function previewState(arm, flange) {
  return { flange, active_tool_frame_name: arm.tool,
    active_tool_frame: arm.toolFrames[arm.tool] ?? null,
    active_object_frame_name: arm.object,
    active_object_frame: arm.objectFrames[arm.object] ?? null };
}
export default function Feedback({ arms, poses, frames, onFrame }) {
  const units = useUnits();
  const prefs = useUnitStore();
  return <section className="feedback-panel compact-feedback" aria-label="双臂关节与笛卡尔反馈">
    <div className="feedback-heading"><h2>双臂反馈</h2><span className="muted">URDF 预览 · 基坐标系 · RPY / ZYX</span><div className="feedback-units"><label>长度<select aria-label="反馈长度单位" value={prefs.isMM ? 'mm' : 'm'} onChange={e => prefs.setUnits({ isMM: e.target.value === 'mm' })}><option>mm</option><option>m</option></select></label><label>角度<select aria-label="反馈角度单位" value={prefs.isDegree ? 'deg' : 'rad'} onChange={e => prefs.setUnits({ isDegree: e.target.value === 'deg' })}><option>deg</option><option>rad</option></select></label></div></div>
    <div className="feedback-scroll" tabIndex={0} role="region" aria-label="双臂反馈表，可横向滚动"><table className="joint-matrix feedback-table"><thead><tr><th scope="col">臂</th>{Array.from({length:7}, (_,i)=><th scope="col" key={i}>J{i+1}<small>{units.angle.label}</small></th>)}<th scope="col" className="pose-divider">位姿</th>{['X','Y','Z','RX','RY','RZ'].map((axis,i)=><th scope="col" key={axis}>{axis}<small>{i<3 ? units.length.label : units.angle.label}</small></th>)}</tr></thead><tbody>{sides.map(side=>{
      const arm = arms[side];
      const pose = arm.online ? displayPose(frames[side], previewState(arm, poses[side])) : null;
      return <tr key={side} data-arm={side}><th scope="row"><i className={`arm-dot ${side}`}/>{names[side]}</th>{arm.q.map((q,i)=><td key={i}>{arm.online ? (q*Math.PI/180*units.angle.factor).toFixed(prefs.isDegree?1:3) : '—'}</td>)}<td className="pose-divider"><select aria-label={`${names[side]}反馈坐标系`} value={frames[side]} onChange={e=>onFrame(side,Number(e.target.value))}><option value={FRAME.FLANGE}>法兰</option><option value={FRAME.TOOL}>工具</option><option value={FRAME.OBJECT}>工件</option></select></td>{Array.from({length:6},(_,i)=><td className="pose-value" key={i}>{pose ? (pose[i]*(i<3?units.length.factor:units.angle.factor)).toFixed(3) : '—'}</td>)}</tr>;
    })}</tbody></table></div>
  </section>;
}
