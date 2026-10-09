import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('R14 closeout 1 shares §9.2 API source basis between dashboard and API page',async()=>{
 const data=fixture();data.graph.nodes.find(item=>item.id==='ep').attributes.category='REST_API';
 const component=data.graph.nodes.find(item=>item.id==='shared');
 component.attributes.target='/cart/';component.attributes.targetStatus='CONFIRMED';
 component.evidence=[{parser:'UrlResolution',resolution:'CONFIRMED',source:{file:'web/first.jsp',line:4}}];
 data.graph.nodes.push(node('cart','ENDPOINT','ANY /cart/',{path:'/cart/',method:'ANY',category:'REDIRECT'}),node('inferred-source','COMPONENT','推定來源',{kind:'BUTTON'}));
 data.graph.relationships.push({id:'contains-inferred-source',type:'CONTAINS',from:'a',to:'inferred-source'});
 data.graph.relationships.push(
  {id:'static-cart-source',type:'CALLS',from:'shared',to:'cart',confidence:'INFERRED',evidence:[{parser:'UrlResolution',resolution:'CONFIRMED',source:{file:'web/first.jsp',line:4}}]},
  {id:'template-api-source',type:'CALLS',from:'inferred-source',to:'ep',confidence:'INFERRED',evidence:[{parser:'RouteTemplateInference',resolution:'INFERRED',source:{file:'web/first.jsp',line:7}}]}
 );
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  const dashboardCount=Number((await page.locator('[data-inferred-api-link]').innerText()).match(/另有 (\d+) 個 API/)[1]);
  await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  const inferred=page.locator('[data-api-filter="INFERRED_USAGE"]');assert.equal(Number((await inferred.innerText()).match(/(\d+)/)[1]),dashboardCount);
  await inferred.click();assert.equal(await page.locator('[data-api-row="cart"]').count(),0,'STATIC_URL API must not be classified as inferred usage');
 }finally{await browser.close();}
});

test('R14 closeout 2 API status filters are exclusive and header totals are concise',async()=>{
 const data=fixture();data.graph.nodes=data.graph.nodes.filter(item=>item.type!=='ENDPOINT');
 data.graph.relationships=data.graph.relationships.filter(edge=>!['ep','unused'].includes(edge.to));
 for(let i=0;i<7;i++)data.graph.nodes.push(node(`api-${i}`,'ENDPOINT',`API ${i}`,{path:`/api/${i}`,method:'GET',category:'REST_API'}));
 for(let i=0;i<12;i++)data.graph.nodes.push(node(`route-${i}`,'ENDPOINT',`網址 ${i}`,{path:`/page/${i}`,method:'GET',category:'MVC_SCREEN'}));
 for(let i=0;i<6;i++){const id=`caller-${i}`;data.graph.nodes.push(node(id,'COMPONENT',`呼叫 ${i}`,{kind:'LINK'}));data.graph.relationships.push({id:`owner-${i}`,type:'CONTAINS',from:'a',to:id});data.graph.relationships.push({id:`api-call-${i}`,type:'CALLS',from:id,to:`api-${i}`,confidence:i===0?'CONFIRMED':'INFERRED',evidence:[{parser:i===0?'UrlResolution':'RouteTemplateInference',resolution:i===0?'CONFIRMED':'INFERRED',source:{file:'web/page.jsp',line:i+1}}]});}
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  assert.equal((await page.locator('.api-total-summary').innerText()).trim(),'API 7 · 畫面網址 12');
  const filters=page.locator('.api-state-filters');for(const [key,count]of [['IN_USE',1],['INFERRED_USAGE',5],['UNREFERENCED',1],['REMOVABLE',0],['ALL',7]]){const text=await filters.locator(`[data-api-filter="${key}"]`).innerText();assert.equal(Number(text.match(/(\d+)/)[1]),count,key);}
  assert.equal(await page.locator('[data-endpoint-group="UNCLASSIFIED"]').count(),0);
 }finally{await browser.close();}
});

test('R14 closeout 3 API list humanizes ANY and REDIRECT while preserving source values',async()=>{
 const data=fixture();data.graph.nodes.find(item=>item.id==='ep').attributes={path:'/api/any',method:'ANY',category:'REST_API'};data.graph.nodes.find(item=>item.id==='unused').attributes={path:'/api/redirect',method:'REDIRECT',category:'REST_API'};
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  const any=page.locator('[data-api-row="ep"] [data-method]');assert.equal(await any.innerText(),'任何方法');assert.equal(await any.getAttribute('title'),'ANY');
  const redirect=page.locator('[data-api-row="unused"] [data-method]');assert.equal(await redirect.innerText(),'轉址');
 }finally{await browser.close();}
});

