import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';
import {generateMarkdown} from '../dist/review-md.mjs';
import {mdFixture} from './md-fixture.mjs';

/** Base fixture plus a caller for the GET API and a second button on 甲 so conflicts and API status can change. */
function r17Fixture(){
 const data=fixture();
 data.graph.nodes.push(node('save','COMPONENT','儲存',{kind:'BUTTON'}));
 data.graph.relationships.push({id:'4',type:'CONTAINS',from:'a',to:'save'},{id:'5',type:'CALLS',from:'save',to:'ep'});
 data.documents.a='<html><body><button id="shared">共用按鈕</button><button id="save">儲存</button></body></html>';
 return data;
}
async function open(data=r17Fixture(),viewport={width:1440,height:900}){
 const browser=await chromium.launch(),page=await browser.newPage({viewport,reducedMotion:'reduce',acceptDownloads:true}),file=await fileFixture(data),requests=[];
 page.setDefaultTimeout(5000);
 page.on('request',request=>{const url=request.url();if(url!==file&&!url.startsWith('data:')&&!url.startsWith('blob:')&&!url.startsWith('about:'))requests.push(url);});
 await page.goto(file);await page.locator('#app[data-ready="true"]').waitFor();
 return {browser,page,file,requests};
}
const radio=(page,screen,value,component)=>page.locator(`.decision-switch[data-screen-id="${screen}"]${component?`[data-component-id="${component}"]`:':not([data-component-id])'} [data-decision="${value}"]`);

test('R17 report has only the screen and API pages and none of the retired features',async()=>{
 const {browser,page,requests}=await open();
 try{
  assert.deepEqual(await page.locator('.page-tab').allInnerTexts(),['畫面','API']);
  const controls=await page.locator('header').evaluate(header=>[...header.querySelectorAll('button,summary,a,input:not([hidden])')].filter(el=>el.checkVisibility()).length);
  assert.ok(controls<=6,`top bar has ${controls} visible controls`);
  const body=await page.locator('body').innerText();
  for(const retired of ['盤點首頁','逐頁確認','按鈕總表','功能地圖','交付清單','顯示全站導覽','確認模式','元件庫','樣式','分析資訊','使用引導','依證據推定','有歧義','推定使用中','移除原因','備註'])assert.ok(!body.includes(retired),`still shows ${retired}`);
  assert.equal(await page.locator('.feature-lane,.map-legend,.first-run-guide,.global-search-dialog,.information-drawer,.flow-outline').count(),0);
  await page.keyboard.press('Control+k');await page.keyboard.press('Meta+k');
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.locator('.screen-card').count(),2);
  assert.deepEqual(requests,[]);
 }finally{await browser.close();}
});

test('R17 sidebar search matches an actual URL against route templates in the list and on the canvas',async()=>{
 const {browser,page}=await open();
 try{
  await page.getByRole('searchbox',{name:'搜尋 URL 或畫面名稱'}).fill('/owners/42/edit');
  await page.waitForFunction(()=>document.querySelectorAll('.screen-list [data-screen-list]').length===1);
  assert.equal(await page.locator('.screen-list [data-screen-list]').getAttribute('data-screen-list'),'a');
  await page.locator('.screen-card.search-match[data-screen="a"]').waitFor();
  assert.equal(await page.locator('.screen-card.search-match').count(),1);
  await page.getByRole('button',{name:'檔案結構'}).click();
  assert.equal(await page.locator('.file-tree [data-screen-list]').count(),1);
  await page.getByRole('button',{name:'清除搜尋'}).click();
  assert.equal(await page.locator('.file-tree [data-screen-list]').count(),2);
 }finally{await browser.close();}
});

test('R17 screen decisions from the panel and keyboard update list, canvas, progress and browser storage',async()=>{
 const {browser,page}=await open();
 try{
  await page.locator('.screen-list [data-screen-list="a"]').click();
  await page.locator('[data-screen-panel="a"]').waitFor();
  assert.equal(await radio(page,'a','UNDECIDED').getAttribute('aria-checked'),'true');
  await radio(page,'a','KEEP').click();
  assert.equal(await radio(page,'a','KEEP').getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('.screen-list [data-screen-list="a"]').getAttribute('data-decision'),'KEEP');
  assert.match(await page.locator('.progress-button').innerText(),/已確認 1／2/);
  await radio(page,'a','KEEP').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await radio(page,'a','REMOVE').getAttribute('aria-checked'),'true');
  await page.locator('body').click({position:{x:5,y:5}});
  await page.keyboard.press('k');
  assert.equal(await radio(page,'a','KEEP').getAttribute('aria-checked'),'true');
  await page.keyboard.press('n');
  await page.locator('[data-screen-panel="b"]').waitFor();
  await page.keyboard.press('x');
  assert.equal(await radio(page,'b','REMOVE').getAttribute('aria-checked'),'true');
  await page.keyboard.press('Escape');
  await page.locator('.screen-card[data-screen="b"][data-screen-status="REMOVE"]').waitFor();
  assert.equal(await page.locator('.screen-card[data-screen="a"]').getAttribute('data-screen-status'),'KEEP');
  await page.locator('[data-state-filter="REMOVE"]').click();
  assert.deepEqual(await page.locator('.screen-list [data-screen-list]').evaluateAll(rows=>rows.map(r=>r.dataset.screenList)),['b']);
  assert.equal(await page.locator('.screen-card').count(),1);
  await page.reload();await page.locator('#app[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.screen-list [data-screen-list="a"]').getAttribute('data-decision'),'KEEP');
  assert.equal(await page.locator('.screen-list [data-screen-list="b"]').getAttribute('data-decision'),'REMOVE');
 }finally{await browser.close();}
});

