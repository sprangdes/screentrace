import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {simulationFixture} from '../test/wp26-fixture.mjs';
import {fileFixture,node} from '../test/fixture.mjs';
import {setDecision} from '../test/decision-controls.mjs';
import {canonicalPng} from './png-canonical.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'docs/images/user-guide');
const shots=['overview-flow.png','overview-global-nav.png','feature-regions.png','button-table.png','zoom-viewer.png','simulate-link.png','simulate-submit.png','simulate-dialog.png','coverage.png','element-style.png','confirmation-dashboard.png','impact-preview.png','pre-export-check.png','api-page.png','analysis-info.png','library-override.png'];
const fonts='Arial';

export function guidePayload(){
 const data=simulationFixture();
 data.graph.application.name='示範業務系統';
 data.graph.nodes.push(node('page-entry','ENDPOINT','飼主清單',{category:'MVC_SCREEN',path:'/owners',httpMethod:'GET'}));
 data.graph.nodes.find(item=>item.id==='ep').attributes.category='REST_API';
 data.graph.nodes.push(node('global-link','COMPONENT','常用導覽',{kind:'LINK'}));
 data.graph.relationships.push({id:'global-owner-a',type:'CONTAINS',from:'a',to:'global-link',confidence:'CONFIRMED'},{id:'global-owner-b',type:'CONTAINS',from:'b',to:'global-link',confidence:'CONFIRMED'},{id:'global-route',type:'NAVIGATES_TO',from:'global-link',to:'c',confidence:'CONFIRMED'});
 data.graph.diagnostics=[{code:'SAMPLE_ROUTE_NOTE',message:'示範診斷：有一條動態路由需要人工確認。',source:{file:'web/owners.jsp',line:12}}];
 data.documents.a=`<!doctype html><html><head><meta charset="utf-8"><title>飼主管理</title><style>
  *{box-sizing:border-box}body{margin:0;padding:38px 56px;background:#f1f5f2;color:#203b32;font:16px Arial,sans-serif}.app{max-width:1120px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;padding:20px 26px;background:#fff;border:1px solid #d6e2dc;border-radius:14px}.brand{font-size:25px;font-weight:700}.top nav{display:flex;gap:18px;color:#557268}.content{margin-top:24px;padding:30px;background:#fff;border:1px solid #d6e2dc;border-radius:14px;box-shadow:0 8px 24px #244b3c0d}h1{margin:0 0 8px;font-size:28px}.hint{margin:0 0 24px;color:#647b72}.search{display:flex;align-items:end;gap:12px;padding:22px;background:#f6faf8;border-radius:10px}.field{display:grid;gap:7px;flex:1}input{height:42px;padding:8px 12px;border:1px solid #b8cbc2;border-radius:7px;font:inherit}button,.button{padding:11px 18px;border:0;border-radius:7px;background:#176b53;color:white;font:inherit}.secondary{background:#e5f1eb;color:#17533f}.table{margin-top:24px;width:100%;border-collapse:collapse}.table th,.table td{text-align:left;padding:14px;border-bottom:1px solid #e1e9e5}.table th{color:#5a756a;font-size:13px}.actions{display:flex;gap:8px}.foot{margin-top:20px;color:#63796f;font-size:14px}
 </style></head><body><div class="app"><header class="top"><div class="brand">花園動物醫院</div><nav><span>首頁</span><span>飼主</span><span>寵物</span><span>預約</span></nav></header><main class="content"><h1>查詢飼主</h1><p class="hint">輸入姓名或電話，查看已登記的飼主資料。</p><form id="form" class="search" action="#"><label class="field" for="name">飼主姓名<input id="name" name="name" required placeholder="請輸入姓名"></label><button id="submit" type="submit">查詢</button></form><table class="table"><thead><tr><th>姓名</th><th>電話</th><th>寵物</th><th>操作</th></tr></thead><tbody><tr><td>林小安</td><td>0912-345-678</td><td>小白</td><td class="actions"><a id="go" class="button" href="/owners/42">查看資料</a><a id="amb" class="button secondary" href="/owners/search">其他結果</a></td></tr><tr><td>陳大文</td><td>0922-111-222</td><td>阿福</td><td><button id="open" type="button">快速檢視</button></td></tr></tbody></table><p class="foot">資料僅作離線操作示意，不會送出或連線。</p><button id="api" type="button" class="secondary">查看資料服務</button><button id="unknown" type="button" class="secondary">其他操作</button><section id="dialog" hidden><h2>飼主摘要</h2><p>林小安 · 小白</p></section></main></div></body></html>`;
 data.componentLibrary={manifest:{schemaVersion:'1',library:{name:'示範元件庫',version:'1.0.0-demo'},components:[{id:'demo-button',name:'示範按鈕',category:'示例',description:'自行撰寫的範例資料。',status:'stable',selector:'demo-button',inputs:[],outputs:[{name:'pressed',mapsFromEvent:'click'}],slots:[{name:'label'}],usage:'示例按鈕',matches:[{kind:'BUTTON',priority:10}]}]},sha256:'a'.repeat(64)};
 const thumbnail=`data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e6f0eb"/><rect x="20" y="20" width="280" height="35" rx="8" fill="#ffffff"/><rect x="20" y="70" width="280" height="90" rx="8" fill="#ffffff"/><rect x="35" y="85" width="110" height="12" rx="5" fill="#b9d5c8"/><rect x="35" y="110" width="220" height="8" rx="4" fill="#d8e6df"/></svg>').toString('base64')}`;
 for(const screen of data.preview.screens)screen.thumbnail=thumbnail;
 data.preview.screens.push({graphScreenId:'c',width:1280,height:900,thumbnail});
 return data;
}

