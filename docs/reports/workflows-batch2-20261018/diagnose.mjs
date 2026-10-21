import {chromium} from '../../../screentrace-capture/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(here,'../../../analyze/workflows-batch2-20261018/ShoppingCart');
const graph=JSON.parse(await fs.readFile(path.join(out,'application-graph.json'))),preview=JSON.parse(await fs.readFile(path.join(out,'preview-model.json')));
const screen=graph.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view.endsWith('/home.jsp'));
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await page.goto(pathToFileURL(path.join(out,'report/screentrace-report.html')).href);await page.locator('#app[data-ready="true"]').waitFor();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');await page.locator(`.screen-card[data-screen="${screen.id}"]`).dblclick();await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();
const actual=await page.frameLocator('iframe').first().locator('a:has-text("Catalog")').evaluate(n=>({html:n.outerHTML,ancestors:[...function*(e){while(e){yield e.tagName;e=e.parentElement;}}(n)]}));
const recorded=preview.elements.filter(e=>e.graphScreenId===screen.id&&e.tag==='a'&&e.text==='Catalog');
const selector=recorded[0].path.split('>').map(part=>part.replace(/^([\w-]+)\[(\d+)\]$/,'$1:nth-of-type($2)')).join('>');
const selectorCheck=await page.frameLocator('iframe').first().locator('a:has-text("Catalog")').evaluate((n,selector)=>{try{return {selector,matches:n.matches(selector)}}catch(e){return {selector,error:String(e)}}},selector);
await fs.writeFile(path.join(here,'mapping-diagnostic.json'),JSON.stringify({actual,recorded,selectorCheck},null,2));console.log(JSON.stringify(actual));
}finally{await browser.close();}
