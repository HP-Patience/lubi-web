// Phase B acceptance: production bundle + isolated synthetic SQLite. No debug bridge or owner Vault.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startApp, seed, browserOptions, testPassword, testDate, output, delay } from './support.mjs';
const app=await startApp();await seed(app);
const browser=await chromium.launch(await browserOptions()).catch(async error=>{await app.stop();throw error;});
const context=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:1,timezoneId:'Asia/Shanghai',locale:'zh-CN'});
const page=await context.newPage();page.setDefaultTimeout(12000);await page.clock.setFixedTime(new Date('2026-10-18T06:00:00Z'));
const folder=join(output,'ui-review','states');mkdirSync(folder,{recursive:true});
const report={kind:'approved Web cognitive simplification',fixture:'synthetic only',steps:[],errors:[],measurements:{}};
page.on('pageerror',e=>report.errors.push(e.message));
const saveReport=()=>writeFileSync(join(output,'ui-review','acceptance.json'),JSON.stringify(report,null,2));
const modal=()=>page.locator('.modal').last();
const store=async()=>JSON.parse((await app.json('/vault/file?path='+encodeURIComponent('任务/任务数据.json'))).text);
const journal=async()=>(await app.json('/vault/file?path='+encodeURIComponent(`日记/${testDate}.md`))).text;
const snapshot=()=>app.json('/vault/snapshot');
const activeFiles=async()=>(await snapshot()).documents.filter(d=>d.kind==='file'&&!d.path.startsWith('Lubi-导出-')).map(d=>[d.path,d.text]);
async function until(fn,message='condition not met'){for(let i=0;i<120;i++){if(await fn())return;await delay(100);}throw Error(message);}
async function ready(){await delay(240);await until(async()=>await page.locator('.lubi-body').getAttribute('aria-busy')==='false');}
async function close(){await page.keyboard.press('Escape');await delay(150);}
async function menu(name){await page.locator('.lubi-more-btn').click();await page.getByRole('menuitem',{name,exact:true}).click();}
async function details(selector,open=true){const d=modal().locator(selector);if(await d.evaluate(e=>e.open)!==open)await d.locator(':scope > summary').click();}
async function newTask(title){if(await page.locator('.lubi-topbar-cta').isVisible())await page.locator('.lubi-topbar-cta').click();else await page.keyboard.press('n');await page.getByPlaceholder('要做什么',{exact:true}).fill(title);}
async function saveTask(){await page.locator('[data-lubi-focus="task:save"]').click();await until(async()=>await page.locator('.modal').count()===0);await ready();}
async function shot(name){await page.mouse.move(0,0);await page.screenshot({path:join(folder,name+'.png'),animations:'disabled'});}
async function step(name,fn){const at=Date.now();try{await fn();report.steps.push({name,passed:true,milliseconds:Date.now()-at});console.log('PASS '+name);}catch(e){report.steps.push({name,passed:false,error:e.stack});await shot('failure');writeFileSync(join(folder,'failure.html'),await page.content());throw e;}finally{saveReport();}}
try {
 await page.goto(app.base);await page.getByLabel('访问密码').fill(testPassword);await page.getByRole('button',{name:'进入工作区'}).click();await page.locator('.lubi-tasks').waitFor();await ready();
 assert.equal(await page.evaluate(()=>!!window.__lubi),false);
 await step('Ordinary creation initially exposes only task, date and estimate; opening/collapsing writes nothing',async()=>{
  const before=await activeFiles();await newTask('渐进表单草稿');
  const fields=await modal().locator('input:not([type="hidden"]):visible,select:visible,textarea:visible').count();report.measurements.newTaskVisibleFields=fields;assert.equal(fields,3);
  assert.equal(await modal().locator('.lubi-new-task-more').evaluate(e=>e.open),false);assert.equal(await modal().locator('.lubi-new-task-actual').evaluate(e=>e.open),false);
  await details('.lubi-new-task-more');await details('.lubi-new-task-more',false);await close();assert.deepEqual(await activeFiles(),before);
 });
 await step('Collapsing notes and project creation keeps values, including across a category rerender',async()=>{
  await newTask('保留可选字段的任务');await page.getByPlaceholder('如 45min / 2.5h',{exact:true}).fill('45min');await details('.lubi-new-task-more');assert.equal(await page.getByLabel('新项目名称',{exact:true}).isVisible(),false);
  await modal().locator('.lubi-extras-toggles button').filter({hasText:'备注'}).click();await page.getByLabel('备注',{exact:true}).fill('折叠后仍然保留的备注');
  await modal().locator('[data-extra-name="备注"]').getByRole('button',{name:'收起',exact:true}).click();assert.equal(await page.getByLabel('备注',{exact:true}).isVisible(),false);
  await page.getByLabel('所属项目',{exact:true}).selectOption({label:'＋ 创建新项目…'});await page.getByLabel('新项目名称',{exact:true}).fill('尚未创建的项目草稿');
  await modal().locator('[data-extra-name="项目"]').getByRole('button',{name:'收起',exact:true}).click();
  await details('.lubi-new-task-more',false);await details('.lubi-new-task-more');
  const category=page.getByLabel('分类',{exact:true});const values=await category.locator('option').evaluateAll(options=>options.map(o=>o.value));await category.selectOption(values.find(v=>v!=='学习')||values[0]);
  await modal().locator('.lubi-extras-toggles button').filter({hasText:'项目'}).click();await page.getByLabel('所属项目',{exact:true}).selectOption({label:'＋ 创建新项目…'});assert.equal(await page.getByLabel('新项目名称',{exact:true}).inputValue(),'尚未创建的项目草稿');
  await page.getByRole('button',{name:'取消新建',exact:true}).click();assert.equal(await page.getByLabel('新项目名称',{exact:true}).isVisible(),false);await modal().locator('.lubi-extras-toggles button').filter({hasText:'备注'}).click();assert.equal(await page.getByLabel('备注',{exact:true}).inputValue(),'折叠后仍然保留的备注');
  await page.getByLabel('计划开始时间',{exact:true}).fill('19:00');await page.locator('[data-task-location]').fill('草稿地点');await details('.lubi-new-task-more',false);const before=await journal();await saveTask();
  const task=(await store()).tasks.find(t=>t.title==='保留可选字段的任务');assert.equal(task.notes,'折叠后仍然保留的备注');assert.equal(task.estimate,45);assert.equal(task.start,'19:00');assert.equal(task.location,'草稿地点');assert(!task.project);assert.equal(await journal(),before);
 });
 await step('Invalid estimate text survives rerender; validation focuses the original input',async()=>{
  await newTask('无效预计草稿');await page.getByPlaceholder('如 45min / 2.5h',{exact:true}).fill('不是有效时长');await details('.lubi-new-task-more');await page.getByLabel('分类',{exact:true}).selectOption({index:1});await details('.lubi-new-task-more',false);
  assert.equal(await page.getByPlaceholder('如 45min / 2.5h',{exact:true}).inputValue(),'不是有效时长');await page.locator('[data-lubi-focus="task:save"]').click();assert.equal(await page.getByPlaceholder('如 45min / 2.5h',{exact:true}).getAttribute('aria-invalid'),'true');assert(!(await store()).tasks.some(t=>t.title==='无效预计草稿'));await close();
 });
 await step('Hidden actual validation reveals the field; filled collapse retains separate plan/actual/completion',async()=>{
  await newTask('可选实际用时任务');await page.getByPlaceholder('如 45min / 2.5h',{exact:true}).fill('45min');await details('.lubi-new-task-actual');await page.locator('[data-actual="minutes"]').fill('abc');await details('.lubi-new-task-actual',false);
  await page.locator('[data-lubi-focus="task:save"]').click();assert.equal(await modal().locator('.lubi-new-task-actual').evaluate(e=>e.open),true);assert(await page.locator('[data-actual="minutes"]').evaluate(e=>e===document.activeElement));await shot('hidden-validation');
  await page.locator('[data-actual="minutes"]').fill('25min');await page.locator('[data-actual="start"]').fill('18:00');assert.equal(await page.locator('[data-actual-action="complete"]').isChecked(),false);await details('.lubi-new-task-actual',false);assert.match(await modal().locator('.lubi-new-task-actual > summary').innerText(),/25min/);await saveTask();
  const task=(await store()).tasks.find(t=>t.title==='可选实际用时任务');assert.equal(task.estimate,45);assert.equal(task.status,'todo');assert.match(await journal(),/可选实际用时任务.*时长:: 25min/);assert.match(await journal(),/可选实际用时任务.*预计用时:: 45min/);
 });
 await step('Duration-like ordinary titles never silently create actual records on list/calendar/review/command routes',async()=>{
  const before=await journal();
  for(const route of ['list','calendar','review','command']){
   if(route==='review')await page.locator('.lubi-topbar-tabs').getByRole('button',{name:'回顾',exact:true}).click();
   else {await page.locator('.lubi-topbar-tabs').getByRole('button',{name:'计划',exact:true}).click();await page.locator(`[data-lubi-focus="schedule:${route==='calendar'?'calendar':'list'}"]`).click();await ready();}
   const title=`普通任务-${route} 30min`;
   if(route==='command'){await page.keyboard.press('Control+p');await page.getByRole('combobox',{name:'搜索 Lubi 命令'}).fill('新建任务 / 支出');await page.keyboard.press('Enter');await page.getByPlaceholder('要做什么',{exact:true}).fill(title);}else await newTask(title);
   await saveTask();assert((await store()).tasks.some(t=>t.title===title&&t.estimate===0&&t.status==='todo'));
  }
  assert.equal(await journal(),before);
 });
 await step('Explicit actual entry retains quick time parsing and never infers completion',async()=>{
  await page.locator('.lubi-topbar-record').click();await page.getByPlaceholder('要做什么',{exact:true}).fill('19:00-19:30 学习 显式快捷实际');await saveTask();assert.match(await journal(),/19:00.*显式快捷实际.*时长:: 30min/);
 });
 await step('A nonrecurring cross-date review remains prominent and shows its occurrence date',async()=>{
  await page.locator('[data-lubi-focus="schedule:list"]').click();await ready();await newTask('跨日期后台审核');await details('.lubi-new-task-more');await modal().locator('.lubi-extras-toggles button').filter({hasText:'执行方式'}).click();await page.getByLabel('执行方式',{exact:true}).selectOption('background');await saveTask();
  const task=(await store()).tasks.find(t=>t.title==='跨日期后台审核'),before=await journal();
  await page.locator(`.lubi-task[data-task-id="${task.id}"]`).hover();await page.locator(`.lubi-task[data-task-id="${task.id}"] [data-background-action="running"]`).click();await page.locator(`.lubi-background-card [data-task-id="${task.id}"]`).waitFor();
  await page.locator(`.lubi-background-card [data-task-id="${task.id}"] [data-background-action="review"]`).click();await page.locator(`.lubi-attention-card [data-task-id="${task.id}"]`).waitFor();await page.locator('[data-lubi-focus="planning:next"]').click();await ready();
  const review=page.locator(`.lubi-attention-card [data-task-id="${task.id}"]`);await review.waitFor();assert.match(await review.innerText(),/发生日 2026-10-18/);assert.equal(await page.locator('.lubi-attention-card').evaluate(e=>!!e.closest('details:not([open])')),false);assert.equal(await journal(),before);await shot('cross-date-review');
  await page.locator('[data-lubi-focus="planning:previous"]').click();await ready();
 });
 await step('Fresh journal failure is unknown, not zero; error stays expanded and retry restores real data',async()=>{
  const personal=page.locator('.lubi-personal-time');if(await personal.evaluate(e=>e.open))await personal.locator(':scope > summary').click();
  const pattern=url=>url.pathname==='/api/vault/file'&&url.searchParams.get('path')===`日记/${testDate}.md`;
  await page.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成读取失败'})}));
  await page.locator('[data-lubi-focus="schedule:calendar"]').click();await ready();
  assert.equal(await page.locator('[data-plan-metric="actual"] .lubi-plan-metric-value').innerText(),'暂不可读');assert.equal(await page.locator('.lubi-personal-time').getAttribute('data-read-state'),'error');assert.equal(await page.locator('.lubi-personal-time').evaluate(e=>e.open),true);assert.equal(await page.locator('.lubi-timeline').count(),0);await page.getByRole('alert').filter({hasText:'未按 0 计算'}).first().waitFor();await shot('read-error');
  await page.unroute(pattern);await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('.lubi-timeline').waitFor();await ready();assert.notEqual(await page.locator('[data-plan-metric="actual"] .lubi-plan-metric-value').innerText(),'暂不可读');
 });
 await step('Loading retains prior results with an explicit pending state instead of zero placeholders',async()=>{
  let held;const pattern=url=>url.pathname==='/api/vault/file'&&url.searchParams.get('path')===`日记/${testDate}.md`;
  await page.route(pattern,route=>{held=route;});const value=await page.locator('[data-plan-metric="actual"] .lubi-plan-metric-value').innerText();await page.locator('[data-lubi-focus="schedule:list"]').click();await until(()=>!!held);
  await page.getByRole('status').filter({hasText:'正在更新'}).waitFor();assert.equal(await page.locator('.lubi-body').getAttribute('aria-busy'),'true');assert.equal(await page.locator('[data-plan-metric="actual"] .lubi-plan-metric-value').innerText(),value);await shot('loading');await held.continue();await page.unroute(pattern);await ready();
 });
 await step('Actions are placed by purpose, with all thirteen registered commands retained',async()=>{
  for(const [label,title] of [['计时','实时计时'],['待整理','待整理']]){await page.locator('.lubi-context-tools').getByRole('button',{name:label,exact:true}).click();await modal().locator('.modal-title').filter({hasText:title}).waitFor();assert.equal(await modal().locator('.product-nav').count(),0);await close();}
  await page.locator('.lubi-topbar-tabs').getByRole('button',{name:'回顾',exact:true}).click();await page.locator('.lubi-context-tools').getByRole('button',{name:'投入与成果',exact:true}).click();await page.getByLabel('查看对象',{exact:true}).waitFor();await close();await page.locator('.lubi-context-tools').getByRole('button',{name:'周复盘',exact:true}).click();await page.getByLabel('本周发现：保留什么、减少什么？',{exact:true}).waitFor();await close();
  await page.keyboard.press('Control+p');assert.equal(await page.locator('.web-command-list [role="option"]').count(),13);await close();
 });
 await step('Settings/data tabs retain the same input node and draft, with arrow-key navigation',async()=>{
  await menu('设置');const model=page.getByLabel('AI 模型',{exact:true});const disclosure=modal().locator('details').filter({has:model});if(await disclosure.count())await disclosure.evaluate(e=>e.open=true);await model.fill('合成输入暂不关闭');const node=await model.elementHandle();
  const tabs=modal().getByRole('tab');await tabs.filter({hasText:'设置'}).focus();await page.keyboard.press('ArrowRight');assert.equal(await tabs.filter({hasText:'备份与恢复'}).getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowLeft');assert.equal(await model.inputValue(),'合成输入暂不关闭');assert(await node.evaluate(e=>e.isConnected));await close();
 });
 await step('Backup formats are explicit and incompatible restores are rejected without active-file changes',async()=>{
  await menu('备份与恢复');for(const label of ['业务数据 JSON','Web 文件备份','SQLite 整库与密钥备份'])await modal().getByRole('region',{name:label,exact:true}).waitFor();
  assert.match(await modal().innerText(),/不包含插件设置、计时会话/);assert.match(await modal().innerText(),/LUBI_SECRET_KEY/);assert.equal(await modal().getByRole('button',{name:/覆盖.*数据库/}).count(),0);
  let waiting=page.waitForEvent('download');await page.getByRole('button',{name:'导出数据 JSON',exact:true}).click();let download=await waiting;const business=join(folder,'business.json');await download.saveAs(business);
  waiting=page.waitForEvent('download');await page.getByRole('button',{name:'下载 Web 文件备份',exact:true}).click();download=await waiting;const files=join(folder,'files.json');await download.saveAs(files);
  assert.equal(JSON.parse(readFileSync(business)).format,'lubi-data');const vault=JSON.parse(readFileSync(files));assert.equal(vault.format,'lubi-web-vault');assert(!('settings' in vault));
  const before=await activeFiles();await page.getByRole('button',{name:'恢复业务数据',exact:true}).click();await page.getByLabel('选择完整导出 JSON',{exact:true}).setInputFiles(files);await until(async()=>await modal().locator('[aria-busy="true"]').count()===0);await page.getByRole('checkbox',{name:'已核对预览，确认创建隔离恢复副本'}).check();await page.getByRole('button',{name:'开始隔离恢复',exact:true}).click();await delay(200);assert.deepEqual(await activeFiles(),before);assert.equal(await modal().locator('.product-box').innerText(),'');await close();
  await page.getByRole('button',{name:'恢复 Web 文件备份',exact:true}).click();await page.getByLabel('选择 Web 文件备份',{exact:true}).setInputFiles(business);await until(async()=>!(await modal().getByRole('status').innerText()).includes('校验'));assert.equal(await page.getByRole('button',{name:'确认隔离恢复 Web 文件',exact:true}).isDisabled(),true);assert.deepEqual(await activeFiles(),before);await shot('wrong-backup-format');await close();await close();
 });
 await step('Narrow/dark progressive forms are bounded, keyboard usable, and preserve a filled disclosure',async()=>{
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.body.classList.add('theme-dark');document.body.classList.remove('theme-light');});await newTask('窄屏键盘草稿');await details('.lubi-new-task-more');await page.locator('[data-task-location]').fill('窄屏保留');await details('.lubi-new-task-more',false);
  const box=await modal().boundingBox();assert(box.x>=0&&box.x+box.width<=391);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement?.closest('.modal')));await shot('dark-narrow-form');await details('.lubi-new-task-more');assert.equal(await page.locator('[data-task-location]').inputValue(),'窄屏保留');await close();await page.setViewportSize({width:1400,height:1000});
 });
 await step('Only confirmed empty data collapses optional panels; zero review has no redundant empty card',async()=>{
  const t=await app.json('/vault/file?path='+encodeURIComponent('任务/任务数据.json'));
  await app.json('/vault/file','PUT',{path:t.path,kind:'file',text:JSON.stringify({version:14,tasks:[],projects:[]}),expectedRevision:t.revision});
  const j=await app.json('/vault/file?path='+encodeURIComponent(`日记/${testDate}.md`));await app.json('/vault/file','PUT',{path:j.path,kind:'file',text:'## 记录\n',expectedRevision:j.revision});
  await page.reload();await page.locator('.lubi-tasks').waitFor();await ready();
  assert.equal(await page.locator('.lubi-attention-card').count(),0);assert.equal(await page.locator('.lubi-background-card').evaluate(e=>e.open),false);assert.equal(await page.locator('.lubi-personal-time').evaluate(e=>e.open),false);assert.equal(await page.locator('.lubi-personal-time').getAttribute('data-read-state'),'ready');
  assert.equal(await page.locator('[data-plan-metric="actual"] .lubi-plan-metric-value').innerText(),'0min');await shot('confirmed-empty');
 });
 await step('No uncaught browser runtime errors',async()=>assert.deepEqual(report.errors,[]));
 report.passed=true;
} catch(error) {report.passed=false;console.error(error);process.exitCode=1;}
finally {saveReport();await browser.close();await app.stop();}
console.log(`UI_REVIEW_RESULT ${report.passed?'PASS':'FAIL'} ${report.steps.filter(s=>s.passed).length}/${report.steps.length}`);
