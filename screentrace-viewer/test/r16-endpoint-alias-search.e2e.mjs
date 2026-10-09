import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('R16 endpoint global search finds both public path and proven logical alias',async()=>{
 const data=fixture();
 data.graph.nodes.push(node('save','ENDPOINT','POST /save.do',{path:'/save.do',httpMethod:'POST',aliases:'/legacy-save',logicalPath:'/legacy-save'}));
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const payload=await fileFixture(data);
  await page.goto(payload);
  await page.locator('[data-ready="true"]').waitFor();
  await page.getByRole('button',{name:'全域搜尋'}).click();
  const search=page.getByRole('searchbox',{name:'全域搜尋'});
  await search.fill('/legacy-save');
  const results=page.locator('[data-global-group="api"] [data-global-result="api"]');
  assert.equal(await results.count(),1);
  assert.match(await results.first().innerText(),/\/save\.do/);
  await search.fill('/save.do');
  assert.equal(await results.count(),1);
  assert.match(await results.first().innerText(),/\/save\.do/);
 }finally{await browser.close();}
});
