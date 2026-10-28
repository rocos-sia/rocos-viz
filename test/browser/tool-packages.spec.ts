import { expect, test, type Page } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';

const pose = (x=0,y=0,z=0) => ({ position: { x,y,z }, orientation: { x:0,y:0,z:0,w:1 } });
const compose = (a: ReturnType<typeof pose>, b: ReturnType<typeof pose>) => {
  const q=new Quaternion(a.orientation.x,a.orientation.y,a.orientation.z,a.orientation.w);
  const p=new Vector3(b.position.x,b.position.y,b.position.z).applyQuaternion(q).add(new Vector3(a.position.x,a.position.y,a.position.z));
  q.multiply(new Quaternion(b.orientation.x,b.orientation.y,b.orientation.z,b.orientation.w));
  return { position: { x:p.x,y:p.y,z:p.z }, orientation: { x:q.x,y:q.y,z:q.z,w:q.w } };
};
const robotXml='<robot name="Robot"><link name="base"><visual><geometry><box size="0.15 0.15 0.6"/></geometry><origin xyz="0 0 0.3"/></visual></link></robot>';
const toolXml='<robot name="Gripper"><link name="tool_base"><visual><geometry><box size="0.1 0.06 0.08"/></geometry><origin xyz="0 0 0.04"/><material name="blue"><color rgba="0.2 0.4 0.8 1"/></material></visual><visual><geometry><mesh filename="meshes/夹 爪%.stl"/></geometry></visual></link></robot>';
const stl='solid part\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0.08\nvertex 0.1 0 0.08\nvertex 0 0.1 0.08\nendloop\nendfacet\nendsolid part';

