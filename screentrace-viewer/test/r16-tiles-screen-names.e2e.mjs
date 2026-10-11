import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';
import {startReviewDownload} from './review-export.mjs';

test('R16 Tiles page names stay body-derived in dashboard, queue, map and Markdown',async()=>{
 const data=fixture();for(const screen of data.graph.nodes.filter(node=>node.type==='SCREEN')){screen.attributes.tilesDefinition='true';screen.attributes.tilesDefinitionName=`.${screen.name}`;screen.attributes.screenNameSource='body JSP';screen.attributes.screenNameSourcePath=`web/${screen.id}.jsp`;}
 for(const relation of data.graph.relationships){relation.confidence='CONFIRMED';relation.evidence=[{source:{file:'web/tiles.xml',line:1},parser:'TilesFixture',resolution:'CONFIRMED'}];}
 data.documents.a='<html><head><title>Shared Layout Title</title></head><body><h1>Layout</h1></body></html>';data.documents.b=data.documents.a;
 const report=process.env.R16_TILES_REPORT?pathToFileURL(process.env.R16_TILES_REPORT).href:await fileFixture(data),browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(report);await page.locator('#app[data-ready=true]').waitFor();const tabs=page.locator('.primary-tabs button');
  const assertNoLayoutNames=async(labels)=>assert.ok(labels.every(name=>!/^Layout(?:$|\s*(?:\(|（|\/))/.test(name)),labels.join('；'));
  await assertNoLayoutNames(await page.locator('[data-dashboard] [data-suspicious-target="screen"] strong').allTextContents());
  await tabs.nth(1).click();await page.locator('[data-review-queue-screen]').first().waitFor();await assertNoLayoutNames(await page.locator('[data-review-queue-screen] .sidebar-screen strong').allTextContents());
  await tabs.nth(3).click();await page.locator('[data-page="screen"]').waitFor();await assertNoLayoutNames(await page.locator('.screen-card strong').allTextContents());
  await tabs.nth(5).click();const delivery=page.locator('[data-page="delivery"]');await delivery.waitFor();assert.doesNotMatch(await delivery.innerText(),/^.*Layout(?:\s*(?:\(|（|\/)).*$/m);const download=await startReviewDownload(page),md=await readFile(await download.path(),'utf8');
  assert.doesNotMatch(md,/^## .*Layout(?:$|\s*(?:\(|（|\/))/m);assert.doesNotMatch(md,/\|\s*Layout(?:$|\s*(?:\(|（|\/))/);
 } finally {await browser.close();}
});
