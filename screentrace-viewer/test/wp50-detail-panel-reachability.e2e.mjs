import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {openScreen, setDecision} from './decision-controls.mjs';

test('WP50 focused details can scroll the last component control fully into view', async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    await page.goto(await fileFixture());
    await setDecision(page.locator('[data-screen-review="a"]'),'KEEP');
    await openScreen(page,'a');
    const control=page.locator('[data-component="shared"]');
    await control.scrollIntoViewIfNeeded();
    const panel=await page.locator('aside').boundingBox();
    const bounds=await control.boundingBox();
    assert.ok(panel&&bounds);
    assert.ok(bounds.y>=panel.y&&bounds.y+bounds.height<=panel.y+panel.height,
      `component control bounds ${JSON.stringify(bounds)} exceed details panel ${JSON.stringify(panel)}`);
    assert.equal(await control.evaluate(element=>{const rect=element.getBoundingClientRect();const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return hit===element||element.contains(hit);}),true,
      'the right-panel collapse control must not cover detail actions');
  } finally { await browser.close(); }
});