async function setup(page: Page, readonly=false) {
  await page.addInitScript(({readonly}) => {
    sessionStorage.setItem('rocos_client_id','package-tab');
    sessionStorage.setItem('rocos-connection',JSON.stringify({state:{host:'127.0.0.1',port:'8080',isConnected:true,autoLoadModel:true,controlToken:readonly?null:'package-token'},version:0}));
    class FakeEventSource extends EventTarget { close() {} }
    Object.assign(window,{EventSource:FakeEventSource});
  }, {readonly});
  const tool = { name:'gripper',package_version:'1.0.0',digest:'a'.repeat(64),revision:1,urdf:'gripper.urdf',
    mount:pose(0,0,0.04),tcp:pose(0.1,0,0),default_mount:pose(),default_tcp:pose(0.1,0,0),calibration_yaml:'' };
  let active='gripper', imported=false, packageSupport=true, session: Record<string, unknown> | null=null;
  let state: Record<string, unknown> = {robot_state:'STOPPED',is_enabled:false,motion_busy:false,is_running:false,joint_states:[],flange:pose(0,0,0.6)};
  const requests: {path:string;method:string;body:unknown;headers:Record<string,string>}[]=[];
  const assets: string[]=[];
  const telemetry=() => ({...state,active_tool_frame_name:active,active_tool_frame:compose(tool.mount,tool.tcp),
    tcp:compose(state.flange as ReturnType<typeof pose>,compose(tool.mount,tool.tcp)),active_tool_package:active?{...tool}:null});
  await page.route('**/api/**',async route => {
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
    const isJson=(request.headers()['content-type']??'').includes('application/json');
    const body=isJson?request.postDataJSON():request.postDataBuffer();
    requests.push({path,method,body,headers:request.headers()});
    const send=(data:unknown)=>route.fulfill({json:{success:true,code:0,data}});
    if (method!=='GET' && /tool_package|calibration\/save/.test(path)) {
      expect(request.headers()['x-rocos-control-token']).toBe('package-token');
      expect(request.headers()['x-rocos-client-id']).toBe('package-tab');
    }
    if(path==='/api/robot/urdf')return route.fulfill({contentType:'text/xml',body:robotXml});
    if(path==='/api/robot/tool_package/asset') {
      const asset=url.searchParams.get('path')!;assets.push(asset);
      if(asset==='gripper.urdf')return route.fulfill({contentType:'application/xml',body:toolXml});
      if(asset==='meshes/夹 爪%.stl')return route.fulfill({contentType:'application/octet-stream',body:stl});
      return route.fulfill({status:404,body:'Missing asset'});
    }
    if(path==='/api/robot/tool_frames')return send({names:['plain','gripper'],active,file_path:'/config/frames.yaml',package_support:packageSupport,robot_id:'robot_A'});
    if(path==='/api/robot/tool_frame')return send(url.searchParams.get('name')==='gripper'?{name:'gripper',frame:compose(tool.mount,tool.tcp),package:tool}:{name:'plain',frame:pose(0,0,0.1)});
    if(path==='/api/robot/active_tool_frame'){active=body.name;return send({active});}
    if(path==='/api/robot/tool_packages/import'){imported=true;return send(null);}
    if(path==='/api/robot/tool_packages/reload')return send(null);
    if(path==='/api/robot/tool_package/overrides'){
      expect(body.digest).toBe(tool.digest);expect(body.revision).toBe(tool.revision);
      Object.assign(tool,{mount:body.mount,tcp:body.tcp,revision:tool.revision+1,calibration_yaml:''});return send(null);
    }
    if(path==='/api/robot/tool_package/export')return route.fulfill({contentType:'application/zip',body:Buffer.from('PK-tool-export')});
    if(path==='/api/robot/tool_package/installation')return method==='GET'
      ?route.fulfill({contentType:'application/yaml',body:'schema_version: 1\nrobot_id: robot_A\nname: gripper\n'}):send(null);
    if(path==='/api/calibration/pose'){
      if(!session)session={session_id:'package-session',name:body.name,samples:Array(6).fill(null),captured:0,result:null};
      (session.samples as unknown[])[body.index-1]={index:body.index,flange:pose(0,0,0.6),joints:[0.1],timestamp:1792740000};
      session.captured=(session.samples as unknown[]).filter(Boolean).length;return send(session);
    }
    if(path==='/api/calibration/run'){
      session!.result={pose:pose(0,0,0.18),error_state:false,metrics:{rms_error:0,max_error:0,condition_number:2,axis_angle_degrees:90}};return send(session);
    }
    if(path==='/api/calibration/save'){tool.tcp=pose(0,0,0.14);tool.revision++;tool.calibration_yaml='rms_error: 0';return send(null);}
    if(path==='/api/calibration/result')return send(session);
    if(path==='/api/robot/state')return send(telemetry());
    if(path==='/api/logs')return send({events:[],next_id:'mock:0',has_more:false,gap:null});
    if(path.startsWith('/api/control/'))return send({has_owner:true,owner_client_id:readonly?'other':'package-tab',heartbeat_interval_seconds:3});
    return send({valid:true,mass:0,com:[0,0,0]});
  });
  await page.routeWebSocket('**/ws/robot_state',socket=>socket.send(JSON.stringify(telemetry())));
  const update = async(changes:Record<string,unknown>) => {
    state={...state,...changes};
    await page.evaluate(async(next)=>{const path='/src/stores/robotStateStore.ts';const {useRobotStateStore}=await import(path);useRobotStateStore.getState().updateState(next);},telemetry());
  };
  return {tool,requests,assets,update,imported:()=>imported,setActive:(name:string)=>{active=name;},setSupport:(enabled:boolean)=>{packageSupport=enabled;}};
}

