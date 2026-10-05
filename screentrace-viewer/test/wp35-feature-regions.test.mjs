import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';

const screen=(id,route)=>({id,type:'SCREEN',name:id,attributes:route?{route}: {},confidence:'CONFIRMED'});
const handler=(id,name,route)=>({id,type:'HANDLER',name,attributes:{},source:{file:`${name}.java`,line:1,className:name},confidence:'CONFIRMED'});
const edge=(id,type,from,to)=>({id,type,from,to,confidence:'CONFIRMED'});
const graph={schemaVersion:'2.2',application:{name:'區域測試'},nodes:[screen('owner-list','/owners/list'),screen('owner-edit','/owners/{id}/edit'),screen('root','/'),screen('missing'),handler('owner-controller','OwnerController'),handler('home-controller','HomeController')],relationships:[edge('r1','RENDERS','owner-controller','owner-list'),edge('r2','RENDERS','owner-controller','owner-edit'),edge('r3','RENDERS','home-controller','root')]};

test('WP35 auto grouping uses one project-wide basis and explicit controller grouping removes technical suffixes',async()=>{
 const {indexGraph,groupFeatureRegions}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));const index=indexGraph(graph),regions=groupFeatureRegions(index);
 assert.deepEqual(regions.map(region=>[region.name,region.basis,region.screenIds]),[
  ['Owners','依網址前段',['owner-edit','owner-list']],
  ['首頁與其他','依網址前段',['missing','root']]
 ]);
 const reversed=indexGraph({...graph,nodes:[...graph.nodes].reverse(),relationships:[...graph.relationships].reverse()});assert.deepEqual(groupFeatureRegions(reversed),regions);
 assert.deepEqual(groupFeatureRegions(index,'controller').map(region=>[region.name,region.screenIds]),[['Home',['root']],['Owner',['owner-edit','owner-list']],['首頁與其他',['missing']]]);
});

test('WP35 Struts Action path prefix is used when a controller class is absent',async()=>{
 const {indexGraph,groupFeatureRegions}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));
 const data={schemaVersion:'2.2',application:{name:'Struts'},nodes:[screen('one','/owners/list.do'),screen('two','/owners/edit.do'),{id:'action',type:'ACTION',name:'OwnersAction',attributes:{path:'/owners/list.do'},confidence:'CONFIRMED'}],relationships:[edge('a','RENDERS','action','one'),edge('b','RENDERS','action','two')]};
 assert.deepEqual(groupFeatureRegions(indexGraph(data)).map(region=>[region.name,region.basis,region.screenIds]),[['Owners','依網址前段',['one','two']]]);
});

test('WP35 uses URL first segment when handler identity is unavailable',async()=>{
 const {indexGraph,groupFeatureRegions}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));
 const data={...graph,nodes:graph.nodes.filter(node=>!['owner-controller','home-controller'].includes(node.id)),relationships:[]};
 assert.deepEqual(groupFeatureRegions(indexGraph(data)).map(region=>[region.name,region.basis]),[['Owners','依網址前段'],['首頁與其他','依網址前段']]);
});

test('WP35 humanizes a namespaced view-controller label without exposing punctuation',async()=>{
 const {indexGraph,groupFeatureRegions}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));
 const data={schemaVersion:'2.2',application:{name:'MVC'},nodes:[screen('home','/'),{id:'view-controller',type:'HANDLER',name:'View Controller',attributes:{class:'org.springframework.web.servlet.mvc:view-controller'},confidence:'CONFIRMED'}],relationships:[edge('home-render','RENDERS','view-controller','home')]};
 assert.equal(groupFeatureRegions(indexGraph(data),'controller')[0].name,'Mvc');
});
