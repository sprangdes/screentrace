import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
const source={file:'workspace:config.json',line:1};
const screen=(id,route)=>({id,type:'SCREEN',name:id,attributes:{route},confidence:'CONFIRMED'});
const flow=reached=>({entryPoints:['entry:root'],reached:reached.map(([screenId,depth])=>({screenId,reach:'REACHABLE',depth})),unreached:[],steps:reached.filter(([,d])=>d===1).map(([id])=>({from:'entry:root',to:id,kind:'RENDERS',behaviorId:null,status:'APPLIES'})),unevaluatedNavigations:0});
// shared: everyone; both: guest+member; g: guest only; m1,m2: member only; o: owner only.
function graph(){
 const all=['shared','both','g','m1','m2','o'],screens=reach=>Object.fromEntries(all.map(id=>[id,reach.includes(id)?'APPLIES':'EXCLUDED']));
 const personas=[
  {id:'guest',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:screens(['shared','both','g']),navigations:[],flow:flow([['shared',1],['both',1],['g',1]])},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:screens(['shared','both','m1','m2']),navigations:[],flow:flow([['shared',1],['both',1],['m2',1],['m1',1]])},
  {id:'owner',name:'店主',facts:[{text:'owner',truth:true,source}],startPaths:['/'],screens:screens(['shared','o']),navigations:[],flow:flow([['shared',1],['o',1]])}];
 return {schemaVersion:'2.4',application:{name:'sample',personas},nodes:all.map(id=>screen(id,'/'+id)),relationships:[],behaviors:[]};
}
const load=async()=>{const p=await ownModule('personas'),m=await ownModule('map'),page=await ownModule('persona-page'),g=graph(),index=m.indexGraph(g);return {page,index,views:p.graphPersonas(g).map(x=>p.personaView(index,x))};};

test('R23 overlap lists the persona own screens first, then screens shared with more personas before fewer',async()=>{
 const {page,index,views:[guest,member,owner]}=await load();
 assert.deepEqual(page.personaOverlap(index,[guest,member,owner],member).map(o=>[o.key,o.label,o.screens]),[
  ['only','只有這個角色',['m1','m2']],
  ['guest+owner','所有角色共用',['shared']],
  ['guest','和訪客共用',['both']]]);
 assert.deepEqual(page.personaOverlap(index,[guest,member,owner],owner).map(o=>[o.key,o.label]),[['only','只有這個角色'],['guest+member','所有角色共用']]);
});

test('R23 overlap leaves out screens the persona does not reach',async()=>{
 const {page,index,views:[guest,member,owner]}=await load();
 assert.deepEqual(page.personaOverlap(index,[guest,member,owner],guest).flatMap(o=>o.screens).sort(),['both','g','shared']);
});
