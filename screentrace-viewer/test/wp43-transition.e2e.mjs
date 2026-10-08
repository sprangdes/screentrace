import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture,fileFixture,node} from './fixture.mjs';

function navigationFixture(){
 const data=fixture();
 data.graph.nodes.find(item=>item.id==='shared').attributes.kind='LINK';
 data.graph.nodes.push(node('c','SCREEN','丙',{route:'/final'}),node('to-b','COMPONENT','前往乙',{kind:'LINK'}),node('to-c','COMPONENT','前往丙',{kind:'LINK'}));
 data.graph.relationships.push({id:'contains-to-b',type:'CONTAINS',from:'a',to:'to-b'},{id:'contains-to-c',type:'CONTAINS',from:'a',to:'to-c'});
 const evidence=[{source:{file:'web/a.jsp',line:1},parser:'Fixture',resolution:'CONFIRMED'}];
 data.graph.behaviors=[{id:'nav-b',type:'NAVIGATE',triggerId:'to-b',targetId:'b',event:'click',evidence},{id:'nav-c',type:'NAVIGATE',triggerId:'to-c',targetId:'c',event:'click',evidence}];
 data.graph.relationships.push({id:'nav-rel-b',type:'NAVIGATES_TO',from:'to-b',to:'b',confidence:'CONFIRMED',evidence},{id:'nav-rel-c',type:'NAVIGATES_TO',from:'to-c',to:'c',confidence:'CONFIRMED',evidence});
 data.documents.a='<html><body><h1>甲</h1><a id="to-b" href="/b">前往乙</a><a id="to-c" href="/c">前往丙</a></body></html>';
 data.documents.b='<html><body><h1>乙</h1></body></html>';data.documents.c='<html><body><h1>丙</h1></body></html>';
 data.preview.screens.push({graphScreenId:'c',width:1280,height:900});
 data.preview.elements=[['to-b','a:nth-of-type(1)'],['to-c','a:nth-of-type(2)']].map(([id,path])=>({graphScreenId:'a',path:`html:nth-of-type(1)>body:nth-of-type(1)>${path}`,tag:'a',graphComponentId:id,graphComponentCandidates:[id],componentResolution:'CONFIRMED',bounds:{x:10,y:10,width:80,height:24}}));
 return data;
}

test('WP43 in-screen navigation keeps the old preview until the next iframe loads and never zooms',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');let writes=0;Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...descriptor,set(value){if(++writes===2)setTimeout(()=>descriptor.set.call(this,value),600);else descriptor.set.call(this,value);}});window.__screenSwitches=[];});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.locator('.prototype-transition').waitFor({state:'detached'});
  await page.evaluate(()=>{const old=document.querySelector('.prototype-viewer iframe');window.__oldFrame=old;window.__screenSwitches=[];window.__screenSwitchTimer=setInterval(()=>{const newer=[...document.querySelectorAll('.prototype-viewer iframe')].find(frame=>frame!==old),layer=old.closest('.prototype-outgoing'),preview=document.querySelector('.prototype-viewer .preview');window.__screenSwitches.push({oldConnected:old.isConnected,oldOpacity:old.isConnected?Number(getComputedStyle(layer||old.closest('.preview')).opacity):0,previewOpacity:preview?Number(getComputedStyle(preview).opacity):0,newLoaded:!!newer&&!!newer.getAttribute('srcdoc')&&newer.closest('.preview')?.getAttribute('aria-busy')==='false',status:document.querySelector('.prototype-viewer .prototype-status')?.textContent||'',at:performance.now()});},12);});
  await page.getByRole('button',{name:'可前往的畫面'}).click();await page.locator('.prototype-destination[data-destination="b"]').first().click();await page.locator('main h2').filter({hasText:'乙'}).first().waitFor();await page.locator('.preview[aria-busy="false"]').waitFor();await page.locator('.prototype-outgoing').waitFor({state:'detached'});
  const result=await page.evaluate(()=>{clearInterval(window.__screenSwitchTimer);return window.__screenSwitches;});
  assert.ok(result.length>0);assert.ok(result.every(sample=>sample.newLoaded||sample.oldConnected&&sample.oldOpacity>0),`the old preview must remain visible until the new iframe loads: ${JSON.stringify(result)}`);assert.ok(result.some(sample=>sample.status==='正在載入畫面…'&&sample.oldOpacity<=.61),'loading progress starts after the delayed threshold while the old preview dims');const overlap=result.filter(sample=>sample.newLoaded&&sample.oldConnected&&sample.oldOpacity>0&&sample.previewOpacity>0);assert.ok(overlap.length>0,'old and new previews overlap during the crossfade');assert.ok(overlap.at(-1).at-overlap[0].at<=200,'preview overlap is at most 200 ms');
  assert.equal(await page.locator('.prototype-transition').count(),0);assert.equal(await page.locator('iframe').count(),1);assert.equal(await page.locator('iframe').evaluate(frame=>getComputedStyle(frame).opacity),'1');assert.notEqual(await page.locator('iframe').evaluate(frame=>getComputedStyle(frame).pointerEvents),'none');
 }finally{await browser.close();}
});

