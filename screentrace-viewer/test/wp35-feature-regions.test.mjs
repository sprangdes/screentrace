import test from 'node:test';
import assert from 'node:assert/strict';
import {indexGraph} from '../src/map.ts';
import {groupFeatureRegions} from '../src/feature-regions.ts';

const screen=(id,route)=>({id,type:'SCREEN',name:id,attributes:route?{route}: {},confidence:'CONFIRMED'});
const handler=(id,name,route)=>({id,type:'HANDLER',name,attributes:{},source:{file:`${name}.java`,line:1,className:name},confidence:'CONFIRMED'});
const edge=(id,type,from,to)=>({id,type,from,to,confidence:'CONFIRMED'});
const graph={schemaVersion:'2.2',application:{name:'區域測試'},nodes:[screen('owner-list','/owners/list'),screen('owner-edit','/owners/{id}/edit'),screen('root','/'),screen('missing'),handler('owner-controller','OwnerController'),handler('home-controller','HomeController')],relationships:[edge('r1','RENDERS','owner-controller','owner-list'),edge('r2','RENDERS','owner-controller','owner-edit'),edge('r3','RENDERS','home-controller','root')]};

test('WP35 feature regions group by controller before route, with root and route-less screens in 首頁與其他 deterministically',()=>{
 const index=indexGraph(graph),regions=groupFeatureRegions(index);
 assert.deepEqual(regions.map(region=>[region.name,region.basis,region.screenIds]),[
  ['owners','依控制器',['owner-edit','owner-list']],
  ['首頁與其他','首頁與其他',['missing','root']]
 ]);
 assert.deepEqual(groupFeatureRegions(index),groupFeatureRegions(index));
});

test('WP35 uses URL first segment when handler identity is unavailable',()=>{
 const data={...graph,nodes:graph.nodes.filter(node=>node.id!=='owner-controller'),relationships:graph.relationships.filter(item=>item.from!=='owner-controller')};
 assert.deepEqual(groupFeatureRegions(indexGraph(data)).map(region=>[region.name,region.basis]),[['owners','依網址前段'],['首頁與其他','首頁與其他']]);
});
