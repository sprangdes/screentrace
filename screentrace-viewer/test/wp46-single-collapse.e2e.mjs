import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('WP46 review exposes one right-panel collapse control at the panel upper-right',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(fixture()));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();await page.locator('[data-page="screen"]').waitFor();
  const controls=page.getByRole('button',{name:'收合右側欄',exact:true});assert.equal(await controls.count(),1);
  const button=page.locator('.panel-collapse'),panel=page.locator('.shell>aside');const buttonBox=await button.boundingBox(),panelBox=await panel.boundingBox();assert.ok(buttonBox&&panelBox);assert.ok(Math.abs(buttonBox.x+buttonBox.width-(panelBox.x+panelBox.width))<=10,'collapse control is aligned to the panel right edge');assert.ok(buttonBox.y-panelBox.y<16,'collapse control is at the panel top');
 }finally{await browser.close();}
});
