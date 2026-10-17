import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

/** Three screens share one header logout button; two APIs belong to one controller, one has no handler. */
function data(){
 const d=fixture(),g=d.graph;
 for(const id of ['c','e'])g.nodes.push(node(id,'SCREEN',id==='c'?'丙':'戊',{route:`/${id}`}));
 g.nodes.push(node('logout-a','COMPONENT','登出',{kind:'BUTTON'}),node('logout-b','COMPONENT','登出',{kind:'BUTTON'}),node('logout-c','COMPONENT','登出',{kind:'BUTTON'}));
 for(const id of ['logout-a','logout-b','logout-c'])g.nodes.find(n=>n.id===id).source={file:'web/header.jsp',line:7};
 g.nodes.push(node('logout','ENDPOINT','POST /api/auth/logout',{path:'/api/auth/logout',httpMethod:'POST',category:'REST_API'}));
 g.nodes.push(node('handler-logout','HANDLER','AuthController.logout()',{class:'AuthController',method:'logout'}),node('handler-login','HANDLER','AuthController.login()',{class:'AuthController',method:'login'}));
 g.nodes.find(n=>n.id==='ep').attributes.path='/api/auth/login';
 g.relationships.push(
  {id:'h1',type:'HANDLED_BY',from:'logout',to:'handler-logout'},{id:'h2',type:'HANDLED_BY',from:'ep',to:'handler-login'},
  {id:'s1',type:'CONTAINS',from:'a',to:'logout-a'},{id:'s2',type:'CONTAINS',from:'c',to:'logout-b'},{id:'s3',type:'CONTAINS',from:'e',to:'logout-c'},
  {id:'t1',type:'TRIGGERS',from:'logout-a',to:'logout'},{id:'t2',type:'TRIGGERS',from:'logout-b',to:'logout'},{id:'t3',type:'TRIGGERS',from:'logout-c',to:'logout'},
  {id:'t4',type:'TRIGGERS',from:'shared',to:'ep'});
 g.apiContracts=[{endpointId:'ep',request:{contentType:'application/json',bodyType:'LoginRequest',fields:[{name:'account',type:'String',location:'BODY',required:true}]},responses:[{status:'200',bodyType:'LoginResponse',fields:[]}],confidence:'CONFIRMED'}];
 return d;
}

test('API page lists APIs by controller beside one API\'s detail, and moves with the arrow keys',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(await fileFixture(data()));await page.locator('#app[data-ready=true]').waitFor();
  await page.locator('.page-tab[data-page="api"]').click();await page.locator('.api-page').waitFor();
  assert.deepEqual(await page.locator('.api-group-name').allInnerTexts(),['AuthController','找不到處理程式'],'groups by controller, unhandled APIs last');
  assert.equal(await page.locator('[data-api-group="AuthController"] .api-row').count(),2);
  // Only APIs needing attention carry a status tag in the list.
  assert.equal(await page.locator('[data-api-row="ep"] .api-status').count(),0);
  assert.equal(await page.locator('[data-api-row="unused"] .api-status').innerText(),'未被使用');
  // The first API is selected and shown; the arrow keys move the selection and the detail follows.
  const first=page.locator('.api-row[aria-selected=true]');assert.equal(await first.getAttribute('data-api-row'),'ep');
  assert.match(await page.locator('.api-detail [data-api-section="handlers"]').innerText(),/AuthController\.login\(\)\s*web\/handler-login\.jsp:1/);
  await first.focus();await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.api-row[aria-selected=true]').getAttribute('data-api-row'),'logout');
  assert.match(await page.locator('.api-detail-path').innerText(),/\/api\/auth\/logout/);
  // One header button reached from three screens is one shared entry, not three screens.
  const shared=page.locator('.api-detail .api-shared');
  assert.equal(await shared.count(),1);assert.match(await shared.locator('summary').innerText(),/共用按鈕「登出[^」]*」\s*3 個畫面\s*web\/header\.jsp:7/);
  assert.equal(await page.locator('.api-detail .api-caller-screen').count(),0);
  // Request／Response sits last and starts folded.
  await page.locator('.api-row[data-api-row="ep"]').click();
  const contract=page.locator('.api-detail .api-contract');
  assert.equal(await contract.evaluate(details=>details.open),false);
  assert.equal(await page.locator('.api-detail-inner > :last-child').evaluate(node=>node.classList.contains('api-contract')),true);
  await contract.locator('summary').click();
  assert.match(await contract.innerText(),/LoginRequest[\s\S]*account\s+String\s+BODY\s+是[\s\S]*Response 200[\s\S]*LoginResponse/);
  // Grouping by URL area and folding a group.
  await page.locator('[data-api-grouping="url"]').click();
  assert.deepEqual(await page.locator('.api-group-name').allInnerTexts(),['/api/auth','/api/unused']);
  await page.locator('[data-api-group="/api/unused"] .api-group-header').click();
  assert.equal(await page.locator('[data-api-row="unused"]').isVisible(),false);
  // The page never scrolls as a whole: the list and the detail scroll on their own.
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollHeight<=innerHeight),true);
 }finally{await browser.close();}
});