test('R14 closeout 4 report and help use 未決定 throughout visible UI',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(fixture()));await page.locator('#app[data-ready=true]').waitFor();
  for(let i=0;i<6;i++){await page.locator('.primary-tabs button').nth(i).click();await page.locator('.primary-tabs button').nth(i).waitFor();assert.doesNotMatch(await page.locator('#app').innerText(),/未確認/,`report tab ${i}`);}
  await page.locator('.topbar-more > summary').click();await page.locator('.review-help > summary').click();assert.doesNotMatch(await page.locator('.review-help').innerText(),/未確認/);assert.match(await page.locator('.review-help').innerText(),/未決定/);
 }finally{await browser.close();}
});

test('R14 closeout 5 functional map keeps the fixed status and entry legend visible',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(fixture()));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(3).click();await page.locator('.canvas[data-fitted=true]').waitFor();
  const legend=page.locator('.map-legend');assert.ok(await legend.isVisible());assert.deepEqual((await legend.locator('[data-legend-item]').allTextContents()).map(value=>value.trim()),['保留','移除','入口是推定的','找不到入口','系統自動導向']);const box=await legend.boundingBox(),canvasBox=await page.locator('.canvas').boundingBox();assert.ok(box&&canvasBox&&box.x+box.width>=canvasBox.x+canvasBox.width-20&&box.y<=canvasBox.y+20,JSON.stringify({box,canvasBox}));
 }finally{await browser.close();}
});

test('R14 closeout 6 delivery impacts are lists with one post-table warning and unique item names',async()=>{
 const data=fixture();data.graph.nodes.find(item=>item.id==='ep').attributes.category='REST_API';data.graph.nodes.find(item=>item.id==='a').source=undefined;
 data.graph.nodes.push(node('only-a','COMPONENT','獨有連結',{kind:'LINK'}));data.graph.relationships.push({id:'only-a-owner',type:'CONTAINS',from:'a',to:'only-a'},{id:'only-a-call',type:'CALLS',from:'only-a',to:'ep',confidence:'CONFIRMED',evidence:[{parser:'UrlResolution',resolution:'CONFIRMED'}]},{id:'screen-load-api',type:'CALLS',from:'a',to:'ep',confidence:'CONFIRMED',evidence:[{parser:'Fixture',resolution:'CONFIRMED'}]});
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();await page.locator('[data-screen-list="a"]').click();await page.locator('.screen-review-screen-decision [data-screen-decision="REMOVE"]').click();assert.equal(await page.locator('[data-screen-review="a"]').getAttribute('data-decision'),'REMOVE');await page.locator('.primary-tabs button').nth(5).click();await page.locator('[data-page="delivery"]').waitFor();
  const row=page.locator('.delivery-table tr').nth(1);assert.equal((await row.locator('td').nth(0).innerText()).trim(),'甲');const impact=row.locator('td').nth(3);assert.equal(await impact.locator('ul > li').count(),3);assert.match(await impact.innerText(),/失去連結：/);assert.match(await impact.innerText(),/因此可移除的 API：.*api\/owners/);assert.match(await impact.innerText(),/隨畫面移除的按鈕：2 個/);
  const warning=page.locator('.delivery-impact-warning');assert.equal(await warning.count(),1);assert.ok(await page.locator('.delivery-table').evaluate((table,el)=>table.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING,await warning.elementHandle()));
 }finally{await browser.close();}
});

test('R14 closeout 7 map sidebar has KEEP and REMOVE text controls that toggle back to undecided',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(fixture()));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(3).click();const row=page.locator('.sidebar-screen-row').filter({has:page.locator('[data-screen-list="a"]')}),group=row.locator('[role="radiogroup"]');await row.hover();
  assert.deepEqual((await group.locator('button').allTextContents()).map(value=>value.trim()),['保留','移除']);await group.getByRole('radio',{name:'保留'}).click();assert.equal(await row.locator('[role="radio"][data-decision="KEEP"]').getAttribute('aria-checked'),'true');await row.locator('[role="radio"][data-decision="KEEP"]').click();assert.equal(await row.locator('[role="radio"][data-decision="KEEP"]').getAttribute('aria-checked'),'false');assert.equal(await row.locator('[role="radio"][data-decision="REMOVE"]').getAttribute('aria-checked'),'false');
 }finally{await browser.close();}
});
