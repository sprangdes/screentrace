import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,node,fixture} from './fixture.mjs';

function tenScreenFixture(){
 const data=fixture(),screens=Array.from({length:10},(_,i)=>node(`screen-${String(i).padStart(2,'0')}`,'SCREEN',`畫面 ${i+1}`,{route:i===0?'/owners':`/owners/${i}`})),globalLink=node('global-nav','COMPONENT','首頁',{kind:'LINK',tag:'a'});
 data.graph.nodes=[...screens,globalLink];data.graph.relationships=[...screens.slice(1).map((screen,i)=>({id:`flow-${i}`,type:'NAVIGATES_TO',from:screens[i].id,to:screen.id,triggers:[]})),...screens.map((screen,i)=>({id:`global-owner-${i}`,type:'CONTAINS',from:screen.id,to:globalLink.id})),{id:'global-destination',type:'NAVIGATES_TO',from:globalLink.id,to:screens[0].id}];
 data.graph.behaviors=[];data.graph.apiContracts=[];data.graph.validationRules=[];data.preview.screens=screens.map(screen=>({graphScreenId:screen.id,width:1280,height:900}));data.preview.elements=[];data.documents=Object.fromEntries(screens.map(screen=>[screen.id,'<html><body><h1>合成畫面</h1><a id="global-nav">首頁</a></body></html>']));return data;
}

test('WP41 top bar has four action groups and overflow menu exposes every moved action',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture());
  const actions=page.locator('.topbar-actions');assert.equal(await actions.locator(':scope > *').count(),4);
  assert.equal(await actions.locator('.review-workflow-control [data-review-progress]').count(),1);
  assert.equal(await actions.locator('.review-workflow-control .next-undecided').count(),1);
  const menu=page.locator('.topbar-more'),menuSummary=page.locator('.topbar-more>summary');await menuSummary.click();
  for(const name of ['匯入 md','分析資訊 0','重新開啟引導'])assert.equal(await menu.getByRole('menuitem',{name:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).isVisible(),true,name);
  assert.equal(await menu.locator('.review-help>summary').isVisible(),true,'help remains an available menu item');
  await menu.getByRole('menuitem',{name:/分析資訊/}).click();assert.equal(await page.locator('.information-drawer').evaluate(el=>el.open),true);
  await page.getByRole('button',{name:'關閉分析資訊'}).click();
  await menuSummary.click();await menuSummary.focus();await page.keyboard.press('Enter');for(const expected of ['匯入 md','分析資訊 0','查看選取物件資訊','收合右側欄','標記說明','重新開啟引導']){await page.keyboard.press('ArrowDown');const active=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim()||'');assert.match(active,new RegExp(expected));}
  await page.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>el.open),false);
  await page.keyboard.press('Escape');
 }finally{await browser.close();}
});

test('WP41 workflow segment opens the dashboard and advances independently',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture());
  const progress=page.locator('[data-review-progress]'),dashboard=page.locator('.review-progress-panel');await progress.click();assert.equal(await dashboard.isVisible(),true);
  await progress.click();await page.locator('.review-workflow-control .next-undecided').click();assert.equal(await page.locator('.focus-breadcrumb h2').innerText(),'甲');
 }finally{await browser.close();}
});

test('WP41 resizable details panel supports pointer, keyboard, persistence and storage failure',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture());
  const handle=page.getByRole('separator',{name:'調整資訊欄寬度'}),aside=page.locator('.shell>aside'),initial=await aside.boundingBox();assert.ok(initial);
  await handle.focus();await page.keyboard.press('ArrowLeft');const keyboard=await aside.boundingBox();assert.ok(keyboard&&keyboard.width<initial.width);
  await handle.focus();await page.keyboard.press('End');assert.equal(Number(await handle.getAttribute('aria-valuenow')),720);
  const box=await handle.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+60,box.y+box.height/2);await page.mouse.up();const moved=await aside.boundingBox();assert.ok(moved&&moved.width>600&&moved.width<720);
  await page.reload();assert.equal((await aside.boundingBox()).width,moved.width);
  const blocked=await browser.newPage({viewport:{width:1440,height:900}});await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('storage disabled');}}));await blocked.goto(await fileFixture());assert.equal(Number(await blocked.getByRole('separator',{name:'調整資訊欄寬度'}).getAttribute('aria-valuenow')),320);
  await blocked.close();
  await page.locator('.panel-collapse').click();assert.equal(await page.locator('.shell').getAttribute('data-right-panel-hidden'),'true');await page.locator('.topbar-more>summary').click();await page.locator('.topbar-menu [role="menuitem"]').filter({hasText:'展開右側欄'}).click();assert.equal(await page.locator('.shell').getAttribute('data-right-panel-hidden'),'false');
 }finally{await browser.close();}
});

