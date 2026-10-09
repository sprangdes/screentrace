import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('WP46 home regions show URL prefixes, friendly redirect evidence and only inferred API sources',async()=>{
 const data=fixture();
 data.graph.nodes.push(
  node('root-screen','SCREEN','首頁',{route:'/'}),
  node('redirect-screen','SCREEN','登入頁',{route:'/login',autoRedirect:'LOGIN_PAGE'}),
  node('static-component','COMPONENT','View cart',{kind:'LINK',target:'/cart',targetStatus:'CONFIRMED'}),
  node('inferred-component','COMPONENT','刪除項目',{kind:'BUTTON',target:'/api/items/{itemId}',targetStatus:'INFERRED'}),
  node('redirect-api','ENDPOINT','Cart redirect',{path:'/cart/',httpMethod:'GET',category:'REDIRECT'}),
  node('inferred-api','ENDPOINT','Delete item',{path:'/api/items/{itemId}',httpMethod:'DELETE',category:'REST_API'})
 );
 data.graph.nodes.find(item=>item.id==='a').attributes.route='/owners/{ownerId}/edit';
 data.graph.nodes.find(item=>item.id==='redirect-screen').evidence=[{source:{file:'config/security.xml',line:49},parser:'Fixture',resolution:'CONFIRMED',detail:'設定鍵=LOGIN_PAGE；路徑=/login；受保護路徑=[/admin/**]'}];
 data.graph.relationships.push(
  {id:'root-contains',type:'CONTAINS',from:'root-screen',to:'shared',confidence:'CONFIRMED'},
  {id:'static-contains',type:'CONTAINS',from:'a',to:'static-component',confidence:'CONFIRMED'},
  {id:'inferred-contains',type:'CONTAINS',from:'a',to:'inferred-component',confidence:'CONFIRMED'},
  {id:'static-call',type:'TRIGGERS',from:'static-component',to:'redirect-api',confidence:'INFERRED',evidence:[{source:{file:'web/a.jsp',line:3},parser:'Fixture',resolution:'INFERRED'}]},
  {id:'inferred-call',type:'TRIGGERS',from:'inferred-component',to:'inferred-api',confidence:'INFERRED',evidence:[{source:{file:'web/a.jsp',line:4},parser:'RouteTemplateInference',resolution:'INFERRED',detail:'原始樣板=/api/items/${item.id}'}]}
 );
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  const dashboard=page.locator('[data-dashboard]');
  const owners=dashboard.locator('.dashboard-region').filter({hasText:'owners'});
  assert.match(await owners.innerText(),/\/owners(?:\s|$)/);assert.doesNotMatch(await owners.innerText(),/\/owners\/\{ownerId\}\/edit/);
  const homeRegion=dashboard.locator('.dashboard-region').filter({hasText:'首頁與其他'});assert.doesNotMatch(await homeRegion.innerText(),/沒有已知網址/);
  const redirect=dashboard.locator('[data-suspicious-card="系統自動導向"]');assert.match(await redirect.innerText(),/進入 \/admin 開頭的畫面但還沒登入時/);assert.match(await redirect.innerText(),/依據：security\.xml 第 49 行，登入路徑為 \/login/);assert.doesNotMatch(await redirect.innerText(),/LOGIN_PAGE|開頭 的/);
  assert.equal(await dashboard.locator('[data-inferred-api-link]').innerText(),'另有 1 個 API 的呼叫來源是推定的');
 }finally{await browser.close();}
});
