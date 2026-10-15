import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

/** Fourteen screens in three URL areas, linked inside and across areas. */
function areasFixture(){
 const data=fixture(),routes=['/shop','/shop/cart','/shop/pay','/shop/done','/admin','/admin/users','/admin/roles','/report/day','/report/month','/login','/help','/about','/faq','/terms'];
 const node=(id,type,name,attributes={})=>({id,type,name,attributes,confidence:'CONFIRMED',source:{file:'web/App.tsx',line:1}});
 data.graph.nodes=routes.map((route,i)=>node(`s${i}`,'SCREEN',`畫面${i}`,{route}));
 data.graph.relationships=[];data.graph.behaviors=[];
 const link=(from,to,i)=>{const c=`c${i}`;data.graph.nodes.push(node(c,'COMPONENT',`連結${i}`,{kind:'LINK'}));data.graph.relationships.push({id:'own'+i,type:'CONTAINS',from,to:c,confidence:'CONFIRMED'},{id:'nav'+i,type:'NAVIGATES_TO',from:c,to,confidence:'CONFIRMED'});};
 [['s0','s1'],['s1','s2'],['s2','s3'],['s4','s5'],['s5','s6'],['s7','s8'],['s0','s4'],['s3','s7'],['s9','s0'],['s10','s5']].forEach(([from,to],i)=>link(from,to,i));
 data.preview.screens=routes.map((_,i)=>({graphScreenId:`s${i}`,width:1280,height:900}));
 data.documents=Object.fromEntries(routes.map((_,i)=>[`s${i}`,`<html><body>畫面${i}</body></html>`]));
 return data;
}

test('single click shows a screen’s relations and frames them, double click opens it, an area click zooms into the area',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(areasFixture()));await page.locator('#app[data-ready="true"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');
  const transform=()=>page.locator('.world').evaluate(w=>w.style.transform);
  assert.equal(await page.locator('.screen-group').count(),4,'shop, admin, report and 其他');
  assert.equal(await page.locator('.group-link.is-shown').count(),0,'links between areas are not drawn until an area is pointed at');

  const overview=await transform();
  await page.locator('.screen-card[data-screen="s0"]').click();
  assert.equal(await page.locator('.canvas').getAttribute('data-mode'),'overview','one click does not open the screen');
  assert.ok(await page.locator('.screen-card[data-screen="s0"]').evaluate(c=>c.classList.contains('is-pinned')));
  assert.notEqual(await transform(),overview,'the map moves to the screen and its related screens');
  await page.mouse.move(5,5);
  const drawn=await page.locator('.relation-raised .relation-line').evaluateAll(lines=>lines.map(l=>`${l.dataset.from}>${l.dataset.to}`).sort());
  assert.deepEqual(drawn,['s0>s1','s0>s4','s9>s0'],'its lines stay drawn, including those to other areas');

  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.relation-raised .relation-line').count(),0,'Esc lets go of the screen');

  await page.locator('.screen-card[data-screen="s4"]').dblclick();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='focus');
  assert.equal(await page.locator('.canvas').getAttribute('data-focused'),'s4','a double click opens the screen');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');

  await page.locator('.canvas-controls button').last().click();
  const fitted=await transform();
  const frame=page.locator('.screen-group[data-group="/admin"]');
  const box=await frame.boundingBox();await page.mouse.click(box.x+box.width-6,box.y+box.height-6);
  assert.notEqual(await transform(),fitted,'clicking an area zooms into it');
  const after=await frame.boundingBox(),viewport=await page.locator('.canvas').boundingBox();
  assert.ok(after.width>box.width&&after.x>=viewport.x-1&&after.x+after.width<=viewport.x+viewport.width+1,'the whole area fills the canvas');
 }finally{await browser.close();}
});

test('going back to the canvas closes the preview even when an area lies under the back button',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(await fileFixture(areasFixture()));await page.locator('#app[data-ready="true"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');
  for(const id of ['s0','s4','s9']){
   await page.locator(`.screen-card[data-screen="${id}"]`).dblclick();
   await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();
   await page.locator('.prototype-back').click();
   await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
   await page.waitForFunction(()=>!document.querySelector('.focus-layer:not([hidden]) .prototype-viewer'),undefined,{timeout:3000});
  }
 }finally{await browser.close();}
});
