import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('R14 WP45 unreferenced API cards show route labels without internal endpoint IDs',async()=>{
  const data=fixture();
  const endpoint=data.graph.nodes.find(node=>node.id==='unused');
  endpoint.id='endpoint:synthetic-internal-id';
  endpoint.attributes.category='REST_API';
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(await fileFixture(data));
    await page.locator('#app[data-ready=true]').waitFor();
    await page.locator('.first-run-guide button').filter({hasText:'略過'}).click();
    const apiCard=page.locator('.suspicious-card').filter({hasText:'找不到呼叫來源的 API'});
    assert.match(await apiCard.innerText(),/POST \/api\/unused/);
    assert.doesNotMatch(await apiCard.innerText(),/endpoint:synthetic-internal-id/);
  }finally{await browser.close();}
});
