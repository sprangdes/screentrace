import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {waitForGuideScreenshotReady} from '../tools/guide-screenshots.mjs';

test('guide screenshot readiness waits for delayed preview hydration, resets scroll state and waits for a quiescent document',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');if(!descriptor?.set)throw new Error('srcdoc setter unavailable');Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...descriptor,set(value){setTimeout(()=>descriptor.set.call(this,value),240);}});});
  await page.goto(await fileFixture());await page.locator('#app[data-ready="true"]').waitFor();await page.locator('[data-screen-list="a"]').click();
  await page.locator('.preview[aria-busy="true"]').waitFor();await page.evaluate(()=>{const panel=document.createElement('div');panel.dataset.screenshotScrollFixture='';panel.style='height:20px;overflow:auto';panel.innerHTML='<div style="height:200px">test</div>';document.body.append(panel);panel.scrollTop=100;});await waitForGuideScreenshotReady(page);
  assert.equal(await page.locator('.preview[aria-busy="true"]').count(),0,'capture must wait until the delayed iframe is hydrated');
  assert.equal(await page.locator('[data-screenshot-scroll-fixture]').evaluate(node=>node.scrollTop),0,'capture must start from a known scroll origin');
 }finally{await browser.close();}
});
