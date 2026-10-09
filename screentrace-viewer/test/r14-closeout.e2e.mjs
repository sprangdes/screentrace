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
