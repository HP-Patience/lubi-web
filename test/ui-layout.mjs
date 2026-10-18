// Current Web layout acceptance, not equality to Obsidian's historical UI.
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startApp,seed,browserOptions,testPassword,output,delay } from './support.mjs';
const app=await startApp();await seed(app);
const browser=await chromium.launch(await browserOptions()).catch(async error=>{await app.stop();throw error;});
const context=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:1,timezoneId:'Asia/Shanghai',locale:'zh-CN'});
const page=await context.newPage();page.setDefaultTimeout(12000);await page.clock.setFixedTime(new Date('2026-10-18T06:00:00Z'));
const report={kind:'Web layout contract v2; explicit UI divergence',scenes:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
const folder=join(output,'ui-review','layouts');mkdirSync(folder,{recursive:true});
const record=()=>writeFileSync(join(folder,'report.json'),JSON.stringify(report,null,2));
async function ready(){await delay(250);await page.waitForFunction(()=>document.querySelector('.lubi-body')?.getAttribute('aria-busy')==='false');}
async function inspect(name,selector){await ready();const measure=await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,invalidStyle:[...document.querySelectorAll('[style]')].some(e=>/NaN|Infinity/.test(e.getAttribute('style')||'')),text:e.textContent};});assert(measure.width>100&&measure.height>20,name);assert(measure.x>=-1&&measure.right<=measure.viewport+1,name+' outside viewport');assert(measure.pageWidth<=measure.viewport,name+' page overflow');assert(!measure.invalidStyle,name+' invalid geometry');assert.equal(await page.locator('.lubi-read-warning,.lubi-error').count(),0);report.scenes.push({name,passed:true,measure});record();}
try{
 await page.goto(app.base);await page.getByLabel('访问密码').fill(testPassword);await page.getByRole('button',{name:'进入工作区'}).click();await page.locator('.lubi-tasks').waitFor();await ready();
 for(const [width,height,dark] of [[1400,1000,false],[1400,1000,true],[900,900,false],[390,844,false]]){
  await page.setViewportSize({width,height});await page.evaluate(dark=>{document.body.classList.toggle('theme-dark',dark);document.body.classList.toggle('theme-light',!dark);},dark);
  for(const mode of ['list','calendar','gantt'])for(const period of ['day','week','month']){
   await page.locator(`[data-lubi-focus="schedule:${mode}"]`).click();await ready();await page.locator(`[data-lubi-focus="planning-period:${period}"]`).click();await ready();
   assert.equal(await page.locator(`[data-lubi-focus="schedule:${mode}"]`).getAttribute('aria-pressed'),'true');assert.equal(await page.locator(`[data-lubi-focus="planning-period:${period}"]`).getAttribute('aria-pressed'),'true');
   const target=mode==='list'?(period==='day'?'.lubi-selected-day-list':'.lubi-plan-list-card'):mode==='gantt'?'.lubi-gantt-card':period==='day'?'.lubi-timeline-wrap':period==='week'?'.lubi-week-card':'.lubi-month-card';
   const name=`${width}-${dark?'dark':'light'}-${mode}-${period}`;await inspect(name,target);
   if(mode==='calendar'&&period==='day'){assert(await page.locator('.lubi-timeline').evaluate(e=>e.scrollHeight>1300));}
   if((width===390||dark)&&period==='day')await page.screenshot({path:join(folder,name+'.png'),animations:'disabled'});
  }
 }
 for(const width of [390,1400]){
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.locator('.lubi-topbar-cta').click();await inspect(`${width}-new-task`,'.modal');
  for(const selector of ['.lubi-new-task-more','.lubi-new-task-actual'])await page.locator(selector+' > summary').click();await inspect(`${width}-expanded-task`,'.modal');assert.equal(await page.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await page.getByRole('dialog').last().getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.lubi-topbar-record').click();await inspect(`${width}-actual-entry`,'.modal');await page.getByRole('dialog').last().getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.lubi-more-btn').click();await page.getByRole('menuitem',{name:'备份与恢复',exact:true}).click();await inspect(`${width}-backup-center`,'.modal');assert.equal(await page.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await page.getByRole('dialog').last().getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.lubi-topbar-tabs').getByRole('button',{name:'回顾',exact:true}).click();await ready();
  for(const period of ['周','月','年']){await page.locator('.lubi-review .lubi-toolbar').getByRole('button',{name:period,exact:true}).click();await inspect(`${width}-review-${period}`,'.lubi-review');}
  await page.locator('.lubi-topbar-tabs').getByRole('button',{name:'计划',exact:true}).click();await ready();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(`WEB_LAYOUT_PASS ${report.scenes.length} scenes; no original UI pixel-parity assertion.`);
}catch(error){report.passed=false;report.failure=error.stack;await page.screenshot({path:join(folder,'failure.png')});console.error(error);process.exitCode=1;}
finally{record();await browser.close();await app.stop();}