test('tool package UI imports ZIP, edits separate transforms and exports original, calibrated and installation files',async({page})=>{
  const fixture=await setup(page);await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab',{name:'工具包',exact:true}).click();
  await expect(page.getByRole('button',{name:'导入工具 ZIP',exact:true})).toBeEnabled();
  await page.getByLabel('导入工具 ZIP',{exact:true}).setInputFiles({name:'gripper.zip',mimeType:'application/zip',buffer:Buffer.from('PK-package-import')});
  await expect.poll(fixture.imported).toBe(true);
  const imported=fixture.requests.find(r=>r.path.endsWith('/import'))!;expect(imported.headers['content-type']).toBe('application/zip');
  await page.getByRole('button',{name:'编辑安装与 TCP',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('spinbutton',{name:'安装变换（法兰到工具基座） Z',exact:true}).fill('50');
  await dialog.getByRole('spinbutton',{name:'安装变换（法兰到工具基座） RZ',exact:true}).fill('90');
  await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(fixture.tool.mount.position.z).toBeCloseTo(0.05);expect(fixture.tool.mount.orientation.z).toBeCloseTo(Math.SQRT1_2);
  expect(fixture.tool.tcp.position.x).toBeCloseTo(0.1);
  await expect.poll(() => packagePreviewSnapshot(page).then(s => s?.tcp?.slice(12, 15).map((v: number) => Number(v.toFixed(6))))).toEqual([0, 0.1, 0.05]);
  for(const [button,name] of [['导出原始工具包','gripper.zip'],['导出安装配置','gripper-installation.yaml']] as const){
    const download=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();expect((await download).suggestedFilename()).toBe(name);
  }
  await page.getByRole('button',{name:'导出含本机 TCP 的工具包',exact:true}).click();
  await page.getByRole('textbox',{name:'新工具包版本',exact:true}).fill('1.0.1');
  const download=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'导出原始工具包',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('gripper-1.0.1.zip');
  await page.getByLabel('导入安装配置',{exact:true}).setInputFiles({name:'installation.yaml',mimeType:'application/yaml',buffer:Buffer.from('robot_id: robot_A')});
  await expect.poll(()=>fixture.requests.some(r=>r.path.endsWith('/installation')&&r.method==='POST')).toBe(true);
  await page.screenshot({path:'test-results/tool-package-management.png'});
});

test('package six-point save uses the server session rather than overwriting a plain tool frame',async({page})=>{
  const fixture=await setup(page);await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab',{name:'六点法标定',exact:true}).click();
  await page.getByRole('textbox',{name:'标定工具名称',exact:true}).fill('gripper');
  for(let i=1;i<=6;i++)await page.getByRole('button',{name:`采集 P${i}`,exact:true}).click();
  await page.getByRole('button',{name:'计算标定结果',exact:true}).click();
  await page.getByRole('button',{name:'保存标定工具',exact:true}).click();
  await page.getByRole('tooltip').getByRole('button',{name:/确\s*定/}).click();
  await expect.poll(()=>fixture.requests.some(r=>r.path==='/api/calibration/save')).toBe(true);
  expect(fixture.requests.some(r=>r.path==='/api/robot/tool_frame'&&r.method==='POST')).toBe(false);
  expect(fixture.tool.tcp.position.z).toBeCloseTo(0.14);
});

async function modelSnapshot(page:Page,selector='.teach-scene-canvas canvas'){
  return page.evaluate(async selector=>{
    const path='/node_modules/.vite/deps/@react-three_fiber.js';const {_roots}=await import(path);
    const scene=_roots.get(document.querySelector(selector))?.store.getState().scene;
    const model=scene?.getObjectByName('active-tool-model');if(!model)return null;
    const robot=scene.getObjectByProperty('robotName','Robot');scene.updateMatrixWorld(true);
    const matrix=robot.matrixWorld.clone().invert().multiply(model.matrixWorld);
    return {position:model.position.clone().setFromMatrixPosition(matrix).toArray(),tcp:scene.getObjectByName('active-tool-frame')?.position.toArray()};
  },selector);
}

test('tool model follows flange times mount and TCP adds local offset, with shared resources and no stale model',async({page})=>{
  const fixture=await setup(page);await page.goto('/#/teaching');
  await expect.poll(()=>modelSnapshot(page).then(s=>s?.position)).toEqual([0,0,0.64]);
  expect((await modelSnapshot(page))!.tcp).toEqual([0.1,0,0.64]);
  fixture.tool.mount={...pose(0,0,0.05),orientation:{x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}};
  await fixture.update({flange:pose(0,0,0.6)});
  await expect.poll(()=>modelSnapshot(page).then(s=>s?.position)).toEqual([0,0,0.65]);
  const moved=(await modelSnapshot(page))!;moved.tcp.forEach((v:number,i:number)=>expect(v).toBeCloseTo([0,0.1,0.65][i]));
  await page.getByRole('link',{name:'总览',exact:true}).click();
  await expect.poll(()=>modelSnapshot(page,'.teach-robot-preview canvas').then(s=>s?.position.map((v:number)=>Math.round(v*1000)||0))).toEqual([0,0,650]);
  expect(fixture.assets.filter(a=>a==='gripper.urdf')).toHaveLength(1);expect(fixture.assets.filter(a=>a==='meshes/夹 爪%.stl')).toHaveLength(1);
  await page.screenshot({path:'test-results/tool-package-overview.png'});
  fixture.setActive('');await fixture.update({});await expect.poll(()=>modelSnapshot(page,'.teach-robot-preview canvas')).toBeNull();
  expect(fixture.requests.filter(r=>r.method==='POST'&&/\/(move|jog)/.test(r.path))).toEqual([]);
});

test('readonly package management keeps downloads available and blocks writes',async({page})=>{
  await setup(page,true);await page.goto('/#/devices?tab=tool');await page.getByRole('tab',{name:'工具包',exact:true}).click();
  for(const label of ['导入工具 ZIP','扫描工具目录','导入安装配置','编辑安装与 TCP','更新工具 ZIP'])await expect(page.getByRole('button',{name:label,exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'导出原始工具包',exact:true})).toBeEnabled();
});

test('late tool model responses cannot restore a replaced or disconnected model',async({page})=>{
  const fixture=await setup(page);await page.goto('/#/teaching');
  await expect.poll(()=>modelSnapshot(page)).not.toBeNull();
  let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>{release=resolve;});
  let waiting=false;
  await page.route('**/api/robot/tool_package/asset?**',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('digest')==='b'.repeat(64)&&url.searchParams.get('path')==='gripper.urdf'){
      waiting=true;await pending;await route.fulfill({contentType:'application/xml',body:toolXml});
    }else await route.fallback();
  });
  fixture.tool.digest='b'.repeat(64);await fixture.update({});
  await expect.poll(()=>waiting).toBe(true);await expect.poll(()=>modelSnapshot(page)).toBeNull();
  await expect(page.locator('.teach-scene-canvas .scene-tool-frame-label')).toHaveText('TCP · gripper');
  await page.evaluate(async()=>{const path='/src/stores/connectionStore.ts';const{useConnectionStore}=await import(path);useConnectionStore.getState().setConnected(false);});
  release();await expect(page.locator('.scene-tool-frame-label')).toHaveCount(0);
  await expect.poll(()=>modelSnapshot(page)).toBeNull();
  await page.evaluate(async()=>{const path='/src/stores/connectionStore.ts';const{useConnectionStore}=await import(path);useConnectionStore.getState().setConnected(true);});
  await expect.poll(()=>modelSnapshot(page)).not.toBeNull();
});

