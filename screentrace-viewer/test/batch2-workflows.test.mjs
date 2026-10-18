import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
const {previewSelector,previewElement}=await ownModule('preview');
const {simulate}=await ownModule('simulation');
test('capture paths escape colon and dotted tag names before CSS matching',()=>{
 assert.equal(previewSelector('body>jsp:usebean[1]>x.widget[2]>a[1]'),'body>jsp\\:usebean:nth-of-type(1)>x\\.widget:nth-of-type(2)>a:nth-of-type(1)');
 assert.equal(previewSelector('body>div:nth-of-type(2)>a[1]'),'body>div:nth-of-type(2)>a:nth-of-type(1)');
});
test('shared preview lookup narrows runtime identity without changing persisted anchor candidates',()=>{
 const source={graphScreenId:'s',path:'body>a[1]',componentResolution:'AMBIGUOUS',graphComponentCandidates:['a','b']};
 const p={preview:{elements:[source]}};
 const node={matches:()=>true,getAttribute:()=> 'b'};
 assert.equal(previewElement(p,'s',node).graphComponentId,'b');assert.equal(source.componentResolution,'AMBIGUOUS');assert.deepEqual(source.graphComponentCandidates,['a','b']);
 assert.equal(previewElement(p,'s',{...node,getAttribute:()=> 'outside'}),source);
});
test('returned confirmation gates the default navigation, never offers parallel alternatives',()=>{
 const proof=(parser,detail)=>[{parser,detail,resolution:'CONFIRMED',source:{file:'a.jsp',line:1}}];
 const payload={graph:{nodes:[{id:'s',type:'SCREEN',attributes:{},confidence:'CONFIRMED'},{id:'next',type:'SCREEN',name:'Next',attributes:{},confidence:'CONFIRMED'},{id:'a',type:'COMPONENT',attributes:{},confidence:'CONFIRMED'}],relationships:[{from:'s',to:'a',type:'CONTAINS'}],behaviors:[{id:'nav',triggerId:'a',type:'NAVIGATE',event:'click',targetId:'next',evidence:proof('MarkupParser','href')},{id:'confirm',triggerId:'a',type:'OPEN_DIALOG',event:'click',evidence:proof('AcornStaticAnalyzer',JSON.stringify({operation:'confirm',message:'Delete?',cancelsDefault:true,status:'CONFIRMED'}))}]}};
 const effect=simulate(payload,'s',{graphComponentId:'a',componentResolution:'CONFIRMED'},{tag:'a'});
 assert.equal(effect.kind,'confirm');assert.equal(effect.message,'Delete?');assert.equal(effect.choices[0].kind,'navigate');assert.equal(effect.choices[0].targetId,'next');assert.equal(effect.simulatable,true);
});
test('projected screen navigation retains the source-proven endpoint data operation',()=>{
 const data={version:1,operation:'delete',collection:'R',fields:['id','name'],idField:'id'};
 const proof=[{parser:'SpringDataSimulation',resolution:'INFERRED',source:{file:'C.java',line:1}}];
 const payload={graph:{nodes:[{id:'s',type:'SCREEN',attributes:{},confidence:'CONFIRMED'},{id:'a',type:'COMPONENT',attributes:{},confidence:'CONFIRMED'},{id:'ep',type:'ENDPOINT',attributes:{},confidence:'CONFIRMED'},{id:'h',type:'HANDLER',attributes:{simulationData:JSON.stringify(data)},evidence:proof,confidence:'CONFIRMED'}],relationships:[{from:'s',to:'a',type:'CONTAINS'},{from:'a',to:'ep',type:'TRIGGERS'},{from:'ep',to:'h',type:'HANDLED_BY'}],behaviors:[{id:'b',triggerId:'a',event:'click',type:'NAVIGATE',targetId:'s',evidence:[{parser:'RouteTemplateInference',resolution:'INFERRED',source:{file:'a.jsp',line:1}}]}]}};
 const result=simulate(payload,'s',{graphComponentId:'a',componentResolution:'CONFIRMED'},{tag:'a'});
 assert.equal(result.dataAction?.operation,'delete');
});
