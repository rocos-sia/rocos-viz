import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(new URL('../../../../rocos-mujoco/config/dualarm/shoulder_frames.json',import.meta.url)));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const origin=process.env.DUALARM_PREVIEW_URL||'http://127.0.0.1:5186';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function feedback(){
  await page.waitForFunction(()=>[...document.querySelectorAll('.pose-value')].length===12&&[...document.querySelectorAll('.pose-value')].every(e=>e.textContent!=='—'));
  return page.locator('.pose-value').allTextContents();
}
try{
 await page.goto(origin+'/?mode=demo');await page.evaluate(()=>document.fonts.ready);
 const legacy=(await feedback()).map(Number);
 await page.goto(origin+'/?base=shoulder&mode=demo');await page.evaluate(()=>document.fonts.ready);
 const local=(await feedback()).map(Number);
 for(const [index,side] of ['left','right'].entries()){
  for(let axis=0;axis<6;axis++)assert.ok(Math.abs(local[index*6+axis]-(legacy[index*6+axis]-(axis<3?config.arms[side].translation[axis]*1000:0)))<.002);
 }
 await page.locator('.coordinate-label:not([hidden])').filter({hasText:'L · 肩部基座'}).waitFor();
 await page.locator('.coordinate-label:not([hidden])').filter({hasText:'R · 肩部基座'}).waitFor();
 const base=page.locator('.coordinate-label').filter({hasText:'L · 肩部基座'});
 const before=await base.getAttribute('style');
 const button=page.getByRole('button',{name:'左臂 J1 正向点动',exact:true});
 await button.focus();await page.keyboard.down('Enter');await page.waitForTimeout(320);await page.keyboard.up('Enter');
 assert.equal(await base.getAttribute('style'),before,'Shoulder base must not move with J1');
 const moved=await feedback();assert.notDeepEqual(moved.slice(0,6).map(Number),local.slice(0,6));
 moved.slice(6).forEach((v,i)=>assert.equal(Number(v),local[i+6]));
 await page.getByRole('combobox',{name:'左臂反馈坐标系'}).selectOption('300');
 const object=(await feedback()).slice(0,3).map(Number);
 [400,200,0].forEach((v,i)=>assert.ok(Math.abs(object[i]-(v-config.arms.left.translation[i]*1000))<.002));
 await page.getByRole('button',{name:'模型资源',exact:true}).click();
 assert.ok(page.url().includes('base=shoulder'));
 assert.match(await page.locator('a[download]').first().getAttribute('href'),/dualarm_shoulder.urdf$/);
 await page.getByRole('button',{name:'手动示教',exact:true}).click();
 await page.getByRole('combobox',{name:'左臂反馈坐标系'}).selectOption('200');
 await page.getByRole('button',{name:'精确运动',exact:true}).click();
 await page.getByRole('combobox',{name:'运动类型',exact:true}).selectOption('movej_ik');
 assert.ok(await page.getByText('目标法兰位姿 · left_base / 四元数',{exact:true}).isVisible());
 await page.getByRole('button',{name:'点动控制',exact:true}).click();
 await page.locator('.scene-options summary').click();
 await page.getByRole('combobox',{name:'坐标轴显示范围'}).selectOption('left');
 await page.waitForFunction(()=>![...document.querySelectorAll('.coordinate-label:not([hidden])')].some(e=>e.textContent==='R · 肩部基座'));
 await page.getByRole('combobox',{name:'坐标轴显示范围'}).selectOption('both');
 await page.locator('.scene-options summary').click();
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'design/dualarm/v2/shoulder-preview.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: legacy vs shoulder feedback, world-preserved object, fixed bases during J1 jog, independent arm, profile navigation/model download/target labels and scope');
}finally{await browser.close();}