test('R17 buttons are collapsed by default, follow the screen, and keep-to-removed conflicts are shown',async()=>{
 const {browser,page}=await open();
 try{
  await page.locator('.screen-list [data-screen-list="a"]').click();
  const section=page.locator('[data-screen-panel="a"] .panel-buttons');
  assert.equal(await section.evaluate(details=>details.open),false);
  assert.match(await section.locator('summary').innerText(),/按鈕 2 個/);
  await section.locator('summary').click();
  assert.match(await section.locator('[data-component-row="shared"]').innerText(),/前往「乙」/);
  await radio(page,'a','KEEP','shared').click();
  assert.equal(await radio(page,'a','KEEP','shared').getAttribute('aria-checked'),'true');
  assert.equal(await section.evaluate(details=>details.open),true);
  await radio(page,'a','REMOVE').click();
  assert.equal(await section.locator('[data-component-row="save"] .inherited-tag').innerText(),'隨畫面移除');
  assert.equal(await section.locator('[data-component-row="shared"] .inherited-tag').count(),0);
  await page.locator('.screen-list [data-screen-list="b"]').click();
  await radio(page,'b','REMOVE').click();
  assert.match(await page.locator('[data-screen-panel="b"] .notice.conflict').innerText(),/保留的「共用按鈕[^」]*」會前往已標記移除的「乙」/);
  await page.locator('.progress-button').click();
  assert.equal(await page.locator('.progress-conflicts').getAttribute('data-conflict-count'),'1');
  assert.match(await page.locator('[data-screen-panel="b"] [data-section="inbound"]').innerText(),/甲/);
 }finally{await browser.close();}
});

test('R17 API page shows three statuses that follow decisions and callers open the screen at the button',async()=>{
 const {browser,page}=await open();
 try{
  await page.locator('.page-tab[data-page="api"]').click();
  const status=id=>page.locator(`.api-row[data-api-row="${id}"]`).getAttribute('data-api-status');
  assert.equal(await status('ep'),'IN_USE');assert.equal(await status('unused'),'UNREFERENCED');
  assert.equal(await page.locator('.sidebar').isVisible(),false);
  assert.deepEqual(await page.locator('[data-api-filter]').allInnerTexts(),['全部 2','使用中 1','未被使用 1','可移除 0']);
  await page.locator('.api-row[data-api-row="ep"] .api-summary').click();
  await page.locator('.api-caller[data-caller-component="save"]').click();
  await page.locator('[data-screen-panel="a"]').waitFor();
  assert.equal(await page.locator('[data-screen-panel="a"] .panel-buttons').evaluate(details=>details.open),true);
  assert.equal(await page.locator('[data-component-row="save"]').evaluate(row=>row.classList.contains('is-highlighted')),true);
  await radio(page,'a','REMOVE').click();
  await page.locator('[data-section="apis"] [data-api="ep"]').click();
  assert.equal(await status('ep'),'REMOVABLE');
  await page.locator('[data-api-filter="REMOVABLE"]').click();
  assert.equal(await page.locator('.api-row').count(),1);
 }finally{await browser.close();}
});

test('R17 downloaded md is format v1 from the shared generator and retired stored fields are ignored without losing decisions',async()=>{
 const data=mdFixture(),{browser,page}=await open(data);
 try{
  const key=`screentrace:review:v1:${encodeURIComponent(data.graph.application.name)}:${data.fingerprint}`;
  await page.evaluate(([key,value])=>localStorage.setItem(key,value),[key,JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application:data.graph.application.name,fingerprint:data.fingerprint,screenDecisions:{a:'KEEP'},componentDecisions:{a:{shared:'KEEP'}},decisionNotes:{screens:{a:{reason:'IN_USE',note:'舊備註'}},components:{}}})]);
  await page.reload();await page.locator('#app[data-ready="true"]').waitFor();
  assert.match(await page.locator('.sidebar-notices').innerText(),/已不再使用的欄位/);
  assert.equal(await page.locator('.screen-list [data-screen-list="a"]').getAttribute('data-decision'),'KEEP');
  const pending=page.waitForEvent('download');await page.locator('[data-md-export]').click();
  const file=await pending,md=await readFile(await file.path(),'utf8');
  assert.equal(file.suggestedFilename(),'screentrace-review.md');
  assert.match(md,/"format_version": ?1/);
  assert.ok(!md.includes('舊備註'));
  const expected=await generateMarkdown({...data,componentLibrary:undefined},{format:'screentrace-review',version:1,schemaVersion:'2.2',application:data.graph.application.name,fingerprint:data.fingerprint,screenDecisions:{a:'KEEP'},componentDecisions:{a:{shared:'KEEP'}}});
  const normalize=text=>text.replace(/^generated_at: .*$/m,'generated_at: "TIME"');
  assert.equal(normalize(md),normalize(expected));
  await page.locator('[data-state-filter="ALL"]').click();
  await page.getByLabel('開啟 md',{exact:true}).setInputFiles({name:'review.md',mimeType:'text/markdown',buffer:Buffer.from(md)});
  await page.locator('.save-status',{hasText:'已開啟 md'}).waitFor();
 }finally{await browser.close();}
});

test('R17 top bar and panels fit a 1024px window without horizontal overflow',async()=>{
 const {browser,page}=await open(r17Fixture(),{width:1024,height:768});
 try{
  await page.locator('.screen-list [data-screen-list="a"]').click();
  const overflow=await page.evaluate(()=>[document.documentElement,document.querySelector('header'),document.querySelector('.details-panel')].map(el=>el.scrollWidth-el.clientWidth));
  assert.deepEqual(overflow,[0,0,0]);
 }finally{await browser.close();}
});
