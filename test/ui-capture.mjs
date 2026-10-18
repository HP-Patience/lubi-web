// Review evidence only. Both phases use the same synthetic fixtures and viewport.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startApp, seed, browserOptions, testPassword, testDate, output, delay } from './support.mjs';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const folder=join(output,'ui-review',phase);mkdirSync(folder,{recursive:true});
const app=await startApp();await seed(app);
const browser=await chromium.launch(await browserOptions()).catch(async error=>{await app.stop();throw error;});
const context=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:1,timezoneId:'Asia/Shanghai',locale:'zh-CN',colorScheme:'light'});
const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-18T06:00:00Z'));page.setDefaultTimeout(15000);
const errors=[],scenes=[];page.on('pageerror',e=>errors.push(e.message));
async function wait(){await page.waitForFunction(()=>document.querySelector('.lubi-tasks')&&!document.querySelector('.lubi-body[aria-busy="true"]'));await delay(250);}
async function close(){await page.keyboard.press('Escape');await delay(150);}
async function menu(label){await page.locator('.lubi-more-btn').click();await page.getByRole('menuitem',{name:label,exact:true}).click();await delay(200);}
async function shot(name){await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await delay(100);const measures=await page.evaluate(()=>{const modal=[...document.querySelectorAll('.modal')].at(-1),root=modal||document.querySelector('.lubi-root');const visible=e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&!!e.getClientRects().length;return {visibleInputs:[...root.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(visible).map(e=>({type:e.type||e.tagName,label:e.getAttribute('aria-label')||root.querySelector(`label[for="${e.id}"]`)?.textContent||e.placeholder})),openDisclosures:[...root.querySelectorAll('details[open]')].filter(visible).map(e=>e.querySelector('summary')?.textContent),visibleText:root.innerText,viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth};});await page.screenshot({path:join(folder,name+'.png'),animations:'disabled'});scenes.push({name,...measures});}
try {
 await page.goto(app.base);await page.getByLabel('访问密码').fill(testPassword);await page.getByRole('button',{name:'进入工作区'}).click();await wait();
 await shot('overview');
 await page.locator('.lubi-topbar-cta').click();await page.getByPlaceholder('要做什么',{exact:true}).waitFor();await shot('new-task');await close();
 await page.locator('.lubi-task').getByRole('button',{name:/^编辑 /}).first().click();await page.locator('.lubi-task-modal').waitFor();await delay(300);await shot('edit-task');await close();
 if(phase==='before'){await menu('设置');}else await menu('备份与恢复');
 await page.locator('.web-settings-modal').waitFor();await shot('backups');await close();
 await page.evaluate(()=>{document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');});await shot('dark');
 await page.evaluate(()=>{document.body.classList.remove('theme-dark');document.body.classList.add('theme-light');});
 await page.setViewportSize({width:390,height:844});await shot('narrow');await page.setViewportSize({width:1400,height:1000});
 const snapshot=await app.json('/vault/snapshot');
 for(const f of snapshot.documents.filter(f=>f.kind==='file'&&f.path.startsWith('日记/'))) await app.json('/vault/file','PUT',{path:f.path,kind:'file',text:'## 记录\n',expectedRevision:f.revision});
 const taskFile=snapshot.documents.find(f=>f.path==='任务/任务数据.json');
 await app.json('/vault/file','PUT',{path:taskFile.path,kind:'file',text:JSON.stringify({version:14,tasks:[],projects:[]}),expectedRevision:taskFile.revision});
 await page.reload();await wait();await shot('empty');
 assert.deepEqual(errors,[]);
} finally {writeFileSync(join(folder,'report.json'),JSON.stringify({phase,measurement:'visibility v2: checkVisibility excludes closed details; original before evidence is preserved',fixture:'synthetic demoData; same fixture, no production data',date:testDate,scenes,errors},null,2));await browser.close();await app.stop();}
console.log('UI_CAPTURE_OK '+phase+' '+scenes.length+' scenes');
