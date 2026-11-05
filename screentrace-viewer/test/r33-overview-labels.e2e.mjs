import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fileFixture,fixture} from './fixture.mjs';

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

const open=async(browser,viewport={width:1440,height:900})=>{
 const page=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(await fileFixture(areasFixture()));await page.locator('#app[data-ready="true"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');
 return {page,errors};
};
const zoomIn=async page=>{for(let i=0;i<12&&await page.locator('.canvas').getAttribute('data-semantic-zoom')!=='detail';i++){await page.locator('.canvas-controls button').first().click();await page.waitForTimeout(60);}assert.equal(await page.locator('.canvas').getAttribute('data-semantic-zoom'),'detail');};
const fontPx=locator=>locator.evaluate(n=>Math.round(parseFloat(getComputedStyle(n).fontSize)*n.getBoundingClientRect().height/n.offsetHeight*10)/10);

test('R33 zoomed out, each area keeps a readable title in the band atop its frame and names its first screens',async()=>{
 const browser=await chromium.launch();try{
  const {page,errors}=await open(browser,{width:1440,height:900});
  assert.equal(await page.locator('.canvas').getAttribute('data-semantic-zoom'),'compact');
  const shop=page.locator('.screen-group[data-group="/shop"]');
  const title=shop.locator('.screen-group-title'),names=shop.locator('.screen-group-names');
  assert.match(await title.innerText(),/^\/shop · 4 個畫面$/);
  assert.equal(await names.innerText(),'畫面0、畫面1、畫面2…','the first three screens in reading order');
  assert.ok(await fontPx(title)>=13.5,'the title stays about 14px on screen');
  // The label sits in the band at the top of its frame: inside the frame, above every card, so no line can cross it.
  for(const group of await page.locator('.screen-group').all()){
   const frame=await group.boundingBox(),label=await group.locator('.screen-group-label').boundingBox();
   const cards=await page.evaluate(key=>{const f=document.querySelector(`.screen-group[data-group="${CSS.escape(key)}"]`).getBoundingClientRect();return Math.min(...[...document.querySelectorAll('.screen-card')].map(c=>c.getBoundingClientRect()).filter(r=>r.left>=f.left&&r.right<=f.right&&r.top>=f.top&&r.bottom<=f.bottom).map(r=>r.top));},await group.getAttribute('data-group'));
   assert.ok(label.x>=frame.x&&label.x+label.width<=frame.x+frame.width+1&&label.y>=frame.y,'the label stays inside its frame');
   assert.ok(label.y+label.height<=cards,'the label is above the first row of cards');
  }
  assert.equal(await shop.locator('.screen-group-label').evaluate(n=>getComputedStyle(n).pointerEvents),'none','the label lets clicks through');
  // Zoomed in, the title is the area's own size again and the names give way to the cards' captions.
  await zoomIn(page);
  assert.equal(await names.isVisible(),false);assert.ok(await fontPx(title)>14);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('R33 zoomed out, pointing at a card shows its name and route; zoomed in, the card shows them itself',async()=>{
 const browser=await chromium.launch();try{
  const {page,errors}=await open(browser,{width:1440,height:900});
  const tip=page.locator('.card-tip'),card=page.locator('.screen-card[data-screen="s5"]');
  assert.equal(await tip.isVisible(),false);
  await card.hover();
  assert.equal(await tip.isVisible(),true);
  assert.equal(await tip.locator('strong').innerText(),'畫面5');assert.equal(await tip.locator('span').innerText(),'/admin/users');
  assert.equal(await tip.getAttribute('aria-hidden'),'true','the card already names itself to assistive technology');
  const c=await card.boundingBox(),t=await tip.boundingBox();
  assert.ok(Math.abs((t.x+t.width/2)-(c.x+c.width/2))<=1,'centered on the card');
  assert.ok(t.y>=c.y+c.height||t.y+t.height<=c.y,'beside the card, not over it');
  assert.equal(await card.getAttribute('title'),null,'no slow native tooltip on top of it');
  await page.mouse.move(2,300);assert.equal(await tip.isVisible(),false);
  await card.focus();assert.equal(await tip.isVisible(),true,'keyboard focus shows it too');
  await page.locator('.canvas-controls button').first().click();
  assert.equal(await tip.isVisible(),false,'moving the map hides it');
  await zoomIn(page);await card.scrollIntoViewIfNeeded().catch(()=>{});
  const shown=await card.boundingBox(),area=await page.locator('.canvas').boundingBox();
  if(shown.x<area.x||shown.y<area.y||shown.x+shown.width>area.x+area.width||shown.y+shown.height>area.y+area.height)await card.evaluate(c=>c.dispatchEvent(new MouseEvent('mouseenter')));else await card.hover();assert.equal(await tip.isVisible(),false,'not shown once the card is large enough to read');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
