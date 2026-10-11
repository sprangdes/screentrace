import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';
import {startReviewDownload} from './review-export.mjs';

test('R16 Tiles page names stay body-derived in the screen list, canvas, details panel and Markdown',async()=>{
 const data=fixture();for(const screen of data.graph.nodes.filter(node=>node.type==='SCREEN')){screen.attributes.tilesDefinition='true';screen.attributes.tilesDefinitionName=`.${screen.name}`;screen.attributes.screenNameSource='body JSP';screen.attributes.screenNameSourcePath=`web/${screen.id}.jsp`;}
 for(const relation of data.graph.relationships){relation.confidence='CONFIRMED';relation.evidence=[{source:{file:'web/tiles.xml',line:1},parser:'TilesFixture',resolution:'CONFIRMED'}];}
 data.documents.a='<html><head><title>Shared Layout Title</title></head><body><h1>Layout</h1></body></html>';data.documents.b=data.documents.a;
 const report=process.env.R16_TILES_REPORT?pathToFileURL(process.env.R16_TILES_REPORT).href:await fileFixture(data),browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(report);await page.locator('#app[data-ready=true]').waitFor();
  const assertNoLayoutNames=async(labels)=>assert.ok(labels.length&&labels.every(name=>!/^Layout(?:$|\s*(?:\(|（|\/))/.test(name)),labels.join('；'));
  await assertNoLayoutNames(await page.locator('.screen-list [data-screen-list] strong').allTextContents());
  await assertNoLayoutNames(await page.locator('.screen-card strong').allTextContents());
  await page.locator('.screen-list [data-screen-list]').first().click();await assertNoLayoutNames(await page.locator('.panel-header h2').allTextContents());
  const download=await startReviewDownload(page),md=await readFile(await download.path(),'utf8');
  assert.doesNotMatch(md,/^## .*Layout(?:$|\s*(?:\(|（|\/))/m);assert.doesNotMatch(md,/\|\s*Layout(?:$|\s*(?:\(|（|\/))/);
 } finally {await browser.close();}
});