async function main(){
 await mkdir(output,{recursive:true});
 const browser=await chromium.launch({args:['--disable-gpu','--disable-lcd-text','--font-render-hinting=none','--force-color-profile=srgb']});
 try{
  const data=guidePayload(),url=await fileFixture(data),html=await readFile(fileURLToPath(url),'utf8');
  const forbidden=[os.homedir(),root,'/Users/','C:\\Users\\','file://'].filter(Boolean);
  for(const value of forbidden)assert.ok(!html.includes(value),`generated report HTML contains private path marker ${value}`);
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,locale:'zh-TW',timezoneId:'Asia/Taipei',colorScheme:'light',reducedMotion:'reduce'});
  await context.addInitScript(()=>{try{localStorage.clear();}catch{}});
  const page=await context.newPage(),requests=[];
  page.on('request',request=>{const requestUrl=request.url();if(requestUrl!==url&&!requestUrl.startsWith('data:')&&!requestUrl.startsWith('blob:'))requests.push(requestUrl);});
  await page.goto(url);
  await page.locator('#app[data-ready="true"]').waitFor();
  const reviewKey=`screentrace:review:v1:${encodeURIComponent(data.graph.application.name)}:${data.fingerprint}`;
  await page.evaluate(({key,application,fingerprint})=>localStorage.setItem(key,JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application,fingerprint,screenDecisions:{a:'KEEP'},componentDecisions:{a:{shared:'KEEP'}}})),{key:reviewKey,application:data.graph.application.name,fingerprint:data.fingerprint});
  await page.reload();await page.locator('#app[data-ready="true"]').waitFor();
  await page.evaluate(async family=>{await document.fonts.ready;if(!document.fonts.check('12px '+family))throw new Error('Required screenshot font unavailable: '+family);},fonts);
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}.topbar button.secondary{border-radius:0!important}.topbar>.segmented button[aria-pressed=true]{box-shadow:none!important}'});
  const screenshot=async name=>{
   await page.mouse.move(1439,899);
   await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();document.body.tabIndex=-1;document.body.focus();});
   for(const frame of page.frames())await frame.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.locator('[data-transition="running"]').count().then(count=>assert.equal(count,0,'screenshot captured during screen transition'));
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
   for(const frame of page.frames())assert.equal(await frame.evaluate(async family=>{await document.fonts.ready;return document.fonts.check('12px '+family);},fonts),true,'required screenshot font unavailable in a frame');
   const file=path.join(output,name);let previous,bytes;for(let attempt=0;attempt<12;attempt++){bytes=canonicalPng(await page.screenshot({animations:'disabled'}));if(previous&&bytes.equals(previous))break;previous=bytes;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}assert.ok(previous&&bytes.equals(previous),`${name} did not reach a stable screenshot`);await writeFile(file,bytes);assert.ok(bytes.length>1000,`${name} is unexpectedly small`);
   for(const value of forbidden)assert.ok(!bytes.includes(Buffer.from(value)),`${name} contains private path marker ${value}`);
  };
  await page.locator('.canvas[data-fitted="true"]').waitFor();await screenshot(shots[0]);
  await page.getByRole('checkbox',{name:'顯示全站導覽'}).check();await page.waitForFunction(()=>document.querySelectorAll('.relation-line.global-navigation').length>0);await screenshot(shots[1]);
  await page.getByRole('button',{name:'功能',exact:true}).click();await page.locator('.feature-region-card').first().waitFor();await screenshot(shots[2]);
  await page.getByRole('button',{name:'按鈕',exact:true}).click();await page.locator('.button-table').waitFor();await screenshot(shots[3]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await screenshot(shots[4]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.frameLocator('iframe').locator('#go').click();await page.locator('main h2').filter({hasText:'乙'}).waitFor();await screenshot(shots[5]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.frameLocator('iframe').locator('#name').fill('林小安');await page.frameLocator('iframe').locator('#submit').click();await page.locator('.simulation-choice').first().waitFor();await page.locator('.prototype-status').getByText('可能的伺服器檢核訊息').waitFor();await screenshot(shots[6]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.frameLocator('iframe').locator('#open').click();await page.frameLocator('iframe').getByRole('dialog').waitFor();await screenshot(shots[7]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.frameLocator('iframe').locator('#unknown').click();await page.locator('.simulation-coverage').waitFor();await screenshot(shots[8]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.frameLocator('iframe').locator('#go').evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,altKey:true})));await page.locator('#detail-tab-button-3').click();await page.locator('[data-detail-tab="3"]').locator('.computed-style-row').first().waitFor();await screenshot(shots[9]);
  await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('[data-review-progress]').click();await screenshot(shots[10]);await page.locator('[data-review-progress]').click();
  await page.locator('.screen-card[data-screen="b"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').click();await page.locator('.decision-impact').waitFor();await screenshot(shots[11]);
  await page.getByRole('button',{name:'匯出 md',exact:true}).click();await page.locator('.pre-export-check').waitFor({state:'visible'});await screenshot(shots[12]);await page.getByRole('button',{name:'回去處理',exact:true}).click();
  await page.getByRole('button',{name:'API',exact:true}).click();await page.locator('[data-endpoint-group="API"]').waitFor();await page.locator('.api-row button').first().click();await page.locator('.api-detail-heading').waitFor();await screenshot(shots[13]);
  await page.getByRole('button',{name:/^分析資訊 /}).click();await page.locator('.information-drawer[open]').waitFor();await screenshot(shots[14]);await page.getByRole('button',{name:'關閉分析資訊',exact:true}).click();
  await page.getByRole('button',{name:'畫面',exact:true}).click();await page.getByRole('button',{name:'地圖',exact:true}).click();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.locator('.prototype-toolbar [role="radio"][data-decision="KEEP"]').click();await page.getByRole('tab',{name:'操作',exact:true}).click();await page.locator('[data-component="shared"]').click();await page.locator('[data-library-details]').waitFor();await page.locator('[data-library-override="shared"]').waitFor();await page.locator('[data-library-override="shared"]').selectOption('demo-button');await page.locator('[data-library-override="shared"]').scrollIntoViewIfNeeded();await screenshot(shots[15]);
  assert.deepEqual(requests,[],'offline guide report must not make network or other local resource requests');
  await context.close();
 }finally{await browser.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
