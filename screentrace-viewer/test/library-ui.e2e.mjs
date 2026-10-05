import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {mdFixture} from './md-fixture.mjs';
import {setDecision} from './decision-controls.mjs';

for(const engine of process.env.ST_BROWSERS?.split(',')||['chromium'])test(`${engine}: library suggestions use requester language and keep technical values collapsed`,async()=>{
 const browser=await({chromium,firefox,webkit}[engine]).launch();
 try{
  const data=mdFixture();
  data.componentLibrary={manifest:JSON.parse(await readFile(new URL('../../docs/examples/component-library.sample.json',import.meta.url),'utf8')),sha256:'a'.repeat(64)};
  data.componentLibrary.manifest.library.name='Sample `Controls`';
  data.componentLibrary.manifest.components[0].name='Sample `button`';
  const url=await fileFixture(data),page=await browser.newPage();
  await page.goto(url);await page.getByRole('checkbox',{name:'確認模式',exact:true}).check();
  await setDecision(page.locator('[data-screen-review="a"]'),'KEEP');
  await page.locator('.screen-card[data-screen="a"]').click();
  await page.locator('[data-component="shared"]').click();
  const details=page.locator('[data-library-details]');await details.waitFor();
  const text=await details.innerText();
  assert.doesNotMatch(text,/`/,'requester-facing library details must not expose Markdown delimiters');
  assert.doesNotMatch(text,/(?:\bMATCH\b|\bstable\b)/,'requester-facing library details must translate match and status enums');
  assert.match(text,/已對應|建議/);
  const technical=details.locator('details');
  assert.equal(await technical.count(),1,'technical comparison values belong in a collapsed details disclosure');
  assert.equal(await technical.evaluate(node=>node.open),false);
  await technical.locator('summary').click();
  const expanded=await technical.innerText();
  assert.match(expanded,/sample-button/);
  assert.match(expanded,/MATCH/);
  assert.match(expanded,/stable/);
  assert.match(expanded,/\\u\{60\}/,'literal backticks from manifest text must be displayed as visible escapes');
 }finally{await browser.close();}
});