test('package editing surfaces a rejected stale revision inside the dialog',async({page})=>{
  await setup(page);await page.goto('/#/devices?tab=tool');await page.getByRole('tab',{name:'工具包',exact:true}).click();
  await page.getByRole('button',{name:'编辑安装与 TCP',exact:true}).click();
  await page.route('**/api/robot/tool_package/overrides',route=>route.fulfill({json:{success:false,code:1001,message:'Tool definition changed; reload before saving'}}));
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await expect(dialog.getByRole('alert').filter({hasText:'Tool definition changed'})).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('a new controller session without package support returns to ordinary tool management',async({page})=>{
  const fixture=await setup(page);await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab',{name:'工具包',exact:true}).click();
  fixture.setSupport(false);
  await page.evaluate(async()=>{const path='/src/stores/connectionStore.ts';const{useConnectionStore}=await import(path);useConnectionStore.setState({controlToken:'new-controller-session'});});
  await expect(page.getByRole('tab',{name:'工具包',exact:true})).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'工具管理',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('cell',{name:'plain',exact:true})).toBeVisible();
});

async function packagePreviewSnapshot(page: Page) {
  return page.evaluate(async () => {
    const path = '/node_modules/.vite/deps/@react-three_fiber.js';
    const { _roots } = await import(path);
    const state = _roots.get(document.querySelector('.teach-package-preview canvas'))?.store.getState();
    if (!state) return null;
    state.scene.updateMatrixWorld(true);
    const model = state.scene.getObjectByName('package-preview-model');
    return {
      model: model?.matrixWorld.elements,
      modelName: model?.children[0]?.robotName,
      mount: state.scene.getObjectByName('package-preview-mount')?.matrixWorld.elements,
      tcp: state.scene.getObjectByName('package-preview-tcp')?.matrixWorld.elements,
      camera: state.camera.position.toArray(),
      far: state.camera.far,
      maxDistance: state.controls.maxDistance,
      target: state.controls.target.toArray(),
    };
  });
}

const closeValues = (actual: number[], expected: number[]) => expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));

