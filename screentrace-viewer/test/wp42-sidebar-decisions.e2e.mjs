import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture,fileFixture} from './fixture.mjs';

test('sidebar screen decisions are quiet by default, reveal on hover/focus/long press, and remain keyboard operable',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
  await page.goto(await fileFixture(fixture()));
  const row=page.locator('.sidebar-screen-row').filter({has:page.locator('[data-screen-list="a"]')}).first();
  const choices=row.locator('.decision-buttons');
  assert.equal(await choices.evaluate(el=>getComputedStyle(el).opacity),'0');
  await row.hover();
  await page.waitForFunction(el=>getComputedStyle(el).opacity==='1',await choices.elementHandle());
  await page.mouse.move(1400,850);
  await page.locator('[data-screen-list="a"]').focus();
  await page.waitForFunction(el=>getComputedStyle(el).opacity==='1',await choices.elementHandle());
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('data-decision'),'UNDECIDED');
  await page.keyboard.press('ArrowRight');
  assert.equal(await choices.locator('[data-decision="KEEP"]').getAttribute('aria-checked'),'true');
  assert.equal(await choices.locator('[data-decision="KEEP"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-screen-list="a"]').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:9,isPrimary:true});
  await page.waitForFunction(el=>el.classList.contains('touch-revealed'),await row.elementHandle());
  assert.equal(await choices.evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.locator('[data-screen-list="a"]').dispatchEvent('pointerup',{pointerType:'touch',pointerId:9,isPrimary:true});
  await choices.locator('[data-decision="REMOVE"]').click();
  assert.equal(await page.locator('[data-screen-list="a"] .decision-REMOVE').count(),1);
  assert.equal(await page.locator('[data-screen-list="a"]').evaluate(el=>el.getAttribute('aria-label')).then(v=>v?.includes('移除')),true);
 }
 finally{await browser.close();}
});