test('WP41 overview fit uses card and relation bounds, and refits after global navigation and resize',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture(tenScreenFixture()));
  await page.locator('.canvas[data-fitted="true"]').waitFor();
  const coverage=async()=>page.evaluate(()=>{const canvas=document.querySelector('.canvas'),world=document.querySelector('.world'),cards=[...world.querySelectorAll('.screen-card')],zoom=Number(world.style.getPropertyValue('--canvas-zoom')||1);const rs=cards.map(e=>e.getBoundingClientRect()),left=Math.min(...rs.map(r=>r.left)),right=Math.max(...rs.map(r=>r.right)),top=Math.min(...rs.map(r=>r.top)),bottom=Math.max(...rs.map(r=>r.bottom)),w=Math.max(1,canvas.clientWidth-48),h=Math.max(1,canvas.clientHeight-80);return {width:(right-left)/w,height:(bottom-top)/h,zoom};});
  let before=await coverage();assert.ok(Math.max(before.width,before.height)>=.85,JSON.stringify(before));
  await page.getByRole('checkbox',{name:'顯示全站導覽'}).check();await page.waitForFunction(()=>document.querySelectorAll('.relation-line.global-navigation').length>0);await page.waitForFunction(()=>Number(document.querySelector('.world')?.dataset.fitRevision)>=2);
  await page.setViewportSize({width:1180,height:900});await page.waitForFunction(()=>Number(document.querySelector('.world')?.dataset.fitRevision)>=3);const after=await coverage();assert.ok(Math.max(after.width,after.height)>=.85,JSON.stringify(after));
 }finally{await browser.close();}
});

test('WP41 first-run guide is in normal layout and never overlaps interactive controls',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await page.goto(await fileFixture());
  const guide=page.locator('[data-first-run-guide]'),guideBox=await guide.boundingBox();assert.ok(guideBox);
  const overlaps=await page.locator('button,input,select,summary,[role="button"]').evaluateAll((elements,box)=>elements.filter(e=>!e.closest('[data-first-run-guide]')&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none').some(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top;}),guideBox);
  assert.equal(overlaps,false,'first-run guide overlaps an interactive control');
  assert.equal(await page.locator('.shell>nav> .review-statistics').count(),0);assert.equal(await page.locator('.shell>nav> .conflicts').count(),0);assert.ok(await page.locator('.review-progress-panel .review-statistics').count());
 }finally{await browser.close();}
});

test('WP41 guide dismissal persists in the tab when localStorage is unavailable and can be reopened',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('storage disabled');}}));await page.goto(await fileFixture());
  const guide=page.locator('[data-first-run-guide]');assert.equal(await guide.isVisible(),true);await guide.getByRole('button',{name:'略過'}).click();assert.equal(await guide.isVisible(),false);await page.reload();assert.equal(await guide.isVisible(),false,'tab storage prevents automatic reappearance');
  await page.locator('.topbar-more>summary').click();await page.locator('.topbar-menu [role="menuitem"]').filter({hasText:'重新開啟引導'}).click();assert.equal(await guide.isVisible(),true,'the menu can explicitly reopen the guide');
 }finally{await browser.close();}
});

test('WP41 right-side controls fit without overflow at 1024px',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'});await page.goto(await fileFixture());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.evaluate(()=>{const top=document.querySelector('.topbar'),actions=document.querySelector('.topbar-actions');return actions.getBoundingClientRect().right<=top.getBoundingClientRect().right+1;}));
  assert.ok(await page.locator('.global-search-open .search-label').isHidden());
  assert.match(await page.locator('[data-review-progress]').innerText(),/\d+／\d+/);assert.doesNotMatch(await page.locator('[data-review-progress]').innerText(),/已確認/);
 }finally{await browser.close();}
});