test('selected package preview shows installation and composed TCP after scanning without activation', async ({ page }) => {
  const fixture = await setup(page);
  fixture.setActive('');
  fixture.tool.mount = { ...pose(0.02, 0.03, 0.04), orientation: { x:0, y:0, z:Math.SQRT1_2, w:Math.SQRT1_2 } };
  fixture.tool.tcp = { ...pose(0.1, 0, 0.14), orientation: { x:Math.SQRT1_2, y:0, z:0, w:Math.SQRT1_2 } };
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name:'工具包', exact:true }).click();
  await page.getByRole('button', { name:'扫描工具目录', exact:true }).click();
  const preview = page.getByRole('region', { name:'工具模型预览', exact:true });
  await expect(preview).toHaveAttribute('data-model-status', 'ready');
  const snapshot = (await packagePreviewSnapshot(page))!;
  expect(snapshot.modelName).toBe('Gripper');
  closeValues(snapshot.model.slice(12, 15), [0.02, 0.03, 0.04]);
  closeValues(snapshot.mount.slice(12, 15), [0.02, 0.03, 0.04]);
  closeValues(snapshot.tcp.slice(12, 15), [0.02, 0.13, 0.18]);
  closeValues(snapshot.tcp.slice(0, 3), [0, 1, 0]);
  closeValues(snapshot.tcp.slice(4, 7), [0, 0, 1]);
  await preview.getByRole('checkbox', { name:'安装坐标系', exact:true }).uncheck();
  await expect.poll(() => packagePreviewSnapshot(page).then(s => s?.mount)).toBeUndefined();
  expect((await packagePreviewSnapshot(page))!.tcp).toBeDefined();
  await preview.getByRole('checkbox', { name:'安装坐标系', exact:true }).check();
  const canvas = await preview.locator('canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + canvas!.width / 2 + 90, canvas!.y + canvas!.height / 2 + 30, { steps:8 });
  await page.mouse.up();
  await expect.poll(() => packagePreviewSnapshot(page).then(s => Math.abs(s!.camera[0] - snapshot.camera[0]))).toBeGreaterThan(0.01);
  await preview.getByRole('button', { name:'重置视角', exact:true }).click();
  await expect.poll(() => packagePreviewSnapshot(page).then(s => s!.camera.map((v: number) => Number(v.toFixed(4))))).toEqual(snapshot.camera.map((v: number) => Number(v.toFixed(4))));
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 200);
  await expect.poll(() => packagePreviewSnapshot(page).then(s => Math.hypot(...s!.camera.map((v: number, i: number) => v - s!.target[i])))).toBeCloseTo(snapshot.maxDistance, 4);
  const zoomed = (await packagePreviewSnapshot(page))!;
  expect(zoomed.far).toBeGreaterThan(zoomed.maxDistance * 16 / 15);
  await preview.getByRole('button', { name:'重置视角', exact:true }).click();
  expect(fixture.assets.filter(path => path === 'gripper.urdf')).toHaveLength(1);
  expect(fixture.requests.some(r => r.path.endsWith('/reload') && r.method === 'POST')).toBe(true);
  expect(fixture.requests.filter(r => r.method === 'POST' && /active_tool_frame|\/(move|jog)/.test(r.path))).toEqual([]);
  await page.screenshot({ path:'test-results/tool-package-preview.png' });
});

test('package preview uses identity for missing transforms and supports coordinate-only tools', async ({ page }) => {
  const fixture = await setup(page, true);
  await page.route('**/api/robot/tool_frame?**', async route => {
    if (new URL(route.request().url()).searchParams.get('name') !== 'gripper') return route.fallback();
    await route.fulfill({ json:{ success:true, code:0, data:{ name:'gripper', frame:pose(), package:{ ...fixture.tool, mount:null, tcp:undefined, urdf:'' } } } });
  });
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name:'工具包', exact:true }).click();
  const preview = page.getByRole('region', { name:'工具模型预览', exact:true });
  await expect(preview).toHaveAttribute('data-model-status', 'axes-only');
  await expect(preview).toContainText('未提供的变换按单位阵预览');
  await expect.poll(() => packagePreviewSnapshot(page).then(s => s?.mount)).toEqual([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  expect((await packagePreviewSnapshot(page))!.tcp).toEqual((await packagePreviewSnapshot(page))!.mount);
  expect(fixture.assets).toEqual([]);
  await expect(page.getByRole('button', { name:'编辑安装与 TCP', exact:true })).toBeDisabled();
  await page.screenshot({ path:'test-results/tool-package-preview-identity.png' });
});

