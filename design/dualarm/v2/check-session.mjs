// Real App lease lifecycle only: never enables either arm or sends motion.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.DUALARM_PREVIEW_URL||'http://127.0.0.1:5186';
const key='rocos.dualarm.control.v1';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();
const credentials={},requests=[],errors=[];let duplicate;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{
 if(r.method()!=='POST')return;
 requests.push(new URL(r.url()).pathname);
 const side=r.url().match(/\/api\/arms\/(left|right)\//)?.[1],headers=r.headers();
 if(side&&headers['x-rocos-control-token'])credentials[side]={'X-Rocos-Control-Token':headers['x-rocos-control-token'],'X-Rocos-Client-Id':headers['x-rocos-client-id']};
});
const saved=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
const summary=side=>page.locator(`.arm-summary.${side}`);
async function waitOwned(side,owned=true){await page.waitForFunction(({side,owned})=>document.querySelector(`.arm-summary.${side} .owner`)?.textContent.includes('已获控制权')===owned,{side,owned});}
try {
 await page.goto(origin);
 for(const side of ['left','right']) {
  const button=summary(side).getByRole('button',{name:'申请控制权',exact:true});
  await button.click();await waitOwned(side);
 }
 const initial=await saved();
 assert.ok(initial.tokens.left&&initial.tokens.right);
 await page.reload();await waitOwned('left');await waitOwned('right');
 assert.equal(JSON.stringify(await saved())===JSON.stringify(initial),true);assert.equal(requests.filter(p=>p.endsWith('/acquire')).length,2);
 console.log('PASS: both leases survive reload via heartbeat, no repeated acquire');
 const opened=context.waitForEvent('page');await page.evaluate(()=>window.open('/','lease-copy'));
 duplicate=await opened;await duplicate.waitForLoadState();
 await duplicate.waitForFunction(key=>JSON.parse(sessionStorage.getItem(key))?.tokens.left==='',key);
 const copy=await duplicate.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
 assert.notEqual(copy.clientId,initial.clientId);assert.equal(copy.tokens.right,'');
 assert.equal(await summary('right').locator('.owner').innerText(),'已获控制权');await duplicate.close();duplicate=null;
 console.log('PASS: copied tab cannot reuse original credentials');
 await summary('left').getByRole('button',{name:'释放',exact:true}).click();await waitOwned('left',false);
 await page.reload();await waitOwned('right');assert.equal((await saved()).tokens.left,'');
 console.log('PASS: release persists; right arm survives independently');
 await page.route('**/api/arms/right/control/heartbeat',route=>route.abort());
 await waitOwned('right',false);assert.equal((await saved()).tokens.right===initial.tokens.right,true);
 await page.unroute('**/api/arms/right/control/heartbeat');await waitOwned('right');
 assert.equal(requests.filter(p=>p.endsWith('/acquire')).length,2);
 console.log('PASS: transient network failure retains token and recovers');
 await page.route('**/api/arms/right/control/heartbeat',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:false,code:3007,message:'Invalid or missing control credentials for selected arm',data:null})}));
 await waitOwned('right',false);await page.waitForFunction(key=>JSON.parse(sessionStorage.getItem(key)).tokens.right==='',key);
 console.log('PASS: server-rejected token is cleared; no automatic acquisition');
 assert.equal(requests.filter(p=>p.endsWith('/acquire')).length,2);
 assert.ok(!requests.some(p=>p.includes('/robot/')),'Lease test unexpectedly sent a robot command');
 assert.deepEqual(errors,[]);
} finally {
 await page.unrouteAll({behavior:'ignoreErrors'});
 for(const [side,headers] of Object.entries(credentials)) {
  const status=(await (await page.request.get(`${origin}/api/arms/${side}/control/status`)).json()).data;
  if(status.has_owner&&status.owner_client_id===headers['X-Rocos-Client-Id']) {
   const result=await (await page.request.post(`${origin}/api/arms/${side}/control/release`,{headers,data:{}})).json();
   assert.equal(result.success,true);
  }
 }
 await duplicate?.close();await browser.close();
}
