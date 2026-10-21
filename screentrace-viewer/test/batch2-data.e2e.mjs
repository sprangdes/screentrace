import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture,node,fileFixture} from './fixture.mjs';import {openScreen} from './decision-controls.mjs';
const collection='test/Repository.java:R';
const data=(operation,model)=>({version:1,operation,collection,fields:['id','name'],idField:'id',...(model?{model}:{})});
const proof=[{parser:'SpringDataSimulation',resolution:'INFERRED',source:{file:'C.java',line:1}}];
function payload(){
 const p=fixture();p.fingerprint='batch2-data';p.graph.nodes=[];p.graph.relationships=[];p.graph.behaviors=[];p.preview.screens=[];p.preview.elements=[];p.documents={};let edge=0;
 const relation=(type,from,to)=>p.graph.relationships.push({id:String(edge++),type,from,to,confidence:'CONFIRMED'});
 const screen=(id,html,binding)=>{const n=node(id,'SCREEN',id,binding?{simulationBindings:JSON.stringify([binding])}:{});if(binding)n.evidence=proof;p.graph.nodes.push(n);p.preview.screens.push({graphScreenId:id,width:800,height:600});p.documents[id]=html;};
 const action=(owner,id,path,target,type='NAVIGATE',kind='LINK')=>{
  p.graph.nodes.push(node(id,'COMPONENT',id,{kind}));relation('CONTAINS',owner,id);
  p.preview.elements.push({graphScreenId:owner,path,tag:kind==='FORM'?'form':'a',text:id,bounds:{x:0,y:0,width:100,height:30},styleId:'x',defaultId:'x',graphComponentId:id,componentResolution:'CONFIRMED'});
  p.graph.behaviors.push({id:'b'+id,triggerId:id,type,event:kind==='FORM'?'submit':'click',targetId:target,evidence:[{parser:'Fixture',resolution:'CONFIRMED',source:{file:owner+'.jsp',line:1}}]});
 };
 const endpoint=(id,view,operation,model)=>{p.graph.nodes.push(node(id,'ENDPOINT',id,{path:'/'+id,httpMethod:operation==='upsert'?'POST':'GET'}));const h=node(id+'h','HANDLER',id+'h',{simulationData:JSON.stringify(data(operation,model))});h.evidence=proof;p.graph.nodes.push(h);relation('HANDLED_BY',id,h.id);relation('RENDERS',h.id,view);};
 screen('list',`<html><body><a id="add">Add</a><table><tbody><tr data-st-demo-row="${collection}" data-st-demo-variable="item"><td><span data-st-demo-text="&#36;{item.name}">Sample</span></td><td><a class="edit">Edit</a><a class="delete">Delete</a></td></tr></tbody></table></body></html>`,data('readAll','items'));
 screen('new','<html><body><form><input name="name"><button type="submit">Save</button></form></body></html>');
 screen('edit','<html><body><form><input name="id" type="hidden"><input name="name"><button type="submit">Update</button></form></body></html>',data('readOne','item'));
 endpoint('save','list','upsert');endpoint('load','edit','readOne','item');endpoint('delete','list','delete');
 action('list','add','body>a[1]','new');action('list','edit-link','body>table[1]>tbody[1]>tr[1]>td[2]>a[1]','load');action('list','delete-link','body>table[1]>tbody[1]>tr[1]>td[2]>a[2]','delete');
 action('new','new-form','body>form[1]','save','SUBMIT_FORM','FORM');action('edit','edit-form','body>form[1]','save','SUBMIT_FORM','FORM');
 p.graph.behaviors.push({id:'confirm',triggerId:'delete-link',type:'OPEN_DIALOG',event:'click',evidence:[{parser:'AcornStaticAnalyzer',resolution:'CONFIRMED',source:{file:'list.jsp',line:1},detail:JSON.stringify({operation:'confirm',status:'CONFIRMED',cancelsDefault:true,message:'Remove this record?'})}]});
 return p;
}
test('graph-driven demonstration CRUD preserves row identity and confirmation cancellation, with reload isolation',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));await page.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
  const url=await fileFixture(payload()),frame=()=>page.frameLocator('.focus-layer:not([hidden]):not(.is-leaving) iframe');
  const ready=async()=>{await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy=false]').waitFor();await page.waitForFunction(()=>!document.querySelector('.focus-layer.is-entering,.focus-layer.is-leaving'));};
  await page.goto(url);await openScreen(page,'list');await ready();await frame().locator('#add').click();await ready();await frame().locator('[name=name]').fill('Created record');await frame().locator('button').click();await ready();
  let row=frame().locator('tr').filter({hasText:'Created record'});await row.waitFor();assert.equal(await frame().locator('tr').count(),2);
  await row.locator('.edit').click();await ready();assert.equal(await frame().locator('[name=id]').inputValue(),'2');assert.equal(await frame().locator('[name=name]').inputValue(),'Created record');await frame().locator('[name=name]').fill('Updated record');await frame().locator('button').click();await ready();
  row=frame().locator('tr').filter({hasText:'Updated record'});await row.waitFor();assert.equal(await frame().locator('tr').filter({hasText:'Created record'}).count(),0);
  await row.locator('.delete').click();await frame().locator('.simulation-confirm-cancel').click();assert.equal(await row.count(),1);assert.equal(await page.locator('.simulation-choice').count(),0);
  await row.locator('.delete').click();await frame().locator('.simulation-confirm-accept').click();await ready();assert.equal(await frame().locator('tr').filter({hasText:'Updated record'}).count(),0);assert.equal(await frame().locator('tr').count(),1);
  await page.reload();await openScreen(page,'list');await ready();assert.equal(await frame().locator('tr').count(),1);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 }finally{await browser.close();}
});
