import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture,fileFixture,node} from './fixture.mjs';

function namingFixture(){
 const data=fixture(),components=[
  node('empty-button','COMPONENT','按鈕 1',{kind:'BUTTON',tag:'button'}),
  node('empty-link','COMPONENT','連結 1',{kind:'LINK',tag:'a'}),
  node('select-1','COMPONENT','下拉選單 1',{kind:'SELECT',tag:'select'}),
  node('add-owner-form','COMPONENT','add-owner-form',{kind:'FORM',tag:'form'}),
  node('nav-brand','COMPONENT','brand-link',{kind:'LINK',tag:'a',id:'brand-link',class:'navbar-toggler'}),
  node('plain-button','COMPONENT','button-plain',{kind:'BUTTON',tag:'button'})
 ];
 data.graph.nodes.push(...components);
 data.graph.relationships.push(...components.map(item=>({id:`owner-${item.id}`,type:'CONTAINS',from:'a',to:item.id,confidence:'CONFIRMED'})),
  {id:'nav-target',type:'NAVIGATES_TO',from:'empty-link',to:'b',confidence:'CONFIRMED'});
 data.documents.a='<html><body><nav><a id="brand-link" data-st-component-id="nav-brand"><img alt="螢幕追蹤首頁"></a></nav><main><h1>Find Owners</h1><form id="add-owner-form" data-st-component-id="add-owner-form"><h2>Find Owners</h2><input name="lastName"><button type="submit" value="Find Owner" data-st-component-id="empty-button"></button><a data-st-component-id="empty-link"></a><select data-st-component-id="select-1"></select><button class="navbar-toggler" data-st-component-id="plain-button"></button></form></main></body></html>';
 data.documents.b='<html><body>Owner Details</body></html>';
 return data;
}

test('WP42 public names stay readable in screen details, button table, global search and flow outline',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(namingFixture()));
  await page.locator('.screen-card[data-screen="a"]').click();
  const list=page.locator('.action-items');await list.waitFor();
  const labels=await list.locator('[data-component]').allInnerTexts();
  assert.ok(labels.some(label=>label.includes('Find Owner')));
  assert.ok(labels.some(label=>label.includes('螢幕追蹤首頁')));
  await page.locator('.field-items summary').click();
  const fieldLabels=await page.locator('.field-items [data-component]').allInnerTexts();
  assert.ok(fieldLabels.some(label=>label.includes('Find Owners 表單')),JSON.stringify(fieldLabels));
  const visible=await list.innerText();
  for(const value of ['按鈕 1','連結 1','下拉選單 1','add-owner-form','第 1 行'])assert.equal(visible.includes(value),false,`details must not display ${value}`);
  await page.locator('.flow-outline summary').click();await page.locator('.flow-outline-node').first().waitFor();
  const flow=await page.locator('.flow-outline').innerText();
  assert.equal(flow.includes('連結 1'),false);assert.equal(flow.includes('第 1 行'),false);
  await page.getByRole('button',{name:/按鈕/}).first().click();
  const table=page.locator('.button-table');await table.waitFor();const tableText=await table.innerText();
  for(const value of ['按鈕 1','連結 1','下拉選單 1','add-owner-form','第 1 行'])assert.equal(tableText.includes(value),false,`button table must not display ${value}`);
  await page.getByRole('button',{name:/搜尋/}).first().click();
  await page.locator('.global-search-dialog input').fill('Find');
  const searchText=await page.locator('.global-search-results').innerText();
  for(const value of ['按鈕 1','連結 1','下拉選單 1','add-owner-form','第 1 行'])assert.equal(searchText.includes(value),false,`search must not display ${value}`);
  const unnamed=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent.trim()&&!button.getAttribute('aria-label')&&!button.title).map(button=>button.outerHTML));
  assert.deepEqual(unnamed,[],'icon-only buttons need accessible names and hover titles');
 }finally{await browser.close();}
});

