import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
// page.jsp has a button whose click fetches /fragment; the /fragment handler renders fragment.jsp. That is an API call, not a page transition.
const node=(id,type,attributes={})=>({id,type,name:id,attributes,confidence:'CONFIRMED'});
const edge=(id,type,from,to)=>({id,type,from,to,confidence:'CONFIRMED'});
const graph=(behaviors,extraNodes=[])=>({schemaVersion:'2.2',application:{name:'cr004'},
 nodes:[node('page','SCREEN'),node('fragment','SCREEN'),node('load','COMPONENT'),node('ep','ENDPOINT',{path:'/fragment',httpMethod:'GET'}),node('h','HANDLER'),...extraNodes],
 relationships:[edge('c','CONTAINS','page','load'),edge('t','TRIGGERS','load','ep'),edge('hb','HANDLED_BY','ep','h'),edge('r','RENDERS','h','fragment')],behaviors});
const behavior=(id,type,extra)=>({id,type,expression:id,confidence:'CONFIRMED',...extra});
const pairs=index=>index.relations.map(r=>[r.from,r.to,r.triggers]);
test('a fetch whose handler renders a view does not become a screen transition',async()=>{const m=await ownModule('map');
 assert.deepEqual(pairs(m.indexGraph(graph([behavior('api','CALL_API',{triggerId:'load',targetId:'ep'})]))),[]);});
test('a nested fetch inside a click handler is excluded through its root trigger',async()=>{const m=await ownModule('map');
 assert.deepEqual(pairs(m.indexGraph(graph([behavior('click','UNKNOWN',{triggerId:'load'}),behavior('api','CALL_API',{parentId:'click',targetId:'ep'})]))),[]);});
test('a request edge without any behavior keeps the existing projection',async()=>{const m=await ownModule('map');
 assert.deepEqual(pairs(m.indexGraph(graph([]))),[['page','fragment',['load']]]);});
test('the same request also proven to navigate still projects',async()=>{const m=await ownModule('map');
 assert.deepEqual(pairs(m.indexGraph(graph([behavior('api','CALL_API',{triggerId:'load',targetId:'ep'}),behavior('nav','NAVIGATE',{triggerId:'load',targetId:'ep'})]))),[['page','fragment',['load']]]);});
test('an external login API call still projects through its behavior',async()=>{const m=await ownModule('map');const g=graph([behavior('api','CALL_API',{triggerId:'load',targetId:'ep'})]);g.nodes=g.nodes.map(n=>n.id==='ep'?{...n,attributes:{...n.attributes,externalLogin:'true'}}:n);
 const relations=m.indexGraph(g).relations;assert.deepEqual(relations.map(r=>[r.from,r.to,r.triggers,r.behaviorIds]),[['page','fragment',['load'],['api']]]);});
