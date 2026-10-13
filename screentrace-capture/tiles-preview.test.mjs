import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
const driver=path.resolve('screentrace-capture/capture-static-jsp.mjs');
const web='src/main/webapp/WEB-INF/view/';
async function fixture(tilesAttributes) {
 const root=await mkdtemp(path.join(os.tmpdir(),'tiles-preview-')),output=path.join(root,'analysis');
 await mkdir(path.join(root,web),{recursive:true});await mkdir(output);
 const source={file:'src/main/webapp/WEB-INF/tiles-defs.xml',line:1},proof=[{source,parser:'FixtureParser',resolution:'CONFIRMED'}];
 const attributes={view:web+'layout.jsp',tilesDefinition:'true',tilesDefinitionName:'page.home'};if(tilesAttributes)attributes.tilesAttributes=JSON.stringify(tilesAttributes);
 const graph={schemaVersion:'2.2',application:{name:'fixture',path:'.',technologies:['JSP']},nodes:[{id:'screen',type:'SCREEN',name:'home',attributes,source,confidence:'CONFIRMED',evidence:proof}],relationships:[],behaviors:[],validationRules:[]};
 await writeFile(path.join(output,'application-graph.json'),JSON.stringify(graph));
 const files={
  'layout.jsp':`<%@ taglib uri="http://tiles.apache.org/tags-tiles" prefix="tiles" %><html><head><title><tiles:getAsString name="title"/></title></head><body><tiles:insert name="header" /><tiles:insert attribute="menu"/><main><tiles:insertAttribute name="body"/></main><tiles:insert page="/WEB-INF/view/panel.jsp"><tiles:put name="note" value="Inline note"/></tiles:insert><tiles:insert name="missing"/></body></html>`,
  'header.jsp':'<header id="header">Header</header>','home.jsp':'<%@ page contentType="text/html" %><h1 id="body">Home body</h1>',
  'menu.jsp':'<nav id="menu"><tiles:insert name="items"/></nav>','items.jsp':'<a id="item" href="/x.do">Item</a>','panel.jsp':'<aside id="panel"><tiles:getAsString name="note"/></aside>'};
 for(const [name,text] of Object.entries(files))await writeFile(path.join(root,web,name),text);
 return {root,output};
}
async function run(f){const child=spawn(process.execPath,[driver,f.root,f.output,'--preview-v2']);let error='';child.stderr.on('data',b=>error+=b);child.stdout.resume();const status=await new Promise(resolve=>child.on('close',resolve));return {status,error};}
const html=f=>readFile(path.join(f.output,'static-preview/screen.html'),'utf8');
const diagnostics=async f=>JSON.parse(await readFile(path.join(f.output,'static-preview/diagnostics.json'),'utf8'));

test('Tiles page definitions render their template with every resolved slot',async()=>{
 const f=await fixture({template:web+'layout.jsp',attributes:{title:{value:'Home <Page>'},header:{path:web+'header.jsp'},body:{path:web+'home.jsp'},menu:{definition:{template:web+'menu.jsp',attributes:{items:{path:web+'items.jsp'}}}}}});
 try{const result=await run(f);assert.equal(result.status,0,result.error);const page=await html(f);
  assert.match(page,/<title[^>]*>Home &lt;Page&gt;<\/title>/);
  for(const id of ['header','body','menu','item','panel'])assert.match(page,new RegExp(`id="${id}"`),id);
  assert.match(page,/<aside[^>]*>Inline note<\/aside>/,'inline tiles:put feeds the inserted page');
  assert.match(page,/data-st-source-file="src\/main\/webapp\/WEB-INF\/view\/home.jsp"/,'inserted markup keeps its own source file');
  assert.doesNotMatch(page,/<tiles:/i);
  assert.deepEqual(await diagnostics(f),['Tiles insert not rendered: missing']);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('a template without Tiles attributes renders only its literal pages and reports each empty slot',async()=>{
 const f=await fixture(null);
 try{const result=await run(f);assert.equal(result.status,0,result.error);const page=await html(f);
  assert.match(page,/id="panel"/);assert.doesNotMatch(page,/id="header"|id="body"|<tiles:/i);
  const reported=await diagnostics(f);for(const name of ['title','header','menu','body','missing'])assert.ok(reported.some(d=>d.endsWith(': '+name)),name);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
