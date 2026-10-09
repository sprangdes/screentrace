import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('WP46 right rationale column has no horizontal overflow at 1440, 1280 or 1024px',async()=>{
 const data=fixture(),long='verylongsegment'.repeat(24);data.graph.nodes.push(node('very-long-api','ENDPOINT','API',{path:`/${long}`,method:'GET',category:'REST_API'}));data.graph.relationships.push({id:'long-api-call',type:'CALLS',from:'shared',to:'very-long-api'});
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(4000);await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();for(const width of [1440,1280,1024]){await page.setViewportSize({width,height:900});const aside=page.locator('.shell[data-screen-review=true]>aside');if(!(await aside.isVisible())){await page.locator('.topbar-more>summary').click();await page.getByRole('menuitem',{name:'查看選取物件資訊'}).click();}await aside.waitFor({state:'visible'});const sizes=await aside.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));assert.ok(sizes.scrollWidth<=sizes.clientWidth,`${width}: ${sizes.scrollWidth} > ${sizes.clientWidth}`);}}finally{await browser.close();}
});
