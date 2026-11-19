// Opt-in integration test against the running MuJoCo App. Always cleans its own leases.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.DUALARM_PREVIEW_URL||'http://127.0.0.1:5186';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const credentials={},errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{
 const side=request.url().match(/\/api\/arms\/(left|right)\//)?.[1];
 const headers=request.headers();
 if(side && headers['x-rocos-control-token']) credentials[side]={'X-Rocos-Control-Token':headers['x-rocos-control-token'],'X-Rocos-Client-Id':headers['x-rocos-client-id']};
});
const state=async side=>(await (await page.request.get(`${origin}/api/arms/${side}/robot/state`)).json()).data;
const summary=side=>page.locator(`.arm-summary.${side}`);
async function until(fn,message){for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(100);}throw new Error(message);}
async function hold(name,duration=300){const button=page.getByRole('button',{name,exact:true});await until(async()=>await button.isEnabled(),'Jog button unavailable: '+name);await button.focus();const before=await button.boundingBox();await page.keyboard.down('Enter');await page.waitForTimeout(duration);await page.keyboard.up('Enter');assert.deepEqual(await button.boundingBox(),before,'Jog button moved');}
try {
 await page.goto(origin+'/?base=shoulder');await page.evaluate(()=>document.fonts.ready);
 await until(async()=> (await summary('left').innerText()).includes('反馈在线'),'No live state');
 await page.locator('.coordinate-label:not([hidden])').filter({hasText:'L · 肩部基座'}).waitFor();
 for(const side of ['left','right']) {
  const snapshot=await state(side);
  const cells=await page.locator(`tr[data-arm=${side}] .pose-value`).allTextContents();
  for(const [i,key] of ['x','y','z'].entries())assert.ok(Math.abs(Number(cells[i])-snapshot.flange.position[key]*1000)<.05);
  await summary(side).getByRole('button',{name:'申请控制权',exact:true}).click();
  await until(async()=>await summary(side).getByRole('button',{name:'使能',exact:true}).isEnabled(),'Acquire failed');
  await summary(side).getByRole('button',{name:'使能',exact:true}).click();
  await until(async()=> (await state(side)).is_enabled,'Enable failed');
  await until(async()=> (await summary(side).innerText()).includes('已使能'),'No enabled feedback');
 }
 checks.push('App state/pose/model and independent acquisition/enable');
 for(const [side,name] of [['left','左臂'],['right','右臂']]) {
  await summary(side).locator('.arm-select').click();
  const before=await state(side);
  await hold(`${name} J1 正向点动`,650);
  await until(async()=> !(await state(side)).motion_busy,'Jog did not stop');
  const after=await state(side);
  assert.ok(Math.abs(after.joint_states[0].position-before.joint_states[0].position)>.0005,`${side} did not move`);
  checks.push(`${side}: real joint jog and stop, stable button position`);
 }
 await page.getByRole('combobox',{name:'点动方式',exact:true}).selectOption('cartesian');
 const before=await state('right');
 await hold('右臂 Z 正向点动',300);
 await until(async()=> !(await state('right')).motion_busy,'Cartesian jog did not stop');
 const after=await state('right');
 console.log('Z change metres',after.flange.position.z-before.flange.position.z);
 assert.ok(Math.abs(after.flange.position.z-before.flange.position.z)>.00001 || after.robot_state==='ERROR_STATE','Cartesian jog neither moved nor reported a runtime fault');
 if(after.robot_state==='ERROR_STATE'){await until(async()=>(await summary('right').innerText()).includes('运行错误：ERROR_STATE'),'No real runtime error feedback');await page.getByRole('button',{name:'复位右臂',exact:true}).click();await until(async()=>(await state('right')).robot_state!=='ERROR_STATE','Reset failed');if(!(await state('right')).is_enabled){await summary('right').getByRole('button',{name:'使能',exact:true}).click();await until(async()=>(await state('right')).is_enabled,'Re-enable failed');}}
 checks.push('right: real Cartesian Z jog and stop');
 // Inject failures at browser transport only; never fault the robot deliberately.
 await page.route('**/api/arms/right/robot/jog/cartesian',route=>route.fulfill({status:200,contentType:'application/json',headers:{'X-Rocos-Request-Id':'test-reject-42'},body:JSON.stringify({success:false,code:1001,message:'测试：目标不可达',data:null})}));
 await hold('右臂 Z 正向点动',150);
 await until(async()=> (await summary('right').innerText()).includes('目标不可达'),'No arm-local request error');
 assert.ok(!(await summary('left').innerText()).includes('目标不可达'));
 await page.unroute('**/api/arms/right/robot/jog/cartesian');
 checks.push('business rejection appears only on right, retained request id');
 await page.route('**/api/arms/left/robot/state',async route=>{const response=await route.fetch();const body=await response.json();body.data.robot_state='ERROR_STATE';await route.fulfill({response,json:body});});
 await until(async()=> (await summary('left').innerText()).includes('运行错误：ERROR_STATE'),'No runtime error');
 assert.ok(!(await summary('right').innerText()).includes('运行错误：ERROR_STATE'));
 await page.unroute('**/api/arms/left/robot/state');
 checks.push('runtime ERROR_STATE appears only on affected arm');
 await page.route('**/api/arms/right/robot/state',route=>route.abort());
 await until(async()=> (await summary('right').innerText()).includes('反馈过期'),'No stale warning');
 assert.equal(await page.getByRole('button',{name:'右臂 Z 正向点动',exact:true}).isEnabled(),false);
 await until(async()=>['IDLE','STOPPED'].includes(await summary('left').locator('.machine-state b').innerText()),'Other arm state did not recover');
 assert.equal(await summary('left').locator('.arm-summary-top > .state:not(.machine-state)').innerText(),'已使能');
 await page.unroute('**/api/arms/right/robot/state');
 checks.push('one-arm connection failure locks that arm only');
 await page.getByRole('button',{name:'控制器日志',exact:true}).click();
 await page.locator('.dual-log-demo summary').click();
 assert.ok((await page.locator('.dual-log-demo').innerText()).includes('test-reject-42'));
 checks.push('request details retained alongside controller logs');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks},null,2));
} finally {
 await page.unrouteAll({behavior:'ignoreErrors'});
 for(const [side,headers] of Object.entries(credentials)) {
  for(const action of ['robot/jog/stop',...((await state(side)).robot_state==='ERROR_STATE'?['robot/reset']:[]),'robot/disable','control/release']) {
   const result=await (await page.request.post(`${origin}/api/arms/${side}/${action}`,{headers,data:{}})).json();
   console.log('cleanup',side,action,result.success,result.code);
   if(action==='robot/reset') await until(async()=>['IDLE','STOPPED'].includes((await state(side)).robot_state),'Cleanup reset failed');
  }
 }
 await browser.close();
}
