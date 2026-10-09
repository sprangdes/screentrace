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
