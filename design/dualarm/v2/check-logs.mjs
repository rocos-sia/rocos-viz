import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
const events = [
  ['process','info','验证 · Startup','双臂诊断测试数据：两个 Robot 已初始化，当前均禁用。',null],
  ['left','info','验证 · DualArm.Http','POST control/acquire accepted',null,'POST control/acquire'],
  ['right','warn','验证 · DualArm.Http','POST robot/enable rejected',3007,'POST robot/enable'],
  ['left','info','验证 · DualArm.Http','POST robot/movej accepted',null,'POST robot/movej'],
  ['left','info','验证 · Robot','Motion completed at control cycle 42100: NoError (0).',null],
  ['right','error','验证 · Hardware','测试告警：驱动状态反馈异常。',-3001],
].map(([arm,level,module,message,code,op],i)=>({id:`fixture:${i+1}`,timestamp:`2026-11-17T09:41:${String(20+i).padStart(2,'0')}.123Z`,arm,level,module,message,code,ecat_id:arm==='process'?null:arm==='left'?0:1,device_id:arm==='process'?null:`test-${arm}`,category:op?'operation':'log',operation:op?{name:op,request_id:`test-request-${i+1}`,outcome:code?'rejected':'accepted',http_status:200,duration_ms:1.24}:null}));
const streams = new Set(), requests = []; let delayHistory = false;
const server = http.createServer((req,res)=>{
  requests.push({url:req.url,method:req.method,headers:req.headers});
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Expose-Headers','Content-Disposition, X-Rocos-Log-Snapshot-Time');
  if (req.url.startsWith('/api/dualarm/logs/stream')) {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write('retry: 200\n: connected\n\n');
    streams.add(res); req.on('close',()=>streams.delete(res));
  } else if (req.url.startsWith('/api/dualarm/logs?')) {
    const reply=()=>{if(!res.destroyed){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,code:0,data:{events,next_id:'fixture:6',has_more:false,gap:null}}));}};
    if(delayHistory)setTimeout(reply,1000);else reply();
  } else if(req.url==='/api/logs/file/latest') {
    res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="dualarm-test.log"');res.setHeader('X-Rocos-Log-Snapshot-Time','2026-11-17T09:41:26.000Z');res.end('[fixture] [arm=left ecat_id=0] INFO operation accepted\n[fixture] [arm=right ecat_id=1] WARN rejected token\n');
  } else {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const endpoint=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=async predicate=>{for(let n=0;n<100;n++){if(await predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('condition timeout');};
try {
  await page.goto('http://127.0.0.1:5186/#logs');
  await page.getByLabel('诊断地址',{exact:true}).fill(endpoint);
  await page.getByRole('button',{name:'连接日志',exact:true}).click();
  await page.getByText('实时接收',{exact:true}).waitFor();
  assert.equal(streams.size,1);assert.equal(await page.locator('.dual-log-row').count(),2);
  await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('left');
  assert.equal(await page.locator('.dual-log-row').count(),0);
  await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('all');
  await page.getByRole('button',{name:'操作反馈',exact:true}).click();
  assert.equal(await page.locator('.dual-log-row').count(),6);
  for(const res of streams)res.write(`id: fixture:6\nevent: log\ndata: ${JSON.stringify(events[5])}\n\n`);
  await page.waitForTimeout(100);assert.equal(await page.locator('.dual-log-row').count(),6);
  await page.getByRole('searchbox').fill('test-request-4');assert.equal(await page.locator('.dual-log-row').count(),1);
  await page.getByRole('searchbox').fill('');
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.screenshot({path:`design/dualarm/v2/logs-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'design/dualarm/v2/logs.jpg',fullPage:true});
  for(const res of streams)res.write('event: gap\ndata: {"reason":"producer_overflow","earliest_id":"fixture:1","count":2}\n\n');
  await page.getByText(/控制器日志队列溢出/).waitFor();
  for(const res of [...streams])res.end();
  await wait(()=>requests.filter(r=>r.url.startsWith('/api/dualarm/logs/stream')).length>=2);
  assert.equal(requests.filter(r=>r.url.startsWith('/api/dualarm/logs/stream')).at(-1).headers['last-event-id'],'fixture:6');
  await page.getByRole('button',{name:'日志文件',exact:true}).click();
  await page.getByRole('button',{name:'刷新预览',exact:true}).click();await page.getByText('[fixture] [arm=left',{exact:false}).waitFor();
  assert.match(await page.locator('.dual-log-file pre').innerText(),/arm=right ecat_id=1/);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'下载完整快照'}).click()]);assert.equal(download.suggestedFilename(),'dualarm-test.log');
  await page.getByRole('button',{name:'手动示教',exact:true}).click();
  assert.equal(streams.size,1);
  const slider=page.getByRole('slider',{name:'点动速度',exact:true});await slider.focus();await page.keyboard.press('ArrowRight');assert.equal(await slider.inputValue(),'0.11');
  assert.equal(await page.getByRole('spinbutton',{name:'点动速度',exact:true}).count(),0);
  await page.getByRole('button',{name:'精确运动',exact:true}).click();
  const motion=page.getByRole('slider',{name:'运动速度',exact:true});await motion.focus();await page.keyboard.press('End');assert.equal(await motion.inputValue(),'0.5');
  await page.getByRole('button',{name:'控制器日志',exact:true}).click();
  assert.equal(streams.size,1);
  await page.getByRole('button',{name:'断开连接',exact:true}).click();await wait(()=>streams.size===0);
  delayHistory=true;
  await page.getByRole('button',{name:'连接日志',exact:true}).click();await page.getByRole('button',{name:'断开连接',exact:true}).click();
  await page.waitForTimeout(1200);assert.equal(streams.size,0);assert.equal(await page.getByText('未连接',{exact:true}).count(),1);
  const saved=await page.evaluate(()=>localStorage.getItem('rocos.dualarm.diagnostics'));
  await page.getByLabel('诊断地址',{exact:true}).fill('http://user:example-secret@127.0.0.1:8082');
  await page.getByRole('button',{name:'连接日志',exact:true}).click();
  await page.getByText('连接失败',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('rocos.dualarm.diagnostics')),saved);
  await page.getByLabel('诊断地址',{exact:true}).fill(endpoint);
  await page.screenshot({path:'design/dualarm/v2/logs-error.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('rocos-ui', JSON.stringify({state:{language:'en'},version:0})));
  await page.reload(); await page.getByRole('button',{name:'Connect logs',exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Controller logs',exact:true}).count(),1);
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&!r.headers['x-rocos-control-token']&&!r.headers.cookie));
  fs.writeFileSync('design/dualarm/v2/logs-review.json',JSON.stringify({passed:true,source:'Explicitly labelled synthetic test data served over local HTTP/SSE',checks:['single process-wide subscription across navigation','scope/level/search filters','deduplication','gap notification','native reconnect Last-Event-ID','file preview and download','disconnect aborts stale history','keyboard speed sliders','no page overflow at 1440/768/390','GET only, no credentials or cookies','Chinese and English log controls','invalid endpoint fails without persisting embedded credentials'],errors},null,2));
  console.log('Dual-arm logs and sliders browser checks passed');
} finally {await browser.close();for(const res of streams)res.end();server.closeAllConnections();await new Promise(r=>server.close(r));}
