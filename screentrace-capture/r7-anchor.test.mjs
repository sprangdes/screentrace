import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,cp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {annotateSource,markupTokens,markupAttributes} from './preview-markup.mjs';
import {collectElementStyles} from './element-styles.mjs';
const driver=path.resolve('screentrace-capture/capture-static-jsp.mjs');
async function run(root,out){const child=spawn(process.execPath,[driver,root,out,'--preview-v2']);let error='';child.stderr.on('data',b=>error+=b);child.stdout.resume();const status=await new Promise(r=>child.on('close',r));assert.equal(status,0,error);return JSON.parse(await readFile(path.join(out,'static-preview/element-styles.json')));}
test('OQ-017 shared vectors keep only original opening tags and original start lines',async()=>{
 const data=JSON.parse(await readFile('docs/examples/expansion-anchor-vectors.json'));
 for(const v of data.vectors){const actual=markupTokens(annotateSource(v.source,v.path)).filter(t=>t.name&&!t.closing).map(t=>markupAttributes(t.text)['data-st-expansion-anchor']).filter(Boolean);assert.deepEqual(actual,v.expected,v.name);}
});
test('four distinct tag hrefs map to the component that owns that exact href',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'r7-anchor-')),out=path.join(root,'output'),web=path.join(root,'src/main/webapp');let browser;
 try{
  await mkdir(path.join(web,'WEB-INF/tags'),{recursive:true});await mkdir(out);
  await writeFile(path.join(web,'page.jsp'),'<%@ taglib prefix="t" tagdir="/WEB-INF/tags" %>\n'+['/a','/b','/c','/d'].map(h=>`<t:item href="${h}"/>`).join('\n'));
  await writeFile(path.join(web,'WEB-INF/tags/item.tag'),'<a href="${href}">Go</a>');
  const nodes=[{id:'screen',type:'SCREEN',attributes:{view:'src/main/webapp/page.jsp'}}];
  for(let i=0;i<4;i++)nodes.push({id:'link-'+i,type:'COMPONENT',source:{file:'src/main/webapp/page.jsp',line:i+2},attributes:{tag:'a',kind:'LINK',href:['/a','/b','/c','/d'][i],expansionAnchor:`src/main/webapp/page.jsp:${i+2} > src/main/webapp/WEB-INF/tags/item.tag:1`}});
  const graph={schemaVersion:'2.2',nodes,relationships:nodes.slice(1).map(n=>({type:'CONTAINS',from:'screen',to:n.id}))};await writeFile(path.join(out,'application-graph.json'),JSON.stringify(graph));
  const capture=await run(root,out);browser=await chromium.launch();const page=await browser.newPage();await page.goto(pathToFileURL(path.join(out,'static-preview/screen.html')).href);
  const hrefs=await page.locator('a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),links=capture.screens.screen.elements.filter(e=>e.tag==='a');assert.equal(links.length,4);
  for(let i=0;i<4;i++){const component=nodes.find(n=>n.id===links[i].graphComponentId);assert.ok(component,'missing component for '+hrefs[i]);assert.equal(component.attributes.href,hrefs[i]);assert.equal(links[i].matchBasis,'ANCHOR');}
  assert.deepEqual(await run(root,out),capture);
 }finally{await browser?.close();await rm(root,{recursive:true,force:true});}
});
test('no source and no attribute evidence cannot consume a same-tag component; anchor collisions retain all candidates',async()=>{
 let browser;try{browser=await chromium.launch();const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.setContent('<body><button>Unknown</button><a data-st-expansion-anchor="same">One</a><a data-st-expansion-anchor="same">Two</a>');
  const graph={schemaVersion:'2.2',nodes:[{id:'button',type:'COMPONENT',source:{file:'page.jsp',line:1},attributes:{tag:'button'}},...['a','b'].map(id=>({id,type:'COMPONENT',source:{file:'page.jsp',line:2},attributes:{tag:'a',expansionAnchor:'same'}}))],relationships:['button','a','b'].map(to=>({type:'CONTAINS',from:'screen',to}))};
  const data=await collectElementStyles(page,context,graph,'screen');const button=data.elements.find(e=>e.tag==='button');assert.equal(button.graphComponentId,null);assert.equal(button.componentResolution,'UNRESOLVED');assert.equal(button.matchBasis,undefined);
  for(const item of data.elements.filter(e=>e.tag==='a')){assert.equal(item.componentResolution,'AMBIGUOUS');assert.deepEqual(item.graphComponentCandidates,['a','b']);assert.equal(item.graphComponentId,null);assert.equal(item.matchBasis,'ANCHOR');}
 }finally{await browser?.close();}
});
