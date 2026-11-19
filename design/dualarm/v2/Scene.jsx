import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { createRobotVisuals } from '../../../src/scene/RobotVisuals';
import { poseMatrix, previewFlange } from '../../../src/dualarm/scene/frames';
import { preciseReference } from '../../../src/core/PreciseMotion';
import { FRAME } from '../../../src/core/constants';
import { previewState } from './Feedback';
import { chains as demoChains, modelFile, shoulderTrial as demoShoulder } from './profile';
import { useT } from '../../../src/i18n/useT';
import { useUIStore } from '../../../src/stores/uiStore';

const defaults = { grid:true, world:false, base:true, flange:true, tool:false, object:false,
  showJointFrames:false, showJointAxes:false, showTransparent:false, trajectory:false, labels:true, scope:'both' };
const names = {left:'左臂',right:'右臂'};
const optionsList = [['world','场景原点'],['base','基坐标系'],['flange','法兰坐标系'],['tool','工具 TCP'],['object','工件坐标系'],['showJointFrames','关节坐标系'],['showJointAxes','关节正方向'],['showTransparent','透明模型'],['trajectory','TCP 轨迹'],['labels','坐标名称']];
function release(root) {
  const geometry = new Set(), materials = new Set();
  root.traverse(n => { if(n.geometry) geometry.add(n.geometry); if(n.material) (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>materials.add(m)); });
  geometry.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
}
function frameMarker(label, host) {
  const group = new THREE.Group();
  for(const [direction,color] of [[new THREE.Vector3(1,0,0),0xef4444],[new THREE.Vector3(0,1,0),0x22c55e],[new THREE.Vector3(0,0,1),0x3b82f6]]) {
    const arrow = new THREE.ArrowHelper(direction,new THREE.Vector3(),.13,color,.025,.012);
    arrow.traverse(n=>{if(n.material){n.material.depthTest=false;n.material.depthWrite=false;n.renderOrder=1001;}});
    group.add(arrow);
  }
  group.matrixAutoUpdate=false;
  const tag=document.createElement('span');tag.className='coordinate-label';tag.textContent=label;host.appendChild(tag);
  return {group,tag};
}
export default function Scene({ arms, selected, onPose, model=null }) {
  const t = useT(), language = useUIStore(state => state.language);
  const storageKey = `rocos.dualarm.scene.v1:${model?.revision || modelFile}`;
  const readView = () => { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } };
  const chains = model ? Object.fromEntries(model.arms.map(a=>[a.arm,{base:a.base_link,tip:a.tip_link}])) : demoChains;
  const shoulderTrial = model ? chains.left.base !== chains.right.base : demoShoulder;
  const host = useRef(null), panel = useRef(null), robot = useRef(null), view = useRef(null);
  const latest = useRef({arms,selected,onPose});latest.current={arms,selected,onPose};
  const [status,setStatus]=useState(t('dual.modelLoading')),[ready,setReady]=useState(false);
  const [options,setOptions]=useState(() => {
    const saved = readView()?.options;
    return Object.fromEntries(Object.entries(defaults).map(([key,value]) => [key, key === 'scope' ? (['both','left','right'].includes(saved?.[key]) ? saved[key] : value) : typeof saved?.[key] === 'boolean' ? saved[key] : value]));
  }),[error,setError]=useState('');
  const optionsRef=useRef(options);optionsRef.current=options;
  const change=(key,value)=>setOptions(prev=>({...prev,[key]:value}));
  useEffect(()=>{
    const el=host.current;
    let disposed=false,animation,visuals,loadedRoot;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#f8fafc');
    let renderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true});} catch {setStatus(t('dual.modelUnavailable'));return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label','双臂 URDF 模型，可拖动旋转及滚轮缩放');el.appendChild(renderer.domElement);
    const camera=new THREE.PerspectiveCamera(35,1,.01,100);camera.up.set(0,0,1);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
    const saveView = () => {
      if(!visuals)return;
      try { localStorage.setItem(storageKey, JSON.stringify({ options: optionsRef.current, position: camera.position.toArray(), target: controls.target.toArray(), aspect: camera.aspect })); } catch {}
    };
    controls.addEventListener('end', saveView);
    const ground=new THREE.GridHelper(3,30,'#c5cfda','#e3e8ee');ground.rotation.x=Math.PI/2;scene.add(ground);
    scene.add(new THREE.HemisphereLight(0xffffff,0x667788,1.7));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,-4,5);scene.add(light);
    const markers={};
    for(const [key,label] of [['world',t('dual.option.world')],['base',`${t('dual.base')} L / R`],['left-base',`L · ${t('dual.shoulder')}`],['right-base',`R · ${t('dual.shoulder')}`],...['left','right'].flatMap(s=>['flange','tool','object'].map(k=>[`${s}-${k}`,`${s==='left'?'L':'R'} · ${k==='flange'?t('dual.flange'):k==='tool'?'TCP':t('dual.object')}`]))]) {
      const marker=frameMarker(label,el);markers[key]=marker;scene.add(marker.group);marker.group.visible=false;
    }
    const trails={};
    for(const side of ['left','right']) {
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(1000*3),3));geometry.setDrawRange(0,0);
      const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:side==='left'?'#245ecb':'#176c67'}));line.frustumCulled=false;scene.add(line);trails[side]={line,points:[],tool:null};
    }
    let center=new THREE.Vector3(0,0,.3),size=1.6;
    function fitDistance(aspect) {
      const direction=camera.position.clone().sub(controls.target).normalize();
      const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
      const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*aspect;
      let distance=0;
      robot.current?.updateMatrixWorld(true);
      robot.current?.traverse(node=>{
        if(!node.userData.robotMesh)return;
        node.geometry.computeBoundingBox();const box=node.geometry.boundingBox;
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const delta=new THREE.Vector3(x,y,z).applyMatrix4(node.matrixWorld).sub(controls.target);
          distance=Math.max(distance,Math.abs(delta.dot(right))/tanH+delta.dot(direction),Math.abs(delta.dot(up))/tanV+delta.dot(direction));
        }
      });
      return distance;
    }
    function resizeView(previousAspect,nextAspect) {
      if(!visuals)return;
      const direction=camera.position.clone().sub(controls.target),distance=direction.length();
      const previousFit=fitDistance(previousAspect),nextFit=fitDistance(nextAspect);
      if(previousFit>0&&nextFit>0&&distance>0){camera.position.copy(controls.target).addScaledVector(direction.normalize(),distance*nextFit/previousFit);controls.update();}
    }
    function reset(preset='iso') {
      const direction=preset==='front'?new THREE.Vector3(1,0,.01):preset==='top'?new THREE.Vector3(0,-.001,1):preset==='side'?new THREE.Vector3(0,-1,.01):new THREE.Vector3(2.6,-1,1.4);
      direction.normalize();
      const points=[];
      robot.current?.updateMatrixWorld(true);
      robot.current?.traverse(node=>{
        if(!node.userData.robotMesh)return;
        node.geometry.computeBoundingBox();const box=node.geometry.boundingBox;
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(node.matrixWorld));
      });
      if(points.length)new THREE.Box3().setFromPoints(points).getCenter(center);
      camera.position.copy(center).add(direction);camera.lookAt(center);camera.updateMatrixWorld(true);
      const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
      const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;
      let distance=size;
      if(points.length)distance=Math.max(...points.map(point=>{
        const delta=point.clone().sub(center),depth=delta.dot(direction);
        return Math.max(Math.abs(delta.dot(right))/tanH,Math.abs(delta.dot(up))/tanV)+depth;
      }));
      camera.position.copy(center).addScaledVector(direction,distance*1.12);controls.target.copy(center);controls.update();
      saveView();
    }
    function sync() {
      if(!robot.current||!visuals) return;
      const loaded=robot.current,{arms:state,selected:active}=latest.current,o=optionsRef.current;
      for(const side of ['left','right']) state[side].q.forEach((q,i)=>loaded.setJointValue((model?.arms.find(a=>a.arm===side)?.joint_names[i] || `${side==='left'?'Left':'Right'}_Joint${i+1}`),q*Math.PI/180));
      loaded.updateMatrixWorld(true);
      loaded.traverse(n=>{if(n.isMesh&&n.userData.arm)n.material.emissive.set(n.userData.arm===active?'#15293a':'#000000');});
      visuals.update(o);
      loaded.traverse(n=>{if(n.name.startsWith('joint-frame:')||n.name.startsWith('joint-axis:')) {
        const side=n.name.includes('Left_')?'left':n.name.includes('Right_')?'right':null;
        if(o.scope!=='both'&&side!==o.scope)n.visible=false;
      }});
      ground.visible=o.grid;
      markers.world.group.visible=o.world&&(shoulderTrial||!o.base);
      markers.base.tag.textContent=o.world?`${t('dual.option.world')} / ${t('dual.base')} L / R`:`${t('dual.base')} L / R`;
      const base=loaded.links[chains.left.base];
      markers.base.group.visible=!shoulderTrial&&o.base&&!!base;
      if(base) markers.base.group.matrix.copy(base.matrixWorld);
      const poses={};
      for(const side of ['left','right']) {
        const arm=state[side],base=loaded.links[chains[side].base];
        const baseMarker=markers[`${side}-base`];
        baseMarker.group.visible=shoulderTrial&&o.base&&!!base&&(o.scope==='both'||o.scope===side);
        if(base)baseMarker.group.matrix.copy(base.matrixWorld);
        poses[side]=previewFlange(loaded,side,chains);
        const snapshot=previewState(arm,poses[side]);
        for(const [kind,frame] of [['flange',FRAME.FLANGE],['tool',FRAME.TOOL],['object',FRAME.OBJECT]]) {
          const marker=markers[`${side}-${kind}`],matrix=poseMatrix(preciseReference(frame,snapshot));
          marker.group.visible=!!(o[kind]&&arm.online&&matrix&&base&&(o.scope==='both'||o.scope===side));
          if(matrix&&base)marker.group.matrix.copy(base.matrixWorld).multiply(matrix);
          marker.tag.title=`${t(side==='left'?'dual.left':'dual.right')}${kind==='tool'?` · ${arm.tool}`:kind==='object'?` · ${arm.object}`:` · ${t('dual.flange')}`}`;
        }
        const trail=trails[side],tcp=poseMatrix(preciseReference(FRAME.TOOL,snapshot));
        if(trail.tool!==arm.tool||!arm.online){trail.points=[];trail.tool=arm.tool;trail.line.geometry.setDrawRange(0,0);}
        trail.line.visible=o.trajectory&&arm.online&&(o.scope==='both'||o.scope===side);
        if(o.trajectory&&arm.online&&tcp&&base) {
          const point=new THREE.Vector3().setFromMatrixPosition(base.matrixWorld.clone().multiply(tcp));
          if(!trail.points.length||trail.points.at(-1).distanceTo(point)>.0001) {
            trail.points.push(point);if(trail.points.length>1000)trail.points.shift();
            const attribute=trail.line.geometry.attributes.position;
            trail.points.forEach((p,i)=>attribute.setXYZ(i,p.x,p.y,p.z));attribute.needsUpdate=true;trail.line.geometry.setDrawRange(0,trail.points.length);
          }
        }
      }
      latest.current.onPose?.(poses);
    }
    view.current={reset,sync,clear:()=>{Object.values(trails).forEach(t=>{t.points=[];t.line.geometry.setDrawRange(0,0);});}};
    const manager=new THREE.LoadingManager();
    let failed=false;
    manager.onError=()=>{failed=true;if(!disposed)setStatus(t('dual.modelPartial'));};
    manager.onLoad=()=>{
      if(disposed){if(loadedRoot)release(loadedRoot);return;}
      if(!robot.current)return;
      const loaded=robot.current;
      loaded.traverse(node=>{
        if(!node.isMesh)return;
        let p=node,arm='';while(p){if(/Left_/.test(p.name))arm='left';if(/Right_/.test(p.name))arm='right';p=p.parent;}
        node.userData.robotMesh=true;node.userData.arm=arm;(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose());
        node.material=new THREE.MeshStandardMaterial({color:arm==='left'?'#7092b8':arm==='right'?'#759f98':'#9da9b3',metalness:.25,roughness:.65});
      });
      for(const side of ['left','right'])latest.current.arms[side].q.forEach((q,i)=>loaded.setJointValue((model?.arms.find(a=>a.arm===side)?.joint_names[i] || `${side==='left'?'Left':'Right'}_Joint${i+1}`),q*Math.PI/180));
      loaded.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(loaded);box.getCenter(center);size=box.getSize(new THREE.Vector3()).length();ground.position.z=box.min.z-.004;
      visuals=createRobotVisuals(loaded);sync();
      const saved = readView();
      const valid = values => Array.isArray(values) && values.length === 3 && values.every(value => Number.isFinite(value) && Math.abs(value) < 100000);
      if(valid(saved?.position)&&valid(saved?.target)&&new THREE.Vector3(...saved.position).distanceTo(new THREE.Vector3(...saved.target))>.01) {
        camera.position.fromArray(saved.position);controls.target.fromArray(saved.target);controls.update();
        if(Number.isFinite(saved.aspect)&&saved.aspect>0)resizeView(saved.aspect,camera.aspect);
      } else reset();
      setReady(!failed);if(!failed)setStatus(t(model?'dual.modelLive':'dual.modelDemo'));
    };
    if (model) manager.setURLModifier(url=>{
      const asset=model.assets.find(a=>new URL(a.path,new URL(model.urdf_url,location.origin)).href===new URL(url,location.origin).href);
      return asset ? `${model.mesh_url}?path=${encodeURIComponent(asset.path)}` : url;
    });
    const loader=new URDFLoader(manager);loader.parseCollision=false;
    loader.load(model ? new URL(model.urdf_url,location.origin).href : new URL(`./model/urdf/${modelFile}`,location.href).href,loaded=>{loadedRoot=loaded;if(disposed){release(loaded);return;}robot.current=loaded;scene.add(loaded);},undefined,()=>{if(!disposed)setStatus(t('dual.modelFailed'));});
    const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;resizeView(camera.aspect,aspect);renderer.setSize(width,height);camera.aspect=aspect;camera.updateProjectionMatrix();saveView();});observer.observe(el);
    const projected=new THREE.Vector3();
    function loop(){
      animation=requestAnimationFrame(loop);controls.update();scene.updateMatrixWorld(true);
      for(const marker of Object.values(markers)) {
        projected.setFromMatrixPosition(marker.group.matrixWorld).project(camera);
        const visible=optionsRef.current.labels&&marker.group.visible&&Math.abs(projected.x)<.97&&Math.abs(projected.y)<.95&&projected.z>-1&&projected.z<1;
        marker.tag.hidden=!visible;
        if(visible){
          const labelX=Math.max(12,Math.min(el.clientWidth-marker.tag.offsetWidth-12,(projected.x+1)*el.clientWidth/2+8));
          marker.tag.style.transform=`translate(${labelX}px,${(1-projected.y)*el.clientHeight/2+8}px)`;
        }
      }
      renderer.render(scene,camera);
    }loop();
    return()=>{saveView();disposed=true;cancelAnimationFrame(animation);observer.disconnect();controls.removeEventListener('end',saveView);controls.dispose();visuals?.dispose();release(scene);renderer.dispose();el.replaceChildren();robot.current=null;view.current=null;};
  },[language]);
  useEffect(()=>{view.current?.sync();},[arms,selected,options]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...readView(), options })); } catch {}
  }, [options,storageKey]);
  return <section className="scene-panel" ref={panel} aria-label="双臂三维场景"><div className="scene-canvas" ref={host}/><div className="scene-overlay"><h2>{t('dual.scene')}</h2><span><i className="arm-dot left"/>{t('dual.left')}</span><span><i className="arm-dot right"/>{t('dual.right')}</span><span className={ready?'sr-only':'muted'} role="status">{status}</span></div>
    <div className="axis-key" aria-label="坐标轴颜色"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
    <details className="scene-options"><summary>{t('dual.display')}</summary><div className="scene-options-body"><label>{t('dual.scope')}<select aria-label="坐标轴显示范围" value={options.scope} onChange={e=>change('scope',e.target.value)}><option value="both">{t('dual.both')}</option><option value="left">{t('dual.left')}</option><option value="right">{t('dual.right')}</option></select></label>{optionsList.map(([key,label])=><label key={key}><input type="checkbox" checked={options[key]} onChange={e=>change(key,e.target.checked)}/>{t(`dual.option.${key}`)}</label>)}<button onClick={()=>view.current?.clear()}>{t('dual.clearTrail')}</button><small>{t(shoulderTrial?'dual.shoulderHint':'dual.sharedHint')}</small></div></details>
    <div className="scene-controls"><button onClick={()=>view.current?.reset()}>{t('dual.resetView')}</button><button onClick={()=>view.current?.reset('front')}>{t('dual.front')}</button><button onClick={()=>view.current?.reset('side')}>{t('dual.side')}</button><button onClick={()=>view.current?.reset('top')}>{t('dual.top')}</button><button aria-pressed={options.grid} onClick={()=>change('grid',!options.grid)}>{t('dual.grid')}</button><button onClick={async()=>{try{if(document.fullscreenElement===panel.current)await document.exitFullscreen();else await panel.current.requestFullscreen();setError('');}catch{setError(t('dual.fullscreenFailed'));}}}>{t('dual.fullscreen')}</button></div>{error&&<span className="scene-error" role="status">{error}</span>}
  </section>;
}
