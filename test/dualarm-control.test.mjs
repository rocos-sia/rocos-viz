import test from 'node:test';
import assert from 'node:assert/strict';
import { DualArmControl, motionRequest } from '../src/dualarm/control/live.mjs';
const memoryStorage = () => {const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const response = (data={}, success=true, code=0) => new Response(JSON.stringify({success,code,message:success?'ok':code===3007?'Invalid or missing control credentials for selected arm':'rejected',data}),{headers:{'X-Rocos-Request-Id':'req-123'}});
const motionInput = () => ({ target:[90,-90,0,0,0,0,0], pose:[100,-200,300,0,0,0,2], velocity:'0.1', acceleration:'0.3', jerk:'5', tool:'probe' });
test('precise motion converts units, normalizes orientation and distinguishes flange/tool targets',()=>{
 const input=motionInput();
 assert.deepEqual(motionRequest('movej',input),{joints:[Math.PI/2,-Math.PI/2,0,0,0,0,0],velocity:.1,acceleration:.3,jerk:5});
 const ik=motionRequest('movej_ik',input);
 assert.deepEqual(ik.pose,{position:{x:.1,y:-.2,z:.3},orientation:{x:0,y:0,z:0,w:1}});
 assert.equal(ik.tool_name,undefined);
 assert.equal(motionRequest('movel',input).tool_name,'probe');
 assert.deepEqual(motionRequest('movel_fk',input).joints,motionRequest('movej',input).joints);
 assert.equal(motionRequest('movel_fk',input).tool_name,'probe');
 assert.deepEqual(input.pose,[100,-200,300,0,0,0,2]);
 for(const value of ['',null,Infinity,'bad'])assert.throws(()=>motionRequest('movej',{...input,target:[value,0,0,0,0,0,0]}),/关节目标/);
 assert.throws(()=>motionRequest('movel',{...input,pose:[0,0,0,0,0,0,0]}),/四元数/);
 assert.throws(()=>motionRequest('movej',{...input,velocity:.51}),/上限/);
 assert.throws(()=>motionRequest('movej',{...input,jerk:0}),/正数/);
});
test('precise motion requires fresh verified enabled idle arm and rejects invalid input before fetching',async()=>{
 const {client,calls}=setup();
 try {
  for(const patch of [{updated:0},{verified:false},{held:{}},{stopping:Promise.resolve()},{pending:true},{state:{robot_state:'RUNNING',is_enabled:true}},{state:{robot_state:'STOPPED',is_enabled:false}},{state:{robot_state:'STOPPED',is_enabled:true,motion_busy:true}}]){
   const session=client.session('left'),previous={...session};Object.assign(session,patch);
   assert.equal(await client.move('left','movej',motionInput()),false);Object.assign(session,previous);
  }
  assert.equal(await client.move('left','movej',{...motionInput(),target:[]}),false);
  assert.equal(calls.length,0);
  for(const [side,kind] of [['left','movej'],['right','movej_ik'],['left','movel'],['right','movel_fk']]){
   client.session(side).motion=null;
   assert.equal(await client.move(side,kind,motionInput()),true);
  }
  assert.deepEqual(calls.map(call=>call.path),['/api/arms/left/robot/movej','/api/arms/right/robot/movej_ik','/api/arms/left/robot/movel','/api/arms/right/robot/movel_fk']);
  assert.equal(calls[1].options.headers['X-Rocos-Control-Token'],'right-token');
  await assert.rejects(client.move('both','movej',motionInput()),/无效臂名/);
 } finally {client.close();}
});
test('precise motion failure is reported once for its arm without resending or altering the other lease',async()=>{
 const {client,calls,errors}=setup(()=>response({},false,-2308));
 try {
  assert.equal(await client.move('left','movej',motionInput()),false);
  assert.equal(calls.length,1);assert.equal(errors.length,1);assert.equal(errors[0].code,-2308);assert.equal(errors[0].requestId,'req-123');assert.equal(errors[0].side,'left');assert.equal(client.session('right').token,'right-token');
 } finally {client.close();}
});
function setup(fetcher) {
  const calls=[], errors=[], patches=[];
  const client=new DualArmControl({storage:memoryStorage(),fetcher:async(path,options)=>{calls.push({path,options});return fetcher?fetcher(path,options):response();},onError:(side,error)=>errors.push({side,...error}),onArm:(side,patch)=>patches.push({side,...patch})});
  for (const side of ['left','right']) Object.assign(client.session(side),{token:side+'-token',verified:true,updated:Date.now(),state:{robot_state:'STOPPED',is_enabled:true}});
  return {client,calls,errors,patches};
}
test('credentials and routes are isolated per arm; invalid arm never fetches',async()=>{
 const {client,calls}=setup();
 try { await client.command('left','robot/enable');await client.command('right','robot/enable');
 assert.equal(calls[0].options.headers['X-Rocos-Control-Token'],'left-token');assert.equal(calls[1].options.headers['X-Rocos-Control-Token'],'right-token');
 assert.equal(calls[0].path,'/api/arms/left/robot/enable');
 await assert.rejects(client.command('both','robot/stop'),/无效臂名/);assert.equal(calls.length,2);
 } finally {client.close();}
});
test('HTTP 200 business failure retains code and request id for selected arm',async()=>{
 const {client,errors}=setup(()=>response({},false,1001));
 try {assert.equal(await client.command('right','robot/enable'),false);assert.equal(errors[0].side,'right');assert.equal(errors[0].code,1001);assert.equal(errors[0].requestId,'req-123');assert.equal(client.session('left').token,'left-token');} finally {client.close();}
});
test('invalid token revokes only that arm; command is not retried',async()=>{
 const {client,calls}=setup(()=>response({},false,3007));
 try {await client.command('right','robot/enable');assert.equal(client.session('right').token,'');assert.equal(client.session('left').token,'left-token');assert.equal(calls.length,1);} finally {client.close();}
});
test('expired feedback blocks new motion, but permits stop',async()=>{
 const {client,calls}=setup();client.session('left').updated=0;
 try {assert.equal(client.startJog('left','joint',0,1,.01,'BASE'),false);assert.equal(await client.command('left','robot/enable'),false);await client.stop('left');assert.deepEqual(calls.map(c=>c.path),['/api/arms/left/robot/stop']);} finally {client.close();}
});
test('release during in-flight jog drains start then stops without another jog',async()=>{
 let resolve;const waiting=new Promise(r=>resolve=r);
 const {client,calls}=setup(path=>path.endsWith('/joint')?waiting:response());
 try {assert.equal(client.startJog('left','joint',2,-1,.03,'BASE'),true);const stop=client.stopJog('left');assert.equal(calls.length,1);resolve(response());await stop;await new Promise(r=>setTimeout(r,80));
 assert.deepEqual(calls.map(c=>c.path),['/api/arms/left/robot/jog/joint','/api/arms/left/robot/jog/stop']);
 const body=JSON.parse(calls[0].options.body);assert.deepEqual(body.joints,[0,0,-1,0,0,0,0]);assert.equal(body.timeout,.25);
 } finally {client.close();}
});
test('one arm can stop while the other keeps jogging',async()=>{
 const {client,calls}=setup();
 try {client.startJog('left','joint',0,1,.01,'BASE');client.startJog('right','cartesian',2,1,.01,'BASE');await client.stopJog('left');await new Promise(r=>setTimeout(r,65));
 assert.ok(calls.filter(c=>c.path.endsWith('right/robot/jog/cartesian')).length>=2);assert.equal(client.session('left').held,null);assert.ok(client.session('right').held);await client.stopJog('right');
 } finally {client.close();}
});
test('jog rejection stops refreshing and reports local failure',async()=>{
 const {client,calls,errors}=setup(path=>path.endsWith('/cartesian')?response({},false,4005):response());
 try {client.startJog('left','cartesian',2,1,.01,'BASE');await new Promise(r=>setTimeout(r,100));assert.equal(client.session('left').held,null);assert.equal(errors[0].side,'left');assert.equal(errors[0].code,4005);assert.equal(calls.filter(c=>c.path.endsWith('/cartesian')).length,1);assert.ok(calls.some(c=>c.path.endsWith('/jog/stop')));} finally {client.close();}
});
test('stop stays available during a pending enable',async()=>{
 let resolve;const waiting=new Promise(r=>resolve=r);
 const {client,calls}=setup(path=>path.endsWith('/enable')?waiting:response());
 try {const enable=client.command('left','robot/enable');await client.stop('left');assert.ok(calls.some(c=>c.path.endsWith('/robot/stop')));resolve(response());await enable;} finally {client.close();}
});
test('success with PlanFinished code is accepted; unsupported-operation 3007 does not revoke lease',async()=>{
 const {client}=setup(path=>path.endsWith('enable')?response({},true,100):new Response(JSON.stringify({success:false,code:3007,message:'stop failed',data:{robot_state:'STOPPED'}})));
 try {assert.equal(await client.command('left','robot/enable'),true);await client.stop('left');assert.equal(client.session('left').token,'left-token');} finally {client.close();}
});
test('frozen App timestamp locks only that arm and retains the last valid snapshot',async()=>{
 const pose={position:{x:0,y:0,z:0},orientation:{x:0,y:0,z:0,w:1}};
 const snapshot={timestamp:123,robot_state:'STOPPED',is_enabled:true,flange:pose,tcp:pose,joint_states:Array.from({length:7},(_,i)=>({name:`J${i+1}`,position:i*.1}))};
 const {client,patches,errors}=setup(()=>response(snapshot));
 client.session('left').definition={joint_names:snapshot.joint_states.map(j=>j.name)};
 try {await client.poll('left');assert.deepEqual(client.session('left').state,snapshot);
  client.session('left').timestampChanged=Date.now()-1000;
  await client.poll('left');assert.equal(errors.at(-1).code,'STALE');assert.ok(patches.some(p=>p.side==='left'&&p.online===false));assert.equal(client.session('right').token,'right-token');
 } finally {client.close();}
});

test('reload restores identity/tokens but requires heartbeat before writes',async()=>{
 const storage=memoryStorage(), calls=[];
 const old=new DualArmControl({storage});
 old.session('left').token='left-secret';old.session('right').token='right-secret';old.persist();old.close();
 let current;
 current=new DualArmControl({storage,fetcher:async(path,options)=>{calls.push({path,options});return response({has_owner:true,owner_client_id:current.clientId});}});
 Object.assign(current.session('left'),{updated:Date.now(),state:{robot_state:'STOPPED',is_enabled:true}});
 try {
  assert.equal(current.clientId,old.clientId);assert.equal(current.session('right').token,'right-secret');assert.equal(current.session('left').verified,false);
  assert.equal(await current.command('left','robot/enable'),false);assert.equal(calls.length,0);
  assert.equal(current.startJog('left','joint',0,1,.01,'BASE'),false);
  assert.equal(await current.checkLease('left'),true);
  assert.equal(await current.command('left','robot/enable'),true);
  assert.equal(calls[0].path,'/api/arms/left/control/heartbeat');assert.equal(calls[0].options.headers['X-Rocos-Control-Token'],'left-secret');
  assert.ok(!calls.some(c=>c.path.endsWith('/acquire')));
 } finally {current.close();}
});
test('heartbeat network failure retains credentials and recovers without reacquisition',async()=>{
 const storage=memoryStorage();let fail=true,client;const calls=[];
 client=new DualArmControl({storage,fetcher:async path=>{calls.push(path);if(fail)throw new TypeError('offline');return response({has_owner:true,owner_client_id:client.clientId});}});
 client.session('left').token='left-secret';client.session('left').verified=true;client.persist();
 try {
  assert.equal(await client.checkLease('left'),false);assert.equal(client.session('left').token,'left-secret');assert.equal(client.session('left').verified,false);
  const restored=new DualArmControl({storage});assert.equal(restored.session('left').token,'left-secret');restored.close();
  fail=false;assert.equal(await client.checkLease('left'),true);assert.ok(calls.every(p=>p.endsWith('/heartbeat')));
 } finally {client.close();}
});
test('expired/restarted-App credential is removed only for the rejected arm',async()=>{
 const storage=memoryStorage(),client=new DualArmControl({storage,fetcher:()=>Promise.resolve(response({},false,3007))});
 client.session('left').token='left-secret';client.session('right').token='right-secret';client.persist();
 try {await client.checkLease('left');const restored=new DualArmControl({storage});assert.equal(restored.session('left').token,'');assert.equal(restored.session('right').token,'right-secret');restored.close();} finally {client.close();}
});
test('release removes persisted token so reload cannot resurrect ownership',async()=>{
 const storage=memoryStorage(),client=new DualArmControl({storage,fetcher:()=>Promise.resolve(response())});
 client.session('left').token='left-secret';client.session('left').verified=true;client.persist();
 try {await client.command('left','control/release');const restored=new DualArmControl({storage});assert.equal(restored.session('left').token,'');assert.equal(restored.clientId,client.clientId);restored.close();} finally {client.close();}
});
test('late heartbeat cannot restore a released lease',async()=>{
 let resolve;const waiting=new Promise(r=>resolve=r),client=new DualArmControl({storage:memoryStorage(),fetcher:path=>path.endsWith('/heartbeat')?waiting:Promise.resolve(response())});
 client.session('left').token='left-secret';client.session('left').verified=true;
 try {const heartbeat=client.checkLease('left');await client.command('left','control/release');resolve(response({has_owner:true,owner_client_id:client.clientId}));assert.equal(await heartbeat,false);assert.equal(client.session('left').token,'');assert.equal(client.session('left').verified,false);} finally {client.close();}
});
test('copied tab storage receives a new identity while original keeps its lease',async()=>{
 const held=new Set();const locks={request:async(name,_options,callback)=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
 const storage=memoryStorage(),first=new DualArmControl({storage,locks});first.session('left').token='original-secret';first.persist();
 await first.claimTab();
 const copied=memoryStorage();copied.setItem('rocos.dualarm.control.v1',storage.getItem('rocos.dualarm.control.v1'));
 const second=new DualArmControl({storage:copied,locks});
 try {await second.claimTab();assert.notEqual(first.clientId,second.clientId);assert.equal(second.session('left').token,'');assert.equal(first.session('left').token,'original-secret');const reload=new DualArmControl({storage});assert.equal(reload.clientId,first.clientId);reload.close();} finally {first.close();second.close();}
});
