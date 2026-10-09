import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP45 home contains no map canvas or screen-card controls',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture());await page.locator('#app[data-ready=true]').waitFor();assert.equal(await page.locator('.shell[data-page="dashboard"]').count(),1);assert.equal(await page.locator('.shell[data-page="dashboard"] .world,.shell[data-page="dashboard"] .screen-card,.shell[data-page="dashboard"] .unlinked-screens,.shell[data-page="dashboard"] .relation-line').count(),0);}finally{await browser.close();}
});