test('WP43 simulated link navigation crossfades without creating a zoom ghost',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);await page.addInitScript(()=>{window.__ghostSamples=[];window.__ghostSeen=false;new MutationObserver(()=>{if(document.querySelector('.prototype-transition'))window.__ghostSeen=true;}).observe(document,{childList:true,subtree:true});setInterval(()=>window.__ghostSamples.push(!!document.querySelector('.prototype-transition')),8);});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.screen-card[data-screen="a"]').click();await page.waitForFunction(()=>window.__ghostSeen&&document.querySelector('.prototype-viewer')?.dataset.transition==='complete'&&!document.querySelector('.prototype-transition'));await page.evaluate(()=>window.__ghostSamples=[]);await page.frameLocator('iframe').locator('#to-b').click();await page.locator('.prototype-viewer .focus-breadcrumb h2').first().filter({hasText:'乙'}).waitFor();await page.locator('.prototype-outgoing').waitFor({state:'detached'});
  assert.equal(await page.locator('.prototype-transition').count(),0);assert.equal(await page.locator('iframe').count(),1);assert.ok((await page.evaluate(()=>window.__ghostSamples)).every(value=>!value),'simulation navigation never created a zoom ghost');
 }finally{await browser.close();}
});

test('WP43 card zoom uses uniform scale and ends exactly at the loaded preview bounds',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{window.__zoomFrames=[];window.__handoffSamples=[];window.__endpointWaited=false;const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');let writes=0;Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...descriptor,set(value){if(++writes===1)setTimeout(()=>descriptor.set.call(this,value),600);else descriptor.set.call(this,value);}});setInterval(()=>{const ghost=document.querySelector('.prototype-transition'),preview=document.querySelector('.prototype-viewer .preview');if(ghost&&preview){window.__handoffSamples.push({ghost:Number(getComputedStyle(ghost).opacity),preview:Number(getComputedStyle(preview).opacity)});const a=ghost.getBoundingClientRect(),b=preview.getBoundingClientRect();if(preview.getAttribute('aria-busy')==='true'&&Math.abs(a.x-b.x)<=2&&Math.abs(a.y-b.y)<=2&&Math.abs(a.width-b.width)<=2&&Math.abs(a.height-b.height)<=2)window.__endpointWaited=true;}},8);const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList?.contains('prototype-transition'))window.__zoomFrames.push({frames,options,ghost:this.getBoundingClientRect().toJSON()});return animate.call(this,frames,options);};});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.canvas[data-fitted="true"]').waitFor();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();await page.locator('.prototype-transition').waitFor({state:'detached'});
  const result=await page.evaluate(()=>{const record=window.__zoomFrames.find(item=>item.frames.length===2),preview=document.querySelector('.prototype-viewer .preview').getBoundingClientRect(),transforms=record.frames.map(frame=>frame.transform),match=transforms[0].match(/scale\(([^, )]+)(?:[, ]+([^ )]+))?\)/),scales=match?[Number(match[1]),Number(match[2]||match[1])]:undefined;return{record,preview:{x:preview.x,y:preview.y,width:preview.width,height:preview.height},scales,samples:window.__handoffSamples,endpointWaited:window.__endpointWaited};});
  assert.ok(result.record,'card-to-screen should animate the preview handoff');assert.ok(result.scales&&Math.abs(result.scales[0]-result.scales[1])<=.01,`zoom must use a uniform scale: ${JSON.stringify(result.scales)}`);
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(result.record.ghost[key]-result.preview[key])<=2,`${key} endpoint differs from preview: ${JSON.stringify({ghost:result.record.ghost,preview:result.preview})}`);
  assert.ok(result.samples.some(sample=>sample.ghost>0&&sample.ghost<1&&sample.preview>0&&sample.preview<1),'the thumbnail and real preview overlap during their opacity handoff');
  assert.equal(result.endpointWaited,true,'the thumbnail waits at the preview bounds until the delayed iframe loads');
 }finally{await browser.close();}
});

test('WP43 card zoom hands off to the existing placeholder after the iframe timeout',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');let writes=0;Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...descriptor,set(value){if(++writes===1)setTimeout(()=>descriptor.set.call(this,value),3000);else descriptor.set.call(this,value);}});});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.canvas[data-fitted="true"]').waitFor();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.prototype-transition').waitFor();await page.locator('.prototype-transition').waitFor({state:'detached',timeout:3000});
  await page.locator('.prototype-viewer .preview[aria-busy="true"] .preview-loading').waitFor();assert.equal(await page.locator('.prototype-viewer .preview[aria-busy="true"]').count(),1);assert.equal(await page.locator('iframe').count(),1);
 }finally{await browser.close();}
});

test('WP43 rapid navigation cancels pending switches and commits only the latest destination',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');let writes=0;Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...descriptor,set(value){if(++writes>1)setTimeout(()=>descriptor.set.call(this,value),350);else descriptor.set.call(this,value);}});});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('.sidebar-screen[data-screen-list="b"]').click();await page.locator('.sidebar-screen[data-screen-list="c"]').click();await page.locator('.prototype-viewer .focus-breadcrumb h2').first().filter({hasText:'丙'}).waitFor();await page.locator('.preview[aria-busy="false"]').waitFor();await page.locator('.prototype-outgoing').waitFor({state:'detached'});
  assert.equal(await page.locator('.prototype-viewer .focus-breadcrumb h2').first().innerText(),'丙');assert.equal(await page.locator('.prototype-url').first().innerText(),'/final');assert.equal(await page.locator('iframe').count(),1);assert.equal(await page.locator('main .prototype-viewer').count(),1);
 }finally{await browser.close();}
});

test('WP43 reduced motion skips card zoom and in-screen crossfade animations',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.canvas[data-fitted="true"]').waitFor();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.prototype-transition').count(),0);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
  await page.locator('.sidebar-screen[data-screen-list="b"]').click();await page.locator('.prototype-viewer .focus-breadcrumb h2').first().filter({hasText:'乙'}).waitFor();await page.locator('.prototype-outgoing').waitFor({state:'detached'});
  assert.equal(await page.locator('.prototype-outgoing').count(),0);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);assert.equal(await page.locator('iframe').count(),1);
 }finally{await browser.close();}
});
