import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';

test('WP18 source fixture offline map exposes submit success, validation return and all search branches',async()=>{
 const report=fileURLToPath(new URL('../../screentrace-cli/target/wp18-fixtures/first/report/screentrace-report.html',import.meta.url));
 const html=await readFile(report,'utf8'),data=JSON.parse(html.split('<script id="st-data" type="application/json">')[1].split('</script>')[0]);
 const screen=view=>data.graph.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view.endsWith(`records/${view}.jsp`));
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage(),external=[];
  page.on('request',r=>{if(!/^(file|data|about|blob):/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(report).href);await page.waitForSelector('[data-ready="true"]');
  await page.locator(`.screen-card[data-screen="${screen('form').id}"]`).click();
  const formRelations=await page.locator('.focus-relation').evaluateAll(lines=>lines.map(line=>line.getAttribute('data-to')));
  assert.ok(formRelations.includes(screen('detail').id),'submit success must lead to detail');
  assert.ok(formRelations.includes(screen('form').id),'validation failure must retain its self return');
  await page.getByRole('button',{name:'總覽',exact:true}).click();
  await page.locator(`.screen-card[data-screen="${screen('find').id}"]`).click();
  const searchRelations=await page.locator('.focus-relation').evaluateAll(lines=>lines.map(line=>line.getAttribute('data-to')));
  for(const view of ['find','detail','list'])assert.ok(searchRelations.includes(screen(view).id),`search return ${view}`);
  assert.equal(external.length,0);
 } finally {await browser.close();}
});
