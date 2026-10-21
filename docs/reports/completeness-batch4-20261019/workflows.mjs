import {createHash} from 'node:crypto';
/** Source-derived assertions against generated inert reports. Never evaluates target code. */
import {chromium} from '../../../screentrace-capture/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const h=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(h,'../../..'),out=process.env.ST_BATCH4_OUTPUT||path.join(root,'analyze/completeness-batch4-20261019'),baseline=JSON.parse(await readFile(path.join(h,'workflow-baseline.json'))),cases=[],journeys=[],infrastructure=[];
const resultsDir=process.env.ST_BATCH4_RESULTS||h;
const browser=await chromium.launch({headless:true});let page,context,graph,report,meta;
const key=n=>n?.attributes?.tilesDefinitionName?'tile:'+n.attributes.tilesDefinitionName:n?.attributes?.view?'file:'+n.attributes.view:null;
const node=id=>graph.nodes.find(n=>n.id===id),frame=()=>page.frameLocator('.focus-layer:not([hidden]):not(.is-leaving) iframe');
const equal=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
async function ready(){await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy=false]').waitFor();await page.waitForFunction(()=>!document.querySelector('.focus-layer.is-entering,.focus-layer.is-leaving'));}
async function snapshot(){const id=await page.locator('.canvas').getAttribute('data-focused');return {focused:key(node(id)),id,choices:await page.locator('.simulation-choice').evaluateAll(ns=>ns.map(n=>({id:n.dataset.target??null,label:n.innerText}))).then(items=>items.map(i=>({...i,key:key(node(i.id))}))),status:(await page.locator('.prototype-status').allTextContents()).join(' ')};}
async function project(name){await context?.close();graph=JSON.parse(await readFile(path.join(out,name,'application-graph.json')));report=pathToFileURL(path.join(out,name,'report/screentrace-report.html')).href;context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(5000);meta={project:name,pageErrors:[],externalRequests:[],graphSha256:createHash('sha256').update(await readFile(path.join(out,name,'application-graph.json'))).digest('hex'),reportSha256:createHash('sha256').update(await readFile(path.join(out,name,'report/screentrace-report.html'))).digest('hex')};infrastructure.push(meta);page.on('pageerror',e=>meta.pageErrors.push(e.message));await context.route(/^https?:/,route=>{meta.externalRequests.push(route.request().url());return route.abort();});}
async function focus(view){await page.goto(report);await page.locator('#app[data-ready=true]').waitFor();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');const n=graph.nodes.find(n=>n.type==='SCREEN'&&key(n)===view);if(!n)throw Error('SOURCE_SCREEN_MISSING: '+view);await page.locator(`.screen-card[data-screen="${n.id}"]`).dblclick();await ready();}
// Offline packing removes executable URL/event attributes. Keep assertions, locate by source identity.
async function effectiveSelector(c){
 const current=(await snapshot()).id,owned=new Set(graph.relationships.filter(e=>e.type==='CONTAINS'&&e.from===current).map(e=>e.to));
 const file=c.sourceView.startsWith('file:')?c.sourceView.slice(5):c.sourceFile;
 const candidates=graph.nodes.filter(n=>n.type==='COMPONENT'&&n.source?.file===file),prefer=ns=>ns.filter(n=>owned.has(n.id)).length?ns.filter(n=>owned.has(n.id)):ns;
 const a=c.selector.match(/^a\[href(\*?)=["']([^"']+)["']\](.*)$/);
 if(a){const matches=prefer(candidates.filter(n=>n.attributes.tag==='a'&&['href','target'].some(k=>a[1]?n.attributes[k]?.includes(a[2]):n.attributes[k]===a[2])));if(matches.length)return `[data-st-component-id="${matches[0].id}"]${a[3]}`;}
 const form=c.selector.match(/^form\[action=["']?([^\]"']+)["']?\](.*)$/);
 if(form){const matches=prefer(candidates.filter(n=>n.attributes.kind==='FORM'&&['action','target'].some(k=>n.attributes[k]===form[1])));if(matches.length)return `[data-st-component-id="${matches[0].id}"]${form[2]}`;}
 if(c.selector==='a[onclick]'){const matches=prefer(candidates.filter(n=>n.attributes.tag==='a'&&n.attributes.onclick));if(matches.length)return `[data-st-component-id="${matches[0].id}"]`;}
 return c.selector;
}
async function perform(c,stamp){const result={id:c.id,project:c.project,result:'FAIL',sourceView:c.sourceView,expectedTargets:c.expectedTargets,source:{file:c.sourceFile,line:c.sourceLine,excerpt:c.sourceExcerpt}},errors=[];try{
 const f=frame();result.effectiveSelector=await effectiveSelector(c);const control=f.locator(result.effectiveSelector).first();if(c.kind!=='initialHidden'&&!await control.count())throw Error('CONTROL_MISSING: '+c.selector);if(c.kind!=='initialHidden'&&!await control.isVisible())throw Error('CONTROL_NOT_VISIBLE: '+c.selector);
 result.before=await snapshot();for(const [selector,value]of Object.entries(c.inputs||{}))await f.locator(selector).first().fill(value);
 if(c.kind==='attribute'){result.actualValue=await control.getAttribute(c.attribute);if(result.actualValue!==c.expectedValue)errors.push('ATTRIBUTE_MISMATCH');}
 else if(c.kind==='initialHidden'){result.visible=await control.count()?await control.isVisible():false;if(result.visible)errors.push('SOURCE_CONDITION_NOT_APPLIED');}
 else if(c.kind==='requests'){
  const formNodes=graph.nodes.filter(n=>n.type==='COMPONENT'&&n.source?.file===c.sourceFile&&n.attributes?.kind==='FORM'),ids=new Set(formNodes.map(n=>n.id));
  const targets=new Set(graph.relationships.filter(e=>ids.has(e.from)&&['TRIGGERS','CALLS'].includes(e.type)).map(e=>e.to));for(const b of graph.behaviors||[])if(ids.has(b.triggerId)&&b.targetId)targets.add(b.targetId);
  result.actualRequests=graph.nodes.filter(n=>targets.has(n.id)&&n.type==='ENDPOINT').map(n=>n.attributes.path);if(!equal(result.actualRequests,c.expectedRequests))errors.push('FORM_REQUEST_BRANCHES_INCOMPLETE');
 }
 else if(c.kind==='keypress'){await control.fill('');await control.pressSequentially(c.typed);result.actualValue=await control.inputValue();if(result.actualValue!==c.expectedValue)errors.push('SOURCE_KEYPRESS_VALIDATION_NOT_REPLAYED');}
 else if(c.kind==='toggleClass'){const body=f.locator(c.target),before=(await body.getAttribute('class')||'').split(/\s+/).includes(c.className);await control.click();const after=(await body.getAttribute('class')||'').split(/\s+/).includes(c.className);result.classBefore=before;result.classAfter=after;if(before===after)errors.push('CLASS_NOT_TOGGLED');}
 else if(c.kind==='dropdown'){await control.click();result.expanded=await control.getAttribute('aria-expanded');result.menuShown=(await f.locator(c.target).getAttribute('class')||'').split(/\s+/).includes('show');if(result.expanded!=='true'||!result.menuShown)errors.push('DROPDOWN_NOT_OPEN');await control.click();result.closed=!(await f.locator(c.target).getAttribute('class')||'').split(/\s+/).includes('show');if(!result.closed)errors.push('DROPDOWN_NOT_CLOSED');}
 else if(c.kind==='cancelConfirm'){const before=await f.locator('table').innerText();await control.click();const modal=f.locator('.simulation-modal');if(!await modal.count())throw Error('CONFIRMATION_NOT_OPEN');result.confirmText=await modal.innerText();await modal.locator('button').first().click();if((await snapshot()).focused!==result.before.focused||(await f.locator('table').innerText())!==before)errors.push('CANCEL_CHANGED_PAGE_OR_ROWS');}
 else{
  await control.click();await ready();result.afterClick=await snapshot();const choices=result.afterClick.choices;result.actualTargets=choices.length?choices.map(x=>x.key||'UNRESOLVED'):result.afterClick.focused!==result.before.focused?[result.afterClick.focused]:/無法|不支援|未知/.test(result.afterClick.status)?[]:[result.afterClick.focused];
  if(!equal(result.actualTargets,c.expectedTargets))errors.push('DESTINATION_SET_MISMATCH');
  const chosen=c.choose??(c.expectedTargets.length===1?c.expectedTargets[0]:null);if(chosen){const choice=choices.find(x=>x.key===chosen);if(choice){await page.locator(`.simulation-choice[data-target="${choice.id}"]`).first().click();await ready();}else if((await snapshot()).focused!==chosen)errors.push('EXPECTED_BRANCH_NOT_REACHABLE');}
  if(c.kind==='record'){const tables=f.locator('table'),text=await (await tables.count()?tables.first():f.locator('main').count().then(n=>n?f.locator('main').first():f.locator('body')));result.renderedText=(await text.innerText()).slice(0,5000);result.missingText=c.expectedText.filter(t=>!result.renderedText.includes(t));if(result.missingText.length)errors.push('SUBMITTED_VALUES_NOT_RENDERED');}
 }
 result.after=await snapshot();if(!errors.length)result.result='PASS';else result.errors=errors;
 }catch(e){result.error=String(e).slice(0,1600);try{result.after=await snapshot();}catch{}}
 await page.screenshot({path:path.join(resultsDir,'screenshots',stamp+'.png')}).catch(()=>{});console.log(stamp,result.result,(result.errors??[result.error??'']).join(','));return result;}
await mkdir(path.join(resultsDir,'screenshots'),{recursive:true});
try{for(const name of [...new Set(baseline.cases.map(c=>c.project))]){await project(name);
 for(const c of baseline.cases.filter(c=>c.project===name)){try{await focus(c.sourceView);cases.push(await perform(c,c.id));}catch(e){cases.push({id:c.id,project:name,result:'BLOCKED',error:String(e).slice(0,1200)});}}
 for(const chain of baseline.journeys.filter(c=>c.project===name)){const r={...chain,result:'FAIL',stepsExecuted:[]};try{await focus(baseline.cases.find(c=>c.id===chain.steps[0]).sourceView);for(const id of chain.steps){const c=baseline.cases.find(c=>c.id===id);if((await snapshot()).focused!==c.sourceView){r.blockedAt=id;r.error='PREVIOUS_STEP_DID_NOT_REACH_SOURCE';break;}const step=await perform(c,chain.id+'-'+id);r.stepsExecuted.push(step);if(step.result!=='PASS'){r.blockedAt=id;break;}}if(r.stepsExecuted.length===chain.steps.length&&r.stepsExecuted.every(s=>s.result==='PASS'))r.result='PASS';}catch(e){r.error=String(e).slice(0,1200);}journeys.push(r);console.log(chain.id,r.result,r.blockedAt??'');}
 }}finally{await context?.close();await browser.close();await writeFile(path.join(resultsDir,'ui-results.json'),JSON.stringify({cases,journeys,infrastructure},null,2)+'\n');}
console.log(JSON.stringify({cases:cases.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{}),journeys:journeys.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{})}));process.exitCode=cases.every(r=>r.result==='PASS')&&journeys.every(r=>r.result==='PASS')&&infrastructure.every(m=>!m.pageErrors.length&&!m.externalRequests.length)?0:1;
