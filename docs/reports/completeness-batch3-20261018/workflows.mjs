/** Executes generated inert prototypes only. Source JS never evaluated. */
import {chromium} from '../../../screentrace-capture/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=path.join(root,'analyze/completeness-batch3-20261018');
const baseline=JSON.parse(await readFile(path.join(here,'workflow-baseline.json'))),results=[],journeys=[],infra=[];
const shots=path.join(here,'screenshots');await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true});
const frame=p=>p.frameLocator('.focus-layer:not([hidden]):not(.is-leaving) iframe');
const view=(g,id)=>g.nodes.find(n=>n.id===id)?.attributes.view??null;
const equal=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
async function ready(p){await p.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();await p.waitForFunction(()=>!document.querySelector('.focus-layer.is-entering,.focus-layer.is-leaving'));}
async function snap(p,g){return {view:view(g,await p.locator('.canvas').getAttribute('data-focused')),choices:await p.locator('.simulation-choice').evaluateAll(ns=>ns.map(n=>({target:n.dataset.target,label:n.innerText}))).then(cs=>cs.map(c=>({...c,view:view(g,c.target)}))),calls:await p.locator('.simulation-calls').allTextContents(),status:await p.locator('.prototype-status').allTextContents()};}
async function visible(l){if(!await l.count())return false;return l.first().evaluate(n=>{for(let e=n;e;e=e.parentElement){let s=getComputedStyle(e);if(e.hidden||s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}return n.getClientRects().length>0;});}
async function perform(p,g,c,stamp){
 const r={id:c.id,project:c.project,result:'FAIL',expectedViews:c.expectedViews};const f=frame(p);
 // The inert document intentionally removes href/onclick. Locate the same source control through provenance.
 let selector=c.selector;const href=c.selector.match(/a\[href(\*?)="([^"]+)"\]/);
 if(href){const ns=g.nodes.filter(n=>n.type==='COMPONENT'&&n.source?.file===(c.sourceFile??c.sourceView)&&n.attributes.tag==='a'&&(href[1]?n.attributes.href?.includes(href[2]):n.attributes.href===href[2]));if(ns.length>=1)selector=`[data-st-component-id="${ns[0].id}"]`;}
 else if(c.selector==='button[onclick]'&&c.sourceLine)selector=`[data-st-source-file="${c.sourceFile??c.sourceView}"][data-st-source-line="${c.sourceLine}"]`;
 r.effectiveSelector=selector;const el=f.locator(selector).first();r.controlCount=await f.locator(selector).count();
 if(!r.controlCount){r.reason='CONTROL_MISSING';return r;}
 r.visible=await visible(el);if(!r.visible){r.reason='CONTROL_NOT_VISIBLE';return r;}
 if(c.kind==='attribute'){r.actualValue=await el.getAttribute(c.attribute);r.result=r.actualValue===c.value?'PASS':'FAIL';return r;}
 if(c.kind==='options'){r.options=await el.locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));r.result=r.options.filter(o=>o.value).length>=c.minimum?'PASS':'FAIL';return r;}
 const beforeBody=await f.locator('body').innerText();
 if(c.reveal)r.visibleBefore=await visible(f.locator(c.reveal));
 for(const [s,v] of Object.entries(c.inputs??{}))await f.locator(s).first().fill(v);
 for(const [s,v] of Object.entries(c.selects??{}))await f.locator(s).first().selectOption(v);
 if(c.kind==='selectReveal')await el.selectOption(c.value);
 else if(c.event==='keyup')await el.press('x');
 else await el.click({timeout:2500});
 await p.waitForTimeout(100);await ready(p);r.actual=await snap(p,g);
 if(['navigate','record'].includes(c.kind)){
  const offered=r.actual.choices.filter(x=>x.view).map(x=>x.view);r.offeredViews=offered.length?offered:[r.actual.view];
  r.result=equal(r.offeredViews,c.expectedViews)&&!r.actual.status.join('').includes('無法確定')?'PASS':'FAIL';
  if(offered.length&&r.result==='PASS'){const choice=r.actual.choices.find(x=>x.view===(c.choose??c.expectedViews[0]));await p.locator(`.simulation-choice[data-target="${choice.target}"]`).first().click();await ready(p);r.selected=await snap(p,g);}
  if(c.kind==='record'){r.body=await frame(p).locator('body').innerText();r.expectedDataPresent=c.expectedText.every(t=>r.body.includes(t));const tableText=(await frame(p).locator('table').allTextContents()).join('\n');r.tableDataPresent=c.expectedText.every(t=>tableText.includes(t));if(!r.tableDataPresent)r.result='FAIL';}
 }else if(['reveal','selectReveal'].includes(c.kind)){r.visibleAfter=await visible(frame(p).locator(c.reveal));r.result=!r.visibleBefore&&r.visibleAfter?'PASS':'FAIL';}
 else if(c.kind==='feedback'){
  r.branchObservations=[];
  const branchCount=r.actual.choices.length;
  if(r.actual.choices.every(x=>x.view===c.sourceView)&&branchCount){
   for(let i=0;i<branchCount;i++){
    if(i){for(const [s,v] of Object.entries(c.inputs??{}))await frame(p).locator(s).first().fill(v);await frame(p).locator(selector).first().click();await ready(p);}
    await p.locator('.simulation-choice').nth(i).click();await ready(p);
    r.branchObservations.push({index:i,body:await frame(p).locator('body').innerText(),state:await snap(p,g)});
   }
  }
  const body=await frame(p).locator('body').innerText();const text=body+JSON.stringify(r.actual)+JSON.stringify(r.branchObservations);r.expectedFeedbackFound=c.expectedText.map(t=>({text:t,found:text.includes(t)}));r.bodyChanged=body!==beforeBody;r.result=r.expectedFeedbackFound.every(x=>x.found)&&r.bodyChanged?'PASS':'FAIL';}
 else if(c.kind==='request'){r.result=JSON.stringify(r.actual).includes(c.expectedRoute)&&r.actual.calls.length?'PASS':'FAIL';}
 else if(c.kind==='confirmation'){r.dialogs=await frame(p).locator('[role=dialog],.simulation-modal').allTextContents();r.result=r.dialogs.length?'PASS':'FAIL';}
 await p.screenshot({path:path.join(shots,stamp+'.png')});return r;
}
try{
 for(const project of [...new Set(baseline.cases.map(c=>c.project))]){
 const g=JSON.parse(await readFile(path.join(out,project,'application-graph.json')));const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const p=await context.newPage();p.setDefaultTimeout(4500);const errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));await context.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
 async function open(v){await p.goto(pathToFileURL(path.join(out,project,'report/screentrace-report.html')).href);await p.locator('#app[data-ready="true"]').waitFor();await p.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');const n=g.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view===v);if(!n)throw Error('Missing screen '+v);await p.locator(`.screen-card[data-screen="${n.id}"]`).dblclick();await ready(p);}
 for(const c of baseline.cases.filter(c=>c.project===project)){
  let r;try{await open(c.sourceView);r=await perform(p,g,c,c.id);}catch(e){r={id:c.id,project,result:'FAIL',reason:'CONTROL_OR_PREVIEW_UNUSABLE',error:String(e).slice(0,800)};}
  if(r.result!=='PASS')await p.screenshot({path:path.join(shots,c.id+'.png')}).catch(()=>{});results.push(r);console.log(c.id,r.result,r.reason??JSON.stringify(r.actual?.status??r.actualValue??r.options??''));
 }
 for(const chain of baseline.chains.filter(c=>c.project===project)){
  const r={...chain,result:'FAIL',stepsExecuted:[]};try{const first=baseline.cases.find(c=>c.id===chain.steps[0]);await open(first.sourceView);for(const id of chain.steps){const c=baseline.cases.find(c=>c.id===id);if((await snap(p,g)).view!==c.sourceView){r.blockedAt=id;r.reason='PREVIOUS_STEP_DID_NOT_REACH_SOURCE';break;}const step=await perform(p,g,c,chain.id+'-'+id);r.stepsExecuted.push(step);if(step.result!=='PASS'){r.blockedAt=id;break;}}if(r.stepsExecuted.length===chain.steps.length&&r.stepsExecuted.every(s=>s.result==='PASS'))r.result='PASS';}catch(e){r.error=String(e).slice(0,800);}journeys.push(r);console.log(chain.id,r.result,r.blockedAt??'');}
 infra.push({project,pageErrors:errors,externalRequests:requests});await context.close();
 }
}finally{await browser.close();await writeFile(path.join(here,'ui-results.json'),JSON.stringify({cases:results,journeys,infrastructure:infra},null,2)+'\n');}
console.log(JSON.stringify({cases:results.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{}),journeys:journeys.map(j=>({id:j.id,result:j.result,blockedAt:j.blockedAt}))}));
process.exitCode=results.every(r=>r.result==='PASS')?0:1;
