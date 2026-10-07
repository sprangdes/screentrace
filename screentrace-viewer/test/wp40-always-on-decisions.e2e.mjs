import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,node} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

test('WP40 decisions stay available without a mode and synchronize across overview and focused viewer',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(simulationFixture()));
  assert.equal(await page.getByRole('checkbox',{name:'確認模式',exact:true}).count(),0);
  assert.match(await page.locator('[data-review-progress]').innerText(),/已確認/);
  const undecided=page.locator('.screen-card[data-screen="a"]');
  assert.equal(await undecided.locator('[data-screen-status]').count(),0);
  await undecided.locator('.card-review [data-decision="KEEP"]').click();
  assert.equal(await undecided.getAttribute('data-screen-status'),'KEEP');
  await undecided.click();
  await page.locator('.preview[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.focus-heading [data-decision="KEEP"]').count(),1);
  await page.keyboard.press('x');
  assert.equal(await page.locator('.focus-heading [data-decision="REMOVE"]').getAttribute('aria-pressed'),'true');
  await page.frameLocator('iframe').locator('#name').focus();
  await page.keyboard.press('k');
  assert.equal(await page.locator('.focus-heading [data-decision="REMOVE"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-decision="UNDECIDED"]').first().click();
  assert.equal(await page.locator('.focus-heading [data-decision="UNDECIDED"]').getAttribute('aria-pressed'),'true');
 }finally{await browser.close();}
});

test('submit click keeps the clicked button selected and includes its owning form summary',async()=>{
 const data=simulationFixture();
 data.documents.a=data.documents.a.replace('id="submit">送出','id="submit">Find Owner');
 data.graph.nodes.push(node('findbutton','COMPONENT','Find Owner',{kind:'BUTTON',tag:'button',type:'submit'}));
 data.graph.relationships.push({id:'owner-findbutton',type:'CONTAINS',from:'a',to:'findbutton'});
 data.preview.elements.push({graphScreenId:'a',path:'#submit',tag:'button',text:'Find Owner',graphComponentId:'findbutton',componentResolution:'CONFIRMED',bounds:{x:1,y:1,width:100,height:30},styleId:'red'});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.goto(await fileFixture(data));
  await page.locator('[data-screen-list="a"]').click();
  await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.frameLocator('iframe').locator('#name').fill('A');
  await page.frameLocator('iframe').locator('#submit').click();
  assert.match(await page.locator('[data-detail-tab="0"]').innerText(),/標籤：Find Owner/);
  assert.match(await page.locator('[data-detail-tab="0"]').innerText(),/所屬表單/);
  assert.equal(await page.frameLocator('iframe').locator('#submit').getAttribute('data-prototype-selected'),'true');
  assert.match(await page.locator('.prototype-status').innerText(),/模擬送出 GET \/owners/);
  assert.equal(await page.locator('.simulation-choice').count(),3);
 }finally{await browser.close();}
});
