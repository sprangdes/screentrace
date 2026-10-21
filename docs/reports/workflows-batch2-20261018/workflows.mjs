/** Real clicks in generated reports. Baseline comes exclusively from source review. */
import {chromium} from '../../../screentrace-capture/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=path.join(root,'analyze/workflows-batch2-20261018');
const resultsDir=process.argv.includes('--after')?path.join(here,'after'):here;await mkdir(resultsDir,{recursive:true});
const baseline=JSON.parse(await readFile(path.join(here,'baseline.json'))),results=[],chains=[],infra=[];
const browser=await chromium.launch({headless:true});
const graphs=new Map(),byCase=new Map(baseline.cases.map(c=>[c.id,c]));
const shots=path.join(out,'screenshots');await mkdir(shots,{recursive:true});
const setEqual=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
const focused=page=>page.locator('.canvas').getAttribute('data-focused');
const getView=(graph,id)=>graph.nodes.find(n=>n.id===id)?.attributes.view??null;
async function ready(page){await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]').waitFor();}
async function focus(page,graph,view){
 const screen=graph.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view===view);if(!screen)throw Error('Source view missing from graph: '+view);
 await page.locator(`.screen-card[data-screen="${screen.id}"]`).dblclick();await ready(page);
 return screen;
}
async function snapshot(page,graph){
 const id=await focused(page),choices=await page.locator('.simulation-choice').evaluateAll(ns=>ns.map(n=>({target:n.dataset.target??null,label:n.innerText})));
 return {focusedId:id,view:getView(graph,id),choices:choices.map(c=>({...c,view:getView(graph,c.target)})),calls:await page.locator('.simulation-calls').allTextContents(),status:await page.locator('.prototype-status').allTextContents()};
}
async function perform(page,graph,c,stamp){
 const r={id:c.id,project:c.project,expectedViews:c.expectedViews,kind:c.kind,result:'FAIL'};
 const frame=page.frameLocator('iframe.preview-frame,iframe').first();
 if(c.inputs){for(const [name,value] of Object.entries(c.inputs))await frame.locator(`[name="${name}"]`).first().fill(value);}
 if(c.prerequisite){const p=byCase.get(c.prerequisite);const prep=await perform(page,graph,p,stamp+'-prerequisite');r.prerequisite=prep;if(prep.result!=='PASS'){r.result='BLOCKED_PREREQUISITE';r.reason=`${p.id} did not restore required UI`;return r;}}
 const control=frame.locator(c.selector).first();
 r.controlCount=await frame.locator(c.selector).count();
 if(!r.controlCount){r.reason='CONTROL_MISSING';await page.screenshot({path:path.join(shots,stamp+'-missing.png')});return r;}
 if(!await control.isVisible()){r.reason='CONTROL_NOT_VISIBLE';return r;}
 let beforeFields;
 r.controlLabel=await control.evaluate(n=>(n.innerText||n.getAttribute('value')||'').trim());
 if(c.kind==='clear'){
  beforeFields={};for(const name of c.fields){const el=frame.locator(`[name="${name}"]`).first();await el.fill('ScreenTrace test');beforeFields[name]=await el.inputValue();}r.beforeFields=beforeFields;
 }
 await page.screenshot({path:path.join(shots,stamp+'-before.png')});
 await control.click({timeout:4000});
 await page.waitForTimeout(150);await ready(page);
 r.actual=await snapshot(page,graph);
 if(c.kind==='navigate'||c.kind==='createRecord'){
  const offered=r.actual.choices.filter(x=>x.view).map(x=>x.view);
  const actual=offered.length?offered:[r.actual.view];
  const unknown=r.actual.status.join('').includes('無法確定');
  r.offeredViews=actual;
  r.result=setEqual(actual,c.expectedViews)&&!unknown?'PASS':'FAIL';
  if(r.result==='PASS'&&offered.length){
   const chosen=c.expectedViews.find(v=>c.choose&&v.endsWith(c.choose))||c.expectedViews[0];
   const choice=r.actual.choices.find(x=>x.view===chosen);
   if(choice){await page.locator(`.simulation-choice[data-target="${choice.target}"]`).first().click();await page.waitForTimeout(100);await ready(page);r.selected=await snapshot(page,graph);if(r.selected.view!==chosen)r.result='FAIL';}
  }
  if(c.kind==='createRecord'){r.recordVisible=await page.frameLocator('iframe.preview-frame,iframe').first().locator('body').innerText();if(!r.recordVisible.includes(c.expectedText))r.result='FAIL';}
 }else if(c.kind==='confirmation'){r.dialogText=await frame.locator('.simulation-modal,[role=dialog]').allTextContents();r.result=r.dialogText.join(' ').includes('Are you sure?')?'PASS':'FAIL';
 }else if(c.kind==='unresolved'){r.result=r.actual.status.join('').includes('無法確定')&&!r.actual.choices.some(x=>x.view)?'PASS':'FAIL';
 }else if(c.kind==='clear'){
  r.afterFields={};for(const name of c.fields)r.afterFields[name]=await frame.locator(`[name="${name}"]`).first().inputValue();
  r.result=Object.values(r.afterFields).every(v=>v==='')?'PASS':'FAIL';
 }else if(c.kind==='reveal'){
  r.revealed=await frame.locator(c.reveal).isVisible();r.result=r.revealed?'PASS':'FAIL';
 }else if(c.kind==='calendar'){
  r.dialogVisible=await frame.locator('.simulation-backdrop,[role="dialog"],input[type="date"]').count()>0;r.result=r.dialogVisible?'PASS':'FAIL';if(r.dialogVisible){await frame.locator('input[type="date"]').fill('2026-10-18');await frame.locator('button:has-text("套用日期")').click();r.selectedDate=await frame.locator('input[name="date"]').inputValue();if(r.selectedDate!=='2026/10/18')r.result='FAIL';}
 }else if(c.kind==='api'){
  const text=[...r.actual.status,...(r.actual.calls||[]),...r.actual.choices.map(x=>x.label)].join(' ');
  r.apiTrace=text.includes(c.expectedRoute)&&text.includes(c.method);r.feedbackRestored=text.includes(c.expectedFeedback);r.result=r.apiTrace&&r.feedbackRestored?'PASS':'FAIL';
  const success=page.locator('.simulation-choice').filter({hasText:c.expectedFeedback}).first();
  if(await success.count()){
   await success.click();r.successFeedback=await frame.locator('.simulation-modal').innerText();if(!r.successFeedback.includes(c.expectedFeedback))r.result='FAIL';
   await frame.locator('.simulation-modal button').click();await control.click();
   const failure=page.locator('.simulation-choice').filter({hasText:c.expectedFailureFeedback}).first();
   if(!await failure.count())r.result='FAIL';else {await failure.click();r.failureFeedback=await frame.locator('.simulation-modal').innerText();if(!r.failureFeedback.includes(c.expectedFailureFeedback))r.result='FAIL';await frame.locator('.simulation-modal button').click();}
  }else r.result='FAIL';
 }else if(c.kind==='print'){
  r.printCalls=await page.evaluate(()=>window.__stPrintCalls);r.result=r.printCalls===1?'PASS':'FAIL';
 }
 await page.screenshot({path:path.join(shots,stamp+'-after.png')});return r;
}
try{
 for(const project of Object.keys(baseline.projects)){
  const report=path.join(out,project,'report/screentrace-report.html');
  const graph=JSON.parse(await readFile(path.join(out,project,'application-graph.json')));graphs.set(project,graph);
  try{await access(report);}catch{for(const c of baseline.cases.filter(c=>c.project===project))results.push({id:c.id,project,result:'BLOCKED_REPORT_GENERATION',reason:'CLI did not produce a report'});infra.push({project,reportGenerated:false});continue;}
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();await page.addInitScript(()=>{window.__stPrintCalls=0;window.print=()=>{window.__stPrintCalls++;};});page.setDefaultTimeout(8000);const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route(/^https?:/,route=>{requests.push(route.request().url());return route.abort();});
  const open=async()=>{await page.goto(pathToFileURL(report).href);await page.locator('#app[data-ready="true"]').waitFor();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');};
  for(const c of baseline.cases.filter(c=>c.project===project)){
   try{await open();await focus(page,graph,c.sourceView);const r=await perform(page,graph,c,c.id);results.push(r);console.log(c.id,r.result,JSON.stringify(r.actual?.status??r.reason));}
   catch(e){results.push({id:c.id,project,result:'FAIL',reason:'CONTROL_OR_PREVIEW_UNUSABLE',error:String(e).slice(0,1500)});await page.screenshot({path:path.join(shots,c.id+'-error.png')}).catch(()=>{});console.log(c.id,'FAIL',String(e).slice(0,100));}
  }
  for(const chain of baseline.chains.filter(c=>c.project===project)){
   const r={...chain,result:'FAIL',stepsExecuted:[]};
   try{
    await open();await focus(page,graph,byCase.get(chain.steps[0]).sourceView);
    for(const id of chain.steps){const c=byCase.get(id);const actualView=getView(graph,await focused(page));if(actualView!==c.sourceView){r.blockedAt=id;r.reason='Previous action did not arrive at next source page';break;}
     const step=await perform(page,graph,c,chain.id+'-'+id);r.stepsExecuted.push(step);if(step.result!=='PASS'){r.blockedAt=id;r.reason=step.result;break;}}
    if(r.stepsExecuted.length===chain.steps.length&&r.stepsExecuted.every(s=>s.result==='PASS'))r.result='PASS';
   }catch(e){r.error=String(e).slice(0,1000);}
   chains.push(r);
  }
  infra.push({project,reportGenerated:true,pageErrors:errors,externalRequests:requests});await context.close();
 }
 for(const chain of baseline.chains.filter(c=>!chains.some(r=>r.id===c.id)))chains.push({...chain,result:'BLOCKED_REPORT_GENERATION',stepsExecuted:[]});
}finally{
 await browser.close();await writeFile(path.join(resultsDir,'ui-results.json'),JSON.stringify({cases:results,chains,infrastructure:infra},null,2));
}
console.log(JSON.stringify({cases:results.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{}),chains:chains.map(r=>({id:r.id,result:r.result,blockedAt:r.blockedAt}))},null,2));
process.exitCode=results.every(r=>r.result==='PASS')&&chains.every(r=>r.result==='PASS')&&infra.every(r=>r.reportGenerated&&r.pageErrors.length===0&&r.externalRequests.length===0)?0:1;
