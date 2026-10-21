import {chromium} from '/Users/machi/IntelliJ/screentrace/screentrace-capture/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='/private/tmp/screentrace-public-20261018';
const names=['mailreader','cookbook','spring-mvc-jsp-petclinic','spring-boot-todo-jsp','spring-boot-realworld-example-app'];
const browser=await chromium.launch({headless:true});const results=[];
try { for(const name of names){
 const graph=JSON.parse(await readFile(`${base}/output/${name}/application-graph.json`));
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
 await page.goto(`file://${base}/output/${name}/report/screentrace-report.html`);
 await page.locator('#app[data-ready="true"]').waitFor();
 assert.deepEqual(await page.locator('.page-tab').allInnerTexts(),['畫面','API']);
 const cards=await page.locator('.screen-card').count();assert.equal(cards,graph.nodes.filter(n=>n.type==='SCREEN').length);
 if(cards){await page.locator('.screen-card').first().dblclick();await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();await page.screenshot({path:`${base}/${name}-screen.png`});}
 await page.locator('.page-tab[data-page="api"]').click();
 await page.locator('[data-api-filter]').filter({hasText:/^全部/}).click();
 const apis=await page.locator('.api-row').count();const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 const leadsToScreen=(id,seen=new Set())=>{if(seen.has(id))return false;seen.add(id);return nodes.get(id)?.type==='SCREEN'||graph.relationships.filter(e=>e.from===id&&['HANDLED_BY','RENDERS','FORWARDS_TO','REDIRECTS_TO','NAVIGATES_TO'].includes(e.type)).some(e=>leadsToScreen(e.to,seen));};
 const expectedApis=graph.nodes.filter(n=>n.type==='ENDPOINT'&&n.attributes.origin!=='javascript-request'&&n.attributes.category!=='MVC_SCREEN'&&!(n.attributes.category==='ACTION'&&leadsToScreen(n.id))).length;
 assert.equal(apis,expectedApis);
 if(apis){await page.locator('.api-row').first().click();await page.locator('.api-detail').waitFor();}
 await page.screenshot({path:`${base}/${name}-api.png`});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 results.push({project:name,cards,apis,pageErrors:errors,externalRequests:requests,result:'PASS'});
 await context.close();
 }}finally{await browser.close();await writeFile(`${base}/ui-smoke.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
