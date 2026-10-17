import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {mdFixture} from './md-fixture.mjs';
import {setDecision} from './decision-controls.mjs';
import {startReviewDownload} from './review-export.mjs';

const download=async page=>readFile(await (await startReviewDownload(page)).path(),'utf8');
const upload=(page,md)=>page.getByLabel('開啟 md',{exact:true}).setInputFiles({name:'review.md',mimeType:'text/markdown',buffer:Buffer.from(md)});
const notice=page=>page.locator('.sidebar-notices [data-import-notice]').filter({hasText:'分析結果已變更'});
/** The same screens and buttons from another analysis run. */
const reanalysed=()=>{const data=mdFixture();data.fingerprint='b'.repeat(64);return data;};

test('a progress file from another analysis warns only when it holds decisions, and the warning can be dismissed',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.goto(await fileFixture(mdFixture()));await page.locator('#app[data-ready=true]').waitFor();
  const empty=await download(page);
  await setDecision(page.locator('[data-screen-review="a"]').first(),'KEEP');
  const decided=await download(page);

  // No decisions: nothing can point at the wrong screen, so nothing to warn about.
  await page.goto(await fileFixture(reanalysed()));await page.locator('#app[data-ready=true]').waitFor();
  await upload(page,empty);await page.getByText('已開啟 md').waitFor();
  assert.equal(await notice(page).count(),0);

  // Decisions from another analysis: warn once, and 知道了 clears it.
  await upload(page,decided);await notice(page).waitFor();
  await notice(page).getByRole('button',{name:'知道了'}).click();
  assert.equal(await page.locator('.sidebar-notices [data-import-notice]').count(),0);
  // The decisions themselves are kept, and the next save carries the current analysis.
  assert.match(await download(page),/analysis_fingerprint: "?b{64}"?/);
 }finally{await browser.close();}
});
