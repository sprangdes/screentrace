import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';
test('WP79 offline variant search, previews and audience conditions stay distinct',async()=>{
 const data=fixture();data.graph.schemaVersion='2.3';
 for(const [i,s] of data.graph.nodes.filter(n=>n.type==='SCREEN').entries()){s.attributes={route:'/',entryPointId:'entry',audienceVariant:String(i)};s.audience=[{text:'visitor',truth:!!i,source:{file:'src/App.tsx',line:3}}];s.name=i?'已登入（visitor）':'訪客（!visitor）';}
 const browser=await chromium.launch();try{
  const page=await browser.newPage();let requests=0;page.on('request',r=>{if(/^https?:/.test(r.url()))requests++;});await page.goto(await fileFixture(data));await page.waitForSelector('[data-ready="true"]');
  assert.equal(await page.locator('.screen-card').count(),2);
  await page.locator('.screen-card[data-screen="a"]').click();await page.waitForSelector('[data-screen-panel="a"]');
  assert.match(await page.locator('[data-screen-panel="a"]').textContent(),/適用條件.*!\(visitor\)/s);
  assert.equal(requests,0);
 }finally{await browser.close();}
});
