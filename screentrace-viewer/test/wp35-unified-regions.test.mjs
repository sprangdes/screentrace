import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';

const screen=(id,route,view)=>({id,type:'SCREEN',name:id,attributes:{route,view},source:{file:view,line:1},confidence:'CONFIRMED'});
const controller=(id,className)=>({id,type:'HANDLER',name:id,attributes:{class:className},confidence:'CONFIRMED'});
const edge=(id,from,to)=>({id,type:'RENDERS',from,to,confidence:'CONFIRMED'});
const graph={schemaVersion:'2.2',application:{name:'Grouping'},nodes:[
 screen('a','/users/list','WEB-INF/jsp/user/list.jsp'),screen('b','/users/edit','WEB-INF/jsp/user/edit.jsp'),
 screen('c','/orders/list','WEB-INF/jsp/order/list.jsp'),screen('d','/orders/edit','WEB-INF/jsp/order/edit.jsp'),
 screen('e','/orders/show','WEB-INF/jsp/order/show.jsp'),
 controller('users','org.example.UserController'),controller('orders','org.example.OrderController'),controller('single','org.example.AuditController')
],relationships:[edge('a-u','users','a'),edge('b-u','users','b'),edge('c-o','orders','c'),edge('d-o','orders','d'),edge('e-s','single','e')]};

test('WP35 selects one project-wide basis with the fewest one-screen areas and declared tie order',async()=>{
 const {indexGraph,chooseFeatureGroupingBasis,groupFeatureRegions}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));
 const index=indexGraph(graph),chosen=chooseFeatureGroupingBasis(index);
 assert.equal(chosen,'url');
 const regions=groupFeatureRegions(index,chosen);
 assert.ok(regions.every(region=>region.strategy==='url'));
 assert.deepEqual(regions.map(region=>[region.name,region.screenIds.length]),[['Orders',3],['Users',2]]);
 const controllerRegions=groupFeatureRegions(index,'controller');
 assert.ok(controllerRegions.every(region=>region.strategy==='controller'));
 assert.deepEqual(controllerRegions.map(region=>region.name),['Audit','Order','User']);
 const directoryRegions=groupFeatureRegions(index,'jsp-directory');
 assert.ok(directoryRegions.every(region=>region.strategy==='jsp-directory'));
 assert.deepEqual(directoryRegions.map(region=>[region.name,region.screenIds.length]),[['Order',3],['User',2]]);
});

test('WP35 grouping basis ties prefer URL, then controller, then JSP directory',async()=>{
 const {indexGraph,chooseFeatureGroupingBasis}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));
 const tieGraph={...graph,nodes:graph.nodes.map(node=>node.type==='SCREEN'?{...node,attributes:{...node.attributes,view:`${node.id}.jsp`}}:node)};
 assert.equal(chooseFeatureGroupingBasis(indexGraph(tieGraph)),'url');
});

test('WP35 strips technical controller suffixes and exposes the selected basis label',async()=>{
 const {indexGraph,groupFeatureRegions}=await Promise.all([ownModule('map'),ownModule('feature-regions')]).then(([map,regions])=>({...map,...regions}));
 const regions=groupFeatureRegions(indexGraph(graph),'controller');
 assert.ok(regions.every(region=>region.basis==='依控制器類別'));
 assert.deepEqual(regions.map(region=>region.name),['Audit','Order','User']);
});
