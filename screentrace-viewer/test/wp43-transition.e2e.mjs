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
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.evaluate(()=>{const old=document.querySelector('.prototype-viewer iframe');window.__oldFrame=old;window.__screenSwitches=[];window.__screenSwitchTimer=setInterval(()=>{const newer=[...document.querySelectorAll('.prototype-viewer iframe')].find(frame=>frame!==old);window.__screenSwitches.push({oldConnected:old.isConnected,oldOpacity:old.isConnected?Number(getComputedStyle(old.closest('.preview')).opacity):0,newLoaded:!!newer&&newer.contentDocument?.readyState==='complete'});},12);});
  await page.getByRole('button',{name:'可前往的畫面'}).click();await page.locator('.prototype-destination[data-destination="b"]').first().click();await page.locator('main h2').filter({hasText:'乙'}).waitFor();await page.locator('.preview[aria-busy="false"]').waitFor();
  const result=await page.evaluate(()=>{clearInterval(window.__screenSwitchTimer);return window.__screenSwitches;});
  assert.ok(result.length>0);assert.ok(result.every(sample=>sample.newLoaded||sample.oldConnected&&sample.oldOpacity>0),'the old preview must remain visible until the new iframe loads');
  assert.equal(await page.locator('.prototype-transition').count(),0);assert.equal(await page.locator('iframe').count(),1);assert.equal(await page.locator('iframe').evaluate(frame=>getComputedStyle(frame).opacity),'1');
 }finally{await browser.close();}
});

test('WP43 card zoom uses uniform scale and ends exactly at the loaded preview bounds',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{window.__zoomFrames=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList?.contains('prototype-transition'))window.__zoomFrames.push({frames,options,ghost:this.getBoundingClientRect().toJSON()});return animate.call(this,frames,options);};});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.canvas[data-fitted="true"]').waitFor();await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  const result=await page.evaluate(()=>{const record=window.__zoomFrames.find(item=>item.frames.length===2),preview=document.querySelector('.prototype-viewer .preview').getBoundingClientRect(),transforms=record.frames.map(frame=>frame.transform),scales=transforms[0].match(/scale\(([^, )]+)[, ]+([^ )]+)\)/);return{record,preview:{x:preview.x,y:preview.y,width:preview.width,height:preview.height},scales:scales?.slice(1).map(Number)};});
  assert.ok(result.record,'card-to-screen should animate the preview handoff');assert.ok(result.scales&&Math.abs(result.scales[0]-result.scales[1])<=.01,`zoom must use a uniform scale: ${JSON.stringify(result.scales)}`);
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(result.record.ghost[key]-result.preview[key])<=2,`${key} endpoint differs from preview: ${JSON.stringify({ghost:result.record.ghost,preview:result.preview})}`);
 }finally{await browser.close();}
});

test('WP43 rapid navigation cancels pending switches and commits only the latest destination',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');let writes=0;Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...descriptor,set(value){if(++writes>1)setTimeout(()=>descriptor.set.call(this,value),350);else descriptor.set.call(this,value);}});});
  await page.goto(await fileFixture(navigationFixture()));await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('.sidebar-screen[data-screen-list="b"]').click();await page.locator('.sidebar-screen[data-screen-list="c"]').click();await page.locator('main h2').filter({hasText:'丙'}).waitFor();await page.locator('.preview[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('main h2').innerText(),'丙');assert.equal(await page.locator('.prototype-url').innerText(),'/final');assert.equal(await page.locator('iframe').count(),1);assert.equal(await page.locator('main .prototype-viewer').count(),1);
 }finally{await browser.close();}
});
