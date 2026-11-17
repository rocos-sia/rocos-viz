// Run during the owned rocos-app MuJoCo integration; all requests are read-only.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try {
  let ready = false;
  for (let n=0;n<60;n++) {
    try { const response=await fetch('http://127.0.0.1:8082/api/dualarm/logs?limit=1'); if(response.ok){ready=true;break;} } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(ready, 'Owned MuJoCo App diagnostics must be running');
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const requests=[]; page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r);});
  await page.goto('http://127.0.0.1:5186/#logs');
  await page.getByLabel('诊断地址',{exact:true}).fill('http://127.0.0.1:8082');
  await page.getByRole('button',{name:'连接日志',exact:true}).click();
  await page.getByText('实时接收',{exact:true}).waitFor({timeout:10000});
  await page.getByRole('button',{name:'操作反馈',exact:true}).click();
  await page.getByRole('searchbox').fill('robot/movej');
  await page.waitForFunction(()=>document.querySelector('.dual-log-table').innerText.includes('左臂') && document.querySelector('.dual-log-table').innerText.includes('右臂'),{},{timeout:20000});
  const rows=await page.locator('.dual-log-table').innerText();
  assert.match(rows,/movej/);
  await page.getByRole('searchbox').blur();
  await page.screenshot({path:'design/dualarm/v2/logs-live.jpg'});
  assert.ok(requests.every(r=>r.method()==='GET'));
  console.log('Real MuJoCo App history/SSE displayed in browser; screenshot logs-live.jpg');
} finally { await browser.close(); }
