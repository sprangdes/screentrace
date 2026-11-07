import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';import {openScreen} from './decision-controls.mjs';

test('R37 the screen panel lists each called API with the same method tag as the API page',async()=>{
 const data=fixture(),ep=data.graph.nodes.find(n=>n.id==='ep');
 data.graph.behaviors=[{id:'call',triggerId:'shared',type:'CALL_API',targetId:'ep',event:'click',expression:'fetch("/api/owners")',evidence:[{parser:'Fixture',resolution:'CONFIRMED',source:{file:'web/a.js',line:1}}]}];
 const browser=await chromium.launch();try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(await fileFixture(data));await openScreen(page,'a');
  const link=page.locator('aside [data-section="apis"] [data-api="ep"]');
  const method=ep.attributes.httpMethod||ep.attributes.method||'ANY',path=ep.attributes.path||ep.attributes.route||ep.name;
  const badge=link.locator('.method-badge');
  assert.equal(await badge.getAttribute('data-method'),method);
  assert.equal(await link.locator('code.api-link-path').innerText(),path);
  assert.equal(await link.getAttribute('aria-label'),`${method==='ANY'?'任何方法':method} ${path}`,'the spoken label keeps the method in words');
  const panelStyle=await badge.evaluate(b=>{const s=getComputedStyle(b);return [s.backgroundColor,s.color,s.borderColor,s.fontSize,s.minWidth];});
  await link.click();
  const apiStyle=await page.locator('[data-api-row="ep"] .method-badge').evaluate(b=>{const s=getComputedStyle(b);return [s.backgroundColor,s.color,s.borderColor,s.fontSize,s.minWidth];});
  assert.deepEqual(panelStyle,apiStyle,'the tag looks the same in both places');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
