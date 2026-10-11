import {openScreen} from './decision-controls.mjs';
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
  const line=(from,to)=>page.locator(`.relation-line[data-from="${screen(from).id}"][data-to="${screen(to).id}"]`);
  assert.equal(await line('form','detail').count(),1,'submit success must lead to detail');
  assert.equal(await line('form','form').count(),1,'validation failure must retain its self return');
  for(const view of ['find','detail','list'])assert.equal(await line('find',view).count(),1,`search return ${view}`);
  await openScreen(page,screen('detail').id);assert.equal(await page.locator(`aside [data-inbound="${screen('form').id}"]`).count(),1);
  assert.equal(external.length,0);
 } finally {await browser.close();}
});
