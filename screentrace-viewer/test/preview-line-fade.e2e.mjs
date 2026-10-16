import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';
import {commonNavigation} from './common-navigation-fixture.mjs';

/** WP26 simulation fixture: on screen a, 「已解析連結」(go) leads to b and 「歧義連結」(amb) has no known destination. */
async function open(data,screen){
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.setDefaultTimeout(5000);
 await page.goto(await fileFixture(data));await page.locator('#app[data-ready="true"]').waitFor();
 await page.locator(`.screen-list [data-screen-list="${screen}"]`).click();
 await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();
 await page.locator('.focus-line-hit').first().waitFor({state:'attached'});
 return {browser,page};
}
/** Opacity of each focus line, keyed by kind and destination. */
const opacities=page=>page.locator('.focus-line-hit').evaluateAll(hits=>Object.fromEntries(hits.map(h=>[`${h.dataset.kind}:${h.dataset.to}`,Number(getComputedStyle(h.parentNode).opacity)])));
const faded=value=>value>0.2&&value<0.4;

test('Focus lines are faded by default and come back when hovered or tabbed to',async()=>{
 const {browser,page}=await open(simulationFixture(),'a');
 try{
  const before=await opacities(page);
  assert.ok(Object.keys(before).length>1,'fixture draws several lines');
  for(const [key,value] of Object.entries(before))assert.ok(faded(value),`${key} is faded (${value})`);
  const line=page.locator('.focus-line-hit[data-kind="known"][data-to="b"]');
  await line.hover({force:true}); // the hit path's stroke is transparent, so it never counts as visible
  const hovered=await opacities(page);
  assert.equal(hovered['known:b'],1);
  for(const [key,value] of Object.entries(hovered))if(key!=='known:b')assert.ok(faded(value),`${key} stays faded while another line is hovered`);
  assert.equal(await page.frameLocator('iframe').locator('[data-line-trigger]').count()>0,true,'the hovered line still marks its button in the preview');
  await page.mouse.move(2,2);
  assert.ok(faded((await opacities(page))['known:b']),'the line fades again when the pointer leaves');
  await line.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  assert.equal((await opacities(page))['known:b'],1,'a line reached with Tab is shown at full strength');
 }finally{await browser.close();}
});

test('Pointing at a button in the side panel or the preview brings back the lines it leads along',async()=>{
 const {browser,page}=await open(simulationFixture(),'a');
 try{
  const section=page.locator('[data-screen-panel="a"] .panel-buttons');
  if(!await section.evaluate(details=>details.open))await section.locator(':scope>summary').click();
  await section.locator('[data-component-row="go"]').hover();
  let now=await opacities(page);
  assert.equal(now['known:b'],1,'「已解析連結」lights its line to b');
  for(const [key,value] of Object.entries(now))if(key!=='known:b')assert.ok(faded(value),`${key} stays faded`);
  await section.locator('[data-component-row="amb"]').hover();
  now=await opacities(page);
  assert.ok(faded(now['known:b']),'moving to another row fades the previous line');
  const unresolved=Object.keys(now).find(key=>key.startsWith('unresolved:'));
  assert.ok(unresolved&&now[unresolved]===1,'a button without a known destination lights the unresolved exit');
  await page.mouse.move(2,2);
  for(const [key,value] of Object.entries(await opacities(page)))assert.ok(faded(value),`${key} fades after leaving the panel`);
  await page.frameLocator('iframe').locator('#go').hover();
  assert.equal((await opacities(page))['known:b'],1,'pointing at the button in the preview lights its line');
  await page.mouse.move(2,2);
  assert.ok(faded((await opacities(page))['known:b']),'leaving the preview fades it again');
 }finally{await browser.close();}
});

test('Header/footer link labels are not faded',async()=>{
 const {browser,page}=await open(commonNavigation(),'d');
 try{
  const label=page.locator('.shared-link[data-direction="in"]');
  assert.equal(await label.evaluate(node=>{let o=1;for(let n=node;n;n=n.parentElement)o*=Number(getComputedStyle(n).opacity);return o;}),1);
  assert.ok(faded(await page.locator('.focus-line.shared.is-in').evaluate(line=>Number(getComputedStyle(line.parentNode).opacity))),'its dashed line fades like the others');
 }finally{await browser.close();}
});
