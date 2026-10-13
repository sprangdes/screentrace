import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

async function open(){
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.setDefaultTimeout(5000);
 await page.goto(await fileFixture(simulationFixture()));await page.locator('#app[data-ready="true"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');
 return {browser,page};
}
const centre=async locator=>{const box=await locator.boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};};
const lit=page=>page.locator('.relation-line.is-out,.relation-line.is-in').count();

test('R18 pointing at an overview line highlights it and its two ends, and leaving always clears it',async()=>{
 const {browser,page}=await open();
 try{
  const line=page.locator('.relation-line').first(),[from,to]=await Promise.all([line.getAttribute('data-from'),line.getAttribute('data-to')]);
  const point=await line.evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()/2),m=path.getScreenCTM();return {x:p.x*m.a+m.e,y:p.y*m.d+m.f};});
  for(let round=0;round<3;round++){
   await page.mouse.move(point.x,point.y);
   await page.waitForFunction(()=>document.querySelectorAll('.relation-raised .relation-line.is-out').length===1);
   assert.equal(await page.locator(`.screen-card[data-screen="${from}"]`).evaluate(card=>card.classList.contains('is-highlighted')),true);
   assert.equal(await page.locator(`.screen-card[data-screen="${to}"]`).evaluate(card=>card.classList.contains('is-highlighted')),true);
   await page.mouse.move(point.x+3,point.y+3);await page.mouse.move(5,890);
   assert.equal(await lit(page),0,'no highlight stays behind');
   assert.equal(await page.locator('.relation-raised *').count(),0);
  }
  assert.equal(await page.locator('.canvas .world .relation-tooltip').count(),0,'the overview shows no line preview');
 }finally{await browser.close();}
});

test('R18 pointing at a card draws its outgoing lines blue and its incoming lines amber with matching arrowheads',async()=>{
 const {browser,page}=await open();
 try{
  const id=await page.locator('.relation-line').first().getAttribute('data-to');
  await page.mouse.move(...Object.values(await centre(page.locator(`.screen-card[data-screen="${id}"]`))));
  const states=await page.locator('.relations > .relation .relation-line').evaluateAll((lines,id)=>lines.map(l=>({from:l.dataset.from,to:l.dataset.to,out:l.classList.contains('is-out'),into:l.classList.contains('is-in'),marker:getComputedStyle(l).markerEnd,stroke:getComputedStyle(l).stroke})),id);
  for(const s of states){
   if(s.from===id){assert.ok(s.out);assert.match(s.marker,/flow-arrow-out/);}
   else if(s.to===id){assert.ok(s.into);assert.match(s.marker,/flow-arrow-in/);}
   else assert.match(s.marker,/flow-arrow-muted/);
  }
  assert.ok(states.some(s=>s.into),'the fixture has an incoming line');
  const colour=await page.locator('#flow-arrow-in path').evaluate(p=>getComputedStyle(p).fill),line=states.find(s=>s.into).stroke;
  assert.equal(colour,line,'the arrowhead takes its line colour');
  await page.mouse.move(5,890);assert.equal(await lit(page),0);
 }finally{await browser.close();}
});

test('R18 a zoomed screen shows lines leaving (blue) and arriving (amber) in their overview directions; an arriving line leads to its source',async()=>{
 const {browser,page}=await open();
 try{
  const flows=await page.locator('.relations > .relation .relation-line').evaluateAll(lines=>lines.map(l=>({from:l.dataset.from,to:l.dataset.to})));
  const id=flows.find(f=>f.from!==f.to&&flows.some(g=>g.to===f.to&&g.from!==f.to))?.to;assert.ok(id,'the fixture has a screen with an incoming line');
  const sources=[...new Set(flows.filter(f=>f.to===id&&f.from!==id).map(f=>f.from))].sort();
  await page.locator(`.screen-card[data-screen="${id}"]`).click();await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.focus-lines').classList.contains('is-entering')&&document.querySelectorAll('.focus-line-hit').length>0);
  const arriving=await page.locator('.focus-line-hit[data-kind="incoming"]').evaluateAll(hits=>hits.map(h=>{const a=h.getPointAtLength(0),b=h.getPointAtLength(h.getTotalLength()),box=document.querySelector('.focus-layer:not(.is-leaving)').getBoundingClientRect(),c=document.querySelector('.canvas').getBoundingClientRect(),cx=box.left-c.left+box.width/2,cy=box.top-c.top+box.height/2;return {from:h.dataset.from,inward:Math.hypot(b.x-cx,b.y-cy)<Math.hypot(a.x-cx,a.y-cy)};}));
  assert.deepEqual([...new Set(arriving.map(a=>a.from))].sort(),sources);
  assert.ok(arriving.every(a=>a.inward),'arriving lines point into the preview box');
  const classes=await page.locator('.focus-line').evaluateAll(lines=>lines.map(l=>({kind:l.dataset.kind,cls:l.getAttribute('class'),marker:getComputedStyle(l).markerEnd})));
  for(const c of classes){if(c.kind==='incoming'){assert.match(c.cls,/is-in/);assert.match(c.marker,/focus-arrow-in/);}else if(c.kind==='known'||c.kind==='loop'){assert.match(c.cls,/is-out/);assert.match(c.marker,/focus-arrow-out/);}}
  const hit=page.locator(`.focus-line-hit[data-kind="incoming"][data-from="${sources[0]}"]`).first();
  await hit.focus();
  assert.match(await page.locator(`.focus-tooltip[data-kind="incoming"]:not([hidden])`).innerText(),/來自/);
  await hit.press('Enter');
  await page.waitForFunction(source=>document.querySelector('.canvas').dataset.focused===source,sources[0]);
 }finally{await browser.close();}
});