test('WP42 names ignore reconstructed sample text and use the shared cross-screen location everywhere',async()=>{
 const data=fixture();
 data.graph.nodes.find(item=>item.id==='a').name='Owners Home';data.graph.nodes.find(item=>item.id==='b').name='Owners List';
 data.graph.nodes=data.graph.nodes.filter(item=>item.id!=='shared');data.graph.relationships=data.graph.relationships.filter(edge=>edge.from!=='shared'&&edge.to!=='shared');
 const dynamic=node('dynamic-link-1','COMPONENT','連結 1',{kind:'LINK',tag:'a',visibleText:'${owner.name}'});
 const flowTrigger=node('flow-link-1','COMPONENT','連結 2',{kind:'LINK',tag:'a',visibleText:'${owner.name}'});
 data.graph.nodes.push(dynamic,flowTrigger);
 data.graph.relationships.push({id:'dynamic-owner-a',type:'CONTAINS',from:'a',to:dynamic.id},{id:'dynamic-owner-b',type:'CONTAINS',from:'b',to:dynamic.id},{id:'dynamic-nav',type:'NAVIGATES_TO',from:dynamic.id,to:'b'},{id:'flow-owner-a',type:'CONTAINS',from:'a',to:flowTrigger.id},{id:'flow-nav',type:'NAVIGATES_TO',from:flowTrigger.id,to:'b'});
 data.documents.a='<html><body><nav><a data-st-component-id="dynamic-link-1">Alex Johnson</a><a data-st-component-id="flow-link-1">Alex Johnson</a></nav><h1>Owners Home</h1></body></html>';
 data.documents.b='<html><body><nav><a data-st-component-id="dynamic-link-1">Alex Johnson</a></nav><h1>Owners List</h1></body></html>';
 data.preview.screens.forEach(screen=>screen.dynamicExpressions=['${owner.name}']);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture(data));
  const expected='連結（位於 導覽列）';
  await page.locator('.screen-card[data-screen="a"]').click();
  assert.match(await page.locator('.action-items').innerText(),new RegExp(expected));
  assert.doesNotMatch(await page.locator('.action-items').innerText(),/Alex Johnson|連結 1|Owners Home 畫面/);
  await page.locator('.flow-outline summary').click();await page.locator('.flow-outline-node').first().waitFor();
  assert.match(await page.locator('.flow-outline').innerText(),new RegExp(expected));
  assert.doesNotMatch(await page.locator('.flow-outline').innerText(),/Alex Johnson|連結 1|Owners Home 畫面/);
  await page.getByRole('button',{name:/按鈕/}).first().click();
  const globalRow=page.locator('.button-table [data-button-row^="global:"]');
  assert.match(await globalRow.innerText(),new RegExp(expected));
  assert.doesNotMatch(await globalRow.innerText(),/Owners Home|Alex Johnson|連結 1/);
  await globalRow.locator('.button-row-open').click();
  const members=page.locator('.button-global-members');assert.match(await members.innerText(),new RegExp(expected));
  assert.doesNotMatch(await members.innerText(),/Alex Johnson|連結 1/);
  await page.getByRole('button',{name:/搜尋/}).first().click();await page.locator('.global-search-dialog input').fill('連結');
  assert.match(await page.locator('.global-search-results').innerText(),new RegExp(expected));
  assert.doesNotMatch(await page.locator('.global-search-results').innerText(),/Alex Johnson|連結 1|Owners Home 畫面/);
  await page.locator('[data-global-result="button"]').first().click();
  assert.match(await page.locator('.action-items').innerText(),new RegExp(expected));
  await page.locator('.review-progress').click();
  assert.doesNotMatch(await page.locator('.review-progress-panel').innerText(),/Alex Johnson|連結 1|Owners Home 畫面/);
  await page.locator('[data-md-export]').click();
  const exportCheck=page.locator('.pre-export-check');await exportCheck.waitFor();
  assert.doesNotMatch(await exportCheck.innerText(),/Alex Johnson|連結 1|Owners Home 畫面/,await exportCheck.innerText());
 }finally{await browser.close();}
});
