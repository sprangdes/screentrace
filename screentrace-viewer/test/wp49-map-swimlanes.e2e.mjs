import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('WP49 functional map renders one deterministic lane per feature area and keeps no-entry screens inside their lane',async()=>{
 const data=fixture();data.graph.nodes.push(node('c','SCREEN','孤立畫面',{route:'/isolated'}),node('d','SCREEN','另一區畫面',{route:'/billing/invoices'}));
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(3).click();await page.locator('.canvas').waitFor();
  const lanes=page.locator('.feature-lane'),cards=page.locator('.screen-card');assert.ok(await lanes.count()>=2);assert.equal(await cards.count(),4);const keys=new Set();for(const card of await cards.all()){const key=await card.getAttribute('data-region-key');assert.ok(key);keys.add(key);assert.equal(await page.locator(`.feature-lane[data-region-lane="${key}"]`).count(),1);}assert.equal(await lanes.count(),keys.size);
 }finally{await browser.close();}
});
