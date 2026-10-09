import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';
import {startReviewDownload} from './review-export.mjs';

test('WP47 screen and component reasons, note limits, undecided draft restore and v3 export',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);const data=fixture();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();await page.locator('[data-review-queue]').waitFor();
  const screen=page.locator('[data-review-queue-screen="a"]');await screen.locator('.sidebar-screen').click();await page.locator('.review-workspace-heading [data-screen-decision="REMOVE"]').click();const screenReason=page.locator('[data-decision-reason="screen:a"]');await screenReason.waitFor();await screenReason.selectOption('DISCONTINUED');const screenNote=page.locator('[data-decision-note="screen:a"]');await screenNote.fill('業務單位確認已停用');
  await screen.locator('.sidebar-screen').click();const component=page.locator('[data-review-queue-component="shared"]');await component.locator('[data-component-decision="KEEP"]').click();const componentReason=page.locator('[data-decision-reason="component:a:shared"]');await componentReason.waitFor();await componentReason.selectOption('IN_USE');await page.locator('[data-decision-note="component:a:shared"]').fill('法規要求保留');
  await page.locator('[data-decision-note="screen:a"]').fill('😀'.repeat(1001));assert.match(await page.locator('[data-decision-note-error="screen:a"]').innerText(),/1,000/);assert.ok(await page.locator('[data-decision-note="screen:a"]').inputValue().then(value=>Array.from(value).length<=1000));
  await page.keyboard.press('u');assert.equal(await screen.getAttribute('data-decision'),'UNDECIDED');assert.equal(await screenReason.isVisible(),false);await page.keyboard.press('x');assert.equal(await screen.getAttribute('data-decision'),'REMOVE');assert.equal(await screenReason.inputValue(),'DISCONTINUED');
  const download=await startReviewDownload(page),md=await download.path().then(async path=>await (await import('node:fs/promises')).readFile(path,'utf8'));const machine=JSON.parse(md.split('```json screentrace-review-state\n')[1].split('\n```')[0]);assert.equal(machine.format_version,3);assert.equal(machine.decision_notes.screens.a.reason,'DISCONTINUED');assert.equal(machine.decision_notes.components.a.shared.reason,'IN_USE');assert.equal(machine.decision_notes.screens.a.note,'業務單位確認已停用');
 }finally{await browser.close()}
});