test('package preview keeps axes when a model fails and retries read-only', async ({ page }) => {
  const fixture = await setup(page, true);
  let failing = true;
  await page.route('**/api/robot/tool_package/asset?**', route => failing
    ? route.fulfill({ status:404, contentType:'text/plain', body:'Missing model' }) : route.fallback());
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name:'工具包', exact:true }).click();
  const preview = page.getByRole('region', { name:'工具模型预览', exact:true });
  await expect(preview).toHaveAttribute('data-model-status', 'error');
  await expect.poll(() => packagePreviewSnapshot(page).then(s => !!s?.mount && !!s?.tcp)).toBe(true);
  failing = false;
  await preview.getByRole('button', { name:'重新加载', exact:true }).click();
  await expect(preview).toHaveAttribute('data-model-status', 'ready');
  expect(fixture.requests.filter(r => r.method === 'POST' && r.path.startsWith('/api/robot/'))).toEqual([]);
});

test('package preview discards a delayed previous selection and clears on disconnect', async ({ page }) => {
  const fixture = await setup(page, true);
  const second = { ...fixture.tool, name:'second', digest:'b'.repeat(64), mount:pose(0.03,0,0) };
  await page.route('**/api/robot/tool_frames', route => route.fulfill({ json:{ success:true,code:0,data:{ names:['gripper','second'],active:'',file_path:'/config/frames.yaml',package_support:true,robot_id:'robot_A' } } }));
  await page.route('**/api/robot/tool_frame?**', route => new URL(route.request().url()).searchParams.get('name') === 'second'
    ? route.fulfill({ json:{success:true,code:0,data:{name:'second',frame:pose(),package:second}} }) : route.fallback());
  let release: () => void = () => {}, waiting = false;
  const delay = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/robot/tool_package/asset?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('path') !== 'gripper.urdf') return route.fallback();
    if (url.searchParams.get('name') === 'gripper') { waiting = true; await delay; }
    await route.fulfill({ contentType:'application/xml',body:toolXml.replace('name="Gripper"', `name="${url.searchParams.get('name')}"`) });
  });
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name:'工具包', exact:true }).click();
  await expect.poll(() => waiting).toBe(true);
  await page.locator('.teach-package-details .ant-select-selector').click();
  await page.getByTitle('second · 1.0.0', { exact:true }).click();
  await expect.poll(() => packagePreviewSnapshot(page).then(s => s?.modelName)).toBe('second');
  release();
  await expect(page.getByRole('img', { name:'工具模型预览: second', exact:true })).toBeVisible();
  expect((await packagePreviewSnapshot(page))!.modelName).toBe('second');
  await page.evaluate(async () => { const path='/src/stores/connectionStore.ts'; const {useConnectionStore}=await import(path); useConnectionStore.getState().setConnected(false); });
  await expect.poll(() => packagePreviewSnapshot(page)).toBeNull();
});

test('package preview fits a narrow workspace and preserves framing across languages', async ({ page }) => {
  const fixture = await setup(page, true);
  fixture.tool.mount = { ...pose(0.3, -0.2, 0.1), orientation:{ x:0, y:0, z:Math.SQRT1_2, w:Math.SQRT1_2 } };
  await page.goto('/#/devices?tab=tool');
  await page.getByRole('tab', { name:'工具包', exact:true }).click();
  const preview = page.locator('.teach-package-preview');
  await expect(preview).toHaveAttribute('data-model-status', 'ready');
  const details = await page.locator('.teach-package-details').boundingBox(), desktop = await preview.boundingBox();
  expect(desktop!.x).toBeGreaterThan(details!.x + details!.width);
  await page.setViewportSize({ width:900, height:1000 });
  await expect.poll(async () => { const p=await preview.boundingBox(),d=await page.locator('.teach-package-details').boundingBox(); return p!.y > d!.y + d!.height; }).toBe(true);
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const initialCamera = (await packagePreviewSnapshot(page))!.camera;
  await page.evaluate(async () => { const path='/src/stores/uiStore.ts'; const {useUIStore}=await import(path); useUIStore.setState({language:'en'}); });
  await expect(preview.getByRole('checkbox', { name:'Installation frame', exact:true })).toBeVisible();
  await expect(preview.getByRole('checkbox', { name:'Tool frame (TCP)', exact:true })).toBeVisible();
  await expect.poll(() => packagePreviewSnapshot(page).then(s => s?.camera.map((v: number) => Number(v.toFixed(4))))).toEqual(initialCamera.map((v: number) => Number(v.toFixed(4))));
  await page.screenshot({ path:'test-results/tool-package-preview-narrow.png' });
});
