import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('WP39 viewer removes mode controls, keeps reset and zoom in an accessible overflow menu, and adds a style tab',async()=>{
 const data=fixture();data.documents.a='<html><body><button id="shared">共用按鈕</button><p id="copy">文字</p></body></html>';
 data.preview.elements=[{graphScreenId:'a',path:'html:nth-of-type(1)>body:nth-of-type(1)>button:nth-of-type(1)',tag:'button',text:'共用按鈕',graphComponentId:'shared',componentResolution:'CONFIRMED',bounds:{x:0,y:0,width:80,height:30},styleId:'button-style',defaultId:'button'},{graphScreenId:'a',path:'html:nth-of-type(1)>body:nth-of-type(1)>p:nth-of-type(1)',tag:'p',text:'文字',bounds:{x:0,y:40,width:80,height:20},styleId:'paragraph-style',defaultId:'p'}];data.preview.styles={'button-style':{color:'rgb(12, 34, 56)',fontWeight:'700'},'paragraph-style':{color:'rgb(22, 44, 66)'}};data.preview.defaults={button:{display:'inline-block'},p:{display:'block'}};
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1024,height:768}});const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('[data-screen-list="a"]').click();
  const toolbar=page.locator('.prototype-toolbar');assert.equal(await toolbar.getByRole('button',{name:/操作|檢查|顯示可操作元素|縮放/}).count(),0);assert.equal(await toolbar.locator('select').count(),0);assert.match(await toolbar.innerText(),/看流程/);assert.ok(await toolbar.locator('button').count()<=7);assert.equal(await page.getByRole('tab',{name:'樣式',exact:true}).count(),1);
  await toolbar.getByRole('button',{name:'更多檢視選項'}).click();await page.getByRole('menuitem',{name:'重置',exact:true}).waitFor();await page.getByRole('menuitem',{name:'回到起點',exact:true}).waitFor();await page.getByRole('menuitem',{name:'縮放：75%',exact:true}).click();assert.equal(await page.locator('.prototype-viewer').getAttribute('data-scale'),'0.75');
  const frame=page.frameLocator('iframe');await frame.locator('#shared').hover();await page.locator('.preview-hover').waitFor();assert.match(await page.locator('aside').innerText(),/共用按鈕/);assert.equal(await frame.locator('#shared').getAttribute('data-prototype-selected'),null);
  await frame.locator('#shared').click({modifiers:['Alt']});assert.equal(await frame.locator('#shared').getAttribute('data-prototype-selected'),'true');assert.equal(await page.locator('.prototype-status').innerText(),'');
  await page.getByRole('tab',{name:'樣式',exact:true}).click();assert.match(await page.locator('[data-detail-tab="3"]').innerText(),/rgb\(12, 34, 56\)/);assert.match(await page.locator('[data-detail-tab="3"]').innerText(),/fontWeight：700/);
  await page.keyboard.press('Escape');assert.equal(await frame.locator('#shared').getAttribute('data-prototype-selected'),null);assert.deepEqual(requests,[]);assert.equal(await page.evaluate(()=>window.__targetProbe),undefined);
 }finally{await browser.close();}
});
