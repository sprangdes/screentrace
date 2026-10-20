import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
const {parseDataAction,endpointDataAction,applyDataAction}=await ownModule('simulation-data');
const action={version:1,operation:'upsert',collection:'R',fields:['id','name'],idField:'id'};
test('data contracts reject prototype fields, arbitrary operations and absent source proof',()=>{
 assert.ok(parseDataAction(action));assert.equal(parseDataAction({...action,fields:['id','__proto__']}),undefined);assert.equal(parseDataAction({...action,operation:'executeJava'}),undefined);
 const payload={graph:{nodes:[{id:'h',attributes:{simulationData:JSON.stringify(action)},evidence:[]}],relationships:[{type:'HANDLED_BY',from:'e',to:'h'}]}};
 assert.equal(endpointDataAction(payload,'e'),undefined);
 payload.graph.nodes[0].evidence.push({parser:'SpringDataSimulation',resolution:'INFERRED'});assert.equal(endpointDataAction(payload,'e').collection,'R');
});
test('demo CRUD accepts named form strings and rejects unknown row IDs',()=>{
 const payload={};const field=(name,value)=>({getAttribute:k=>k==='name'?name:null,hasAttribute:()=>false,value});
 const form={localName:'form',closest:()=>null,elements:[field('name','New item')]};
 assert.equal(applyDataAction(payload,action,form),true);
 assert.equal(applyDataAction(payload,{...action,operation:'delete'},{closest:()=>({getAttribute:()=> '2'})}),true);
 assert.equal(applyDataAction(payload,{...action,operation:'delete'},{closest:()=>({getAttribute:()=> '2'})}),false);
 assert.equal(applyDataAction({}, {...action,operation:'delete'},{closest:()=>({getAttribute:()=> '2'})}),false);
});
test('data actions validate optional exception-path marker and accept supplied string identity',()=>{
 assert.equal(parseDataAction({...action,conditional:'true'}),undefined);assert.ok(parseDataAction({...action,conditional:true}));
 const field=(name,value)=>({getAttribute:k=>k==='name'?name:null,hasAttribute:()=>false,value});const payload={};
 assert.equal(applyDataAction(payload,action,{localName:'form',closest:()=>null,elements:[field('id','CODE-ONE'),field('name','Named')]}),true);
 assert.equal(applyDataAction(payload,{...action,operation:'delete'},{closest:()=>({getAttribute:()=> 'CODE-ONE'})}),true);
});
test('missing source row permits known read navigation without selecting a fabricated record',()=>{
 const payload={};assert.equal(applyDataAction(payload,{...action,operation:'readOne'},{closest:()=>null}),true);assert.equal(applyDataAction(payload,{...action,operation:'readOne'},{closest:()=>({getAttribute:()=> 'nonexistent'})}),false);
});
test('DTO input mapping creates independent IDs and an update requires a source-selected row',()=>{
 const mapped={...action,inputFields:{name:'caption'},generatedIdentity:true,scope:'submitted-fields-only'};
 const field=(name,value)=>({getAttribute:k=>k==='name'?name:null,hasAttribute:()=>false,value});const form=value=>({localName:'form',closest:()=>null,elements:[field('caption',value)]});const payload={};
 assert.equal(applyDataAction(payload,mapped,form('First')),true);assert.equal(applyDataAction(payload,mapped,form('Second')),true);
 assert.equal(applyDataAction({}, {...mapped,generatedIdentity:false,useSelectedIdentity:true},form('Missing')),false);
 assert.equal(applyDataAction(payload,{...mapped,generatedIdentity:false,useSelectedIdentity:true},form('Changed')),true);
 assert.equal(applyDataAction(payload,{...action,operation:'delete'},{closest:()=>({getAttribute:()=> '2'})}),true);
 assert.equal(applyDataAction(payload,{...action,operation:'delete'},{closest:()=>({getAttribute:()=> '3'})}),true);
 assert.equal(parseDataAction({...mapped,inputFields:{name:'__proto__'}}),undefined);
});
