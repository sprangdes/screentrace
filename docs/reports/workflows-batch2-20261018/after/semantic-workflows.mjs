/** Additional acceptance: cancellation, real demo CRUD and session isolation. */
import {chromium} from '../../../../screentrace-capture/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),out=path.join(root,'analyze/workflows-batch2-20261018');
await fs.mkdir(path.join(here,'images'),{recursive:true});const browser=await chromium.launch(),results=[],errors=[],requests=[];
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(String(e)));
const frame=()=>page.frameLocator('.focus-layer:not([hidden]):not(.is-leaving) iframe');const ready=async()=>{await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();await page.waitForFunction(()=>!document.querySelector('.focus-layer.is-entering,.focus-layer.is-leaving'));};
let graph;
async function open(project,view){graph=JSON.parse(await fs.readFile(path.join(out,project,'application-graph.json')));await page.goto(pathToFileURL(path.join(out,project,'report/screentrace-report.html')).href);await page.locator('#app[data-ready="true"]').waitFor();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');const screen=graph.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view.endsWith(view));assert.ok(screen);await page.locator(`.screen-card[data-screen="${screen.id}"]`).dblclick();await ready();}
async function click(selector){await frame().locator(selector).click();await ready();}
async function check(id,fn){try{await fn();results.push({id,result:'PASS'});}catch(e){results.push({id,result:'FAIL',error:String(e),stack:e.stack});await page.screenshot({path:path.join(here,'images',id+'-failure.png')});}}
try{
 await check('CONFIRM-CANCEL-ACCEPT',async()=>{
  await open('struts1_CRUD_ProductManagement','/home.jsp');let navigations=0;const listener=()=>navigations++;page.on('framenavigated',listener);
  await click('a:text-is("Delete")');await frame().locator('.simulation-modal').waitFor();assert.match(await frame().locator('.simulation-modal').innerText(),/Are you sure\?/);assert.equal(await page.locator('.simulation-choice').count(),0);
  const before=navigations;await frame().locator('.simulation-confirm-cancel').click();await frame().locator('.simulation-modal').waitFor({state:'detached'});assert.equal(navigations,before);assert.equal(await page.locator('.simulation-choice').count(),0);
  await click('a:text-is("Delete")');await frame().locator('.simulation-confirm-accept').click();await frame().locator('.simulation-modal').waitFor({state:'detached'});await ready();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.focused);
  // The successful continuation reopens the source-proven destination; cancellation above did not.
  assert.ok(navigations>before);page.off('framenavigated',listener);await page.screenshot({path:path.join(here,'images/confirm-accepted.png')});
 });
 await check('CREATE-EDIT-DELETE-STATE',async()=>{
  await open('Employee-Management-System','/employee-list.jsp');const seedName=(await frame().locator('tr[data-st-demo-key="1"] td').nth(1).innerText()).trim();await click('a:has-text("Add Employee")');
  await frame().locator('[name=name]').fill('Demo Created 73');await frame().locator('[name=email]').fill('created73@example.test');await frame().locator('[name=department]').fill('Quality');await click('button:has-text("Save Employee")');
  let row=frame().locator('tr').filter({hasText:'Demo Created 73'});await row.waitFor();assert.equal(await row.evaluate(n=>{for(let p=n;p;p=p.parentElement)if(getComputedStyle(p).opacity==='0'||getComputedStyle(p).visibility==='hidden')return false;return true;}),true);assert.match(await row.innerText(),/created73@example.test/);assert.match(await row.innerText(),/Quality/);await page.screenshot({path:path.join(here,'images/data-created.png')});
  await frame().locator('tr[data-st-demo-key="1"] a:has-text("Update")').click();await ready();assert.equal(await frame().locator('[name=id]').inputValue(),'1');assert.equal(await frame().locator('[name=name]').inputValue(),seedName);await click('a:has-text("Back to Employee List")');
  await row.locator('a:has-text("Update")').click();await ready();assert.equal(await frame().locator('[name=name]').inputValue(),'Demo Created 73');assert.equal(await frame().locator('[name=email]').inputValue(),'created73@example.test');assert.equal(await frame().locator('[name=id]').inputValue(),'2');
  await frame().locator('[name=name]').fill('Demo Updated 73');await frame().locator('[name=department]').fill('Support');await click('button:has-text("Update Employee")');
  row=frame().locator('tr').filter({hasText:'Demo Updated 73'});await row.waitFor();assert.match(await row.innerText(),/Support/);assert.equal(await frame().locator('tr').filter({hasText:'Demo Created 73'}).count(),0);await page.screenshot({path:path.join(here,'images/data-updated.png')});
  await row.locator('a:has-text("Delete")').click();await ready();assert.equal(await frame().locator('tr').filter({hasText:'Demo Updated 73'}).count(),0);assert.equal(await frame().locator('tr[data-st-demo-key]').count(),1);await page.screenshot({path:path.join(here,'images/data-deleted.png')});
  await click('a:has-text("Add Employee")');await click('a:has-text("Back to Employee List")');assert.equal(await frame().locator('tr[data-st-demo-key]').count(),1);
  await click('a:has-text("Add Employee")');await frame().locator('[name=name]').fill('Session only');await frame().locator('[name=email]').fill('session@example.test');await frame().locator('[name=department]').fill('QA');await click('button:has-text("Save Employee")');await frame().locator('tr').filter({hasText:'Session only'}).waitFor();
  await open('Employee-Management-System','/employee-list.jsp');assert.equal(await frame().locator('tr[data-st-demo-key]').count(),1);assert.equal(await frame().locator('tr').filter({hasText:'Session only'}).count(),0);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}finally{await browser.close();await fs.writeFile(path.join(here,'semantic-results.json'),JSON.stringify({results,pageErrors:errors,externalRequests:requests},null,2));}
console.log(JSON.stringify(results));process.exitCode=results.every(r=>r.result==='PASS')&&errors.length===0&&requests.length===0?0:1;
