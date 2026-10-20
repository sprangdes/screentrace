/** Executes only the trusted viewer; source HTML stays in a sandbox without allow-scripts. */
import {chromium} from '../../../screentrace-capture/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const h=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(h,'../../..'),out=process.env.ST_BATCH6_OUTPUT||path.join(root,'analyze/completeness-batch6-20261020'),baseline=JSON.parse(await readFile(path.join(h,process.env.ST_BATCH6_BASELINE||(process.env.ST_BATCH6_SUPPLEMENTARY?'supplementary-baseline.json':'workflow-baseline.json')))),cases=[],journeys=[],infrastructure=[];
const resultsDir=process.env.ST_BATCH6_RESULTS||h;await mkdir(path.join(resultsDir,'screenshots'),{recursive:true});const browser=await chromium.launch();let context,page,graph,report;
const frame=()=>page.frameLocator('.focus-layer:not([hidden]):not(.is-leaving) iframe'),view=id=>graph.nodes.find(n=>n.id===id)?.attributes?.view;
async function settle(){await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy=false]').waitFor();await page.waitForFunction(()=>!document.querySelector('.focus-layer.is-entering,.focus-layer.is-leaving'));}
async function snapshot(){return {id:await page.locator('.canvas').getAttribute('data-focused'),focused:view(await page.locator('.canvas').getAttribute('data-focused')),choices:await page.locator('.simulation-choice').evaluateAll(ns=>ns.map(n=>({id:n.dataset.target||null,label:n.innerText}))).then(rows=>rows.map(r=>({...r,view:view(r.id)}))),status:(await page.locator('.prototype-status').allTextContents()).join(' ')};}
async function focus(source,reset=true){if(reset){await page.goto(report);await page.locator('#app[data-ready=true]').waitFor();await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');}const node=graph.nodes.find(n=>n.type==='SCREEN'&&n.attributes.view===source);if(!node)throw Error('SOURCE_SCREEN_NOT_AVAILABLE');await page.locator(`.screen-card[data-screen="${node.id}"]`).dblclick();await settle();}
async function selector(raw){
 if(await frame().locator(raw).count())return raw;
 // Re-identify only the exact source href. Physical DOM presence selects the control;
 // graph ownership and destinations are still checked by the viewer, never by this locator.
 const a=raw.match(/^(.*?)(a|form)\[(href|action|th\\:href)([$^*]?)=["'](.+?)["']\](.*)$/);if(!a)return raw;
 const prefix=a[1],tag=a[2],key=a[3].replace('\\:',':'),op=a[4],value=a[5],suffix=a[6],matches=[];
 for(const n of graph.nodes)if(n.type==='COMPONENT'&&n.attributes.tag===tag&&typeof n.attributes[key]==='string'&&(op==='^'?n.attributes[key].startsWith(value):op==='$'?n.attributes[key].endsWith(value):op==='*'?n.attributes[key].includes(value):n.attributes[key]===value)){
  const candidate=prefix+'[data-st-component-id="'+n.id+'"]'+suffix;if(await frame().locator(candidate).count())matches.push(candidate);
 }
 // This union restores the source selector's DOM order and .first() semantics, not a destination guess.
 return matches.length?matches.join(','):raw;
}
async function navigateTo(expected){let snap=await snapshot();const choice=snap.choices.find(c=>c.view===expected);if(choice){await page.locator(`.simulation-choice[data-target="${choice.id}"]`).first().click();await settle();return {selectedCandidate:true,snapshot:await snapshot()};}return {selectedCandidate:false,snapshot:snap};}
async function perform(c,label=c.id){const r={...c,result:'FAIL'};try{
 r.before=await snapshot();const f=frame();
 if(c.kind==='dataJourney'){
  r.steps=[];for(const id of c.steps){const step=[...baseline.cases,...(baseline.references||[])].find(x=>x.id===id);if((await snapshot()).focused!==step.sourceView){r.error='PREVIOUS_STEP_DID_NOT_REACH_SOURCE';break;}const done=await perform(step,label+'-'+id);r.steps.push(done);if(done.result!=='PASS')break;}
  r.actualText=await frame().locator('body').innerText();r.missing=c.expectedText.filter(t=>!r.actualText.includes(t));r.result=r.steps.length===c.steps.length&&r.steps.every(s=>s.result==='PASS')&&!r.missing.length?'PASS':'FAIL';
 }else if(c.kind==='inputValue'){r.actualValue=await f.locator(c.selector).inputValue();r.result=r.actualValue===c.expectedValue?'PASS':'FAIL';}
 else if(c.kind==='text'){r.actualText=await f.locator(c.selector).innerText();r.missing=c.expectedText.filter(t=>!r.actualText.includes(t));r.result=r.missing.length?'FAIL':'PASS';}
 else{
  if(c.openSelector)await f.locator(c.openSelector).click();
  for(const [s,v]of Object.entries(c.fill||{}))await f.locator(s).fill(v);
  for(const [s,v]of Object.entries(c.select||{}))await f.locator(s).selectOption(v);
  for(const [s,index]of Object.entries(c.selectIndex||{}))await f.locator(s).selectOption({index});
  if(c.fileSelector)await f.locator(c.fileSelector).setInputFiles({name:'trace.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5RAAAAAASUVORK5CYII=','base64')});
  for(const s of c.check||[])await f.locator(s).first().check();for(const s of c.uncheck||[])await f.locator(s).first().uncheck();
  r.effectiveSelector=await selector(c.selector);const control=f.locator(r.effectiveSelector).first();
  if(c.kind==='inputValueAfterClick'){await control.click();r.actualValue=await f.locator(c.valueSelector).inputValue();r.result=r.actualValue===c.expectedValue?'PASS':'FAIL';}
  else if(c.kind==='apiChange'){r.after=await snapshot();r.result=(r.after.status+' '+r.after.choices.map(x=>x.label).join(' ')).includes(c.expectedPath)?'PASS':'FAIL';}
  else if(c.kind==='toggle'){r.initialClasses=await Promise.all(c.targetSelectors.map(s=>f.locator(s).getAttribute('class')));await control.click();r.openClasses=await Promise.all(c.targetSelectors.map(s=>f.locator(s).getAttribute('class')));await control.click();r.closedClasses=await Promise.all(c.targetSelectors.map(s=>f.locator(s).getAttribute('class')));r.result=r.initialClasses.every((s,i)=>!s.split(/\s/).includes(c.className)&&r.openClasses[i].split(/\s/).includes(c.className)&&r.closedClasses[i]===s)?'PASS':'FAIL';}
  else if(c.kind==='toggleVisible'){r.initialVisible=await f.locator(c.targetSelector).isVisible();await control.click();r.openVisible=await f.locator(c.targetSelector).isVisible();await control.click();r.closedVisible=await f.locator(c.targetSelector).isVisible();r.result=!r.initialVisible&&r.openVisible&&!r.closedVisible?'PASS':'FAIL';}
  else{
   const beforeBody=await f.locator('body').innerText();await page.evaluate(()=>{window.__stBeforeDocument=document.querySelector('.focus-layer:not([hidden]):not(.is-leaving) iframe')?.contentDocument;});await control.click();await settle();
   if(c.kind==='confirmCancel'){const modal=f.locator('.simulation-modal');await modal.waitFor();r.confirmText=await modal.innerText();await modal.locator('.simulation-confirm-cancel').click();r.after=await snapshot();r.bodyUnchanged=beforeBody===await f.locator('body').innerText();r.result=r.confirmText.includes(c.expectedMessage)&&r.after.focused===r.before.focused&&r.bodyUnchanged?'PASS':'FAIL';}
   else if(c.kind==='dialog'){r.dialogText=(await f.locator('.simulation-modal').allTextContents()).join(' ');r.result=r.dialogText.includes(c.expectedMessage)?'PASS':'FAIL';}
   else if(c.kind==='choices'){r.after=await snapshot();r.actualViews=[...new Set(r.after.choices.map(x=>x.view).filter(Boolean))].sort();r.result=JSON.stringify(r.actualViews)===JSON.stringify([...c.expectedViews].sort())?'PASS':'FAIL';}
   else{if(c.kind==='navigateConfirm')await f.locator('.simulation-confirm-accept').click();const nav=await navigateTo(c.expectedView);r.selectedCandidate=nav.selectedCandidate;r.after=nav.snapshot;if(c.expectedView===r.before.focused){try{await page.waitForFunction(()=>document.querySelector('.focus-layer:not([hidden]):not(.is-leaving) iframe')?.contentDocument!==window.__stBeforeDocument,{},{timeout:700});r.documentReplaced=true;}catch{r.documentReplaced=false;}}if(c.kind==='feedback'){r.actualText=await frame().locator('body').innerText();r.missing=c.expectedText.filter(t=>!r.actualText.includes(t));}r.result=r.after.focused===c.expectedView&&(c.expectedView!==r.before.focused||r.documentReplaced)&&(!c.expectedNotice||r.after.status.includes(c.expectedNotice))&&(!r.missing||!r.missing.length)?'PASS':'FAIL';}
  }
 }
 }catch(error){r.error=String(error).slice(0,2000);}try{await page.screenshot({path:path.join(resultsDir,'screenshots',label+'.png')});}catch{}console.log(label,r.result,r.error?.slice(0,100)||'');return r;}
try{
 for(const project of [...new Set(baseline.cases.map(c=>c.project))]){
  await context?.close();graph=JSON.parse(await readFile(path.join(out,project,'application-graph.json')));report=pathToFileURL(path.join(out,project,'report/screentrace-report.html')).href;
  context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(3500);const meta={project,pageErrors:[],externalRequests:[],graphSha256:createHash('sha256').update(await readFile(path.join(out,project,'application-graph.json'))).digest('hex'),reportSha256:createHash('sha256').update(await readFile(path.join(out,project,'report/screentrace-report.html'))).digest('hex')};infrastructure.push(meta);page.on('pageerror',e=>meta.pageErrors.push(e.message));await context.route(/^https?:/,r=>{meta.externalRequests.push(r.request().url());return r.abort();});
  for(const c of baseline.cases.filter(c=>c.project===project)){try{await focus(c.sourceView);cases.push(await perform(c));}catch(error){cases.push({...c,result:'FAIL',error:String(error)});}}
  const chains=baseline.journeys?baseline.journeys.filter(j=>j.project===project).map(j=>[j.id,j.steps]):process.env.ST_BATCH6_SUPPLEMENTARY?[['SJ2',['X01','S04','X02']]]:project==='Materials-Program-Management'?[['MJ1',['M03','M07']]]:project==='Student-Management-system'?[['SJ1',['S01','S04','S02']]]:[['EJ1',['E04','E05','E06']]];
  for(const [id,steps]of chains){const result={id,project,steps,result:'FAIL',executed:[]};try{await focus([...baseline.cases,...(baseline.references||[])].find(c=>c.id===steps[0]).sourceView);for(const step of steps){const c=[...baseline.cases,...(baseline.references||[])].find(c=>c.id===step);if((await snapshot()).focused!==c.sourceView){result.blockedAt=step;break;}const r=await perform(c,id+'-'+step);result.executed.push(r);if(r.result!=='PASS'){result.blockedAt=step;break;}}if(result.executed.length===steps.length&&result.executed.every(r=>r.result==='PASS'))result.result='PASS';}catch(error){result.error=String(error);}journeys.push(result);}
  meta.sandbox=await page.locator('.focus-layer:not([hidden]):not(.is-leaving) iframe').getAttribute('sandbox');
 }
}finally{await browser.close();await writeFile(path.join(resultsDir,process.env.ST_BATCH6_UI_RESULT||'ui-results.json'),JSON.stringify({cases,journeys,infrastructure},null,2)+'\n');}
console.log('CASES',cases.reduce((a,c)=>(a[c.result]=(a[c.result]||0)+1,a),{}),'JOURNEYS',journeys.map(j=>[j.id,j.result]));process.exitCode=cases.every(c=>c.result==='PASS')?0:1;
