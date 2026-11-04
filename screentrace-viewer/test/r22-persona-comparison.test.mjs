import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
const source={file:'workspace:config.json',line:1};
const screen=(id,route)=>({id,type:'SCREEN',name:id,attributes:{route},confidence:'CONFIRMED'});
const flow=(reached,unreached=[])=>({entryPoints:['entry:root'],reached:reached.map(([screenId,reach,depth])=>({screenId,reach,depth})),unreached,steps:reached.filter(([,,d])=>d===1).map(([id])=>({from:'entry:root',to:id,kind:'RENDERS',behaviorId:null,status:'APPLIES'})),unevaluatedNavigations:0});
// shared: everyone; both: guest+member; g: guest only; m1,m2: member only; o: owner only; nobody: no persona reaches it.
function graph(){
 const all=['shared','both','g','m1','m2','o','nobody'];
 const screens=reach=>Object.fromEntries(all.map(id=>[id,reach.includes(id)?'APPLIES':'EXCLUDED']));
 const personas=[
  {id:'guest',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:screens(['shared','both','g','nobody']),navigations:[],flow:{...flow([['shared','POSSIBLE',1],['both','POSSIBLE',1],['g','POSSIBLE',1]],['nobody'])}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:screens(['shared','both','m1','m2']),navigations:[],flow:flow([['shared','REACHABLE',1],['both','REACHABLE',1],['m2','REACHABLE',1],['m1','POSSIBLE',1]])},
  {id:'owner',name:'店主',facts:[{text:'owner',truth:true,source}],startPaths:['/'],screens:screens(['shared','o']),navigations:[],flow:flow([['shared','REACHABLE',1],['o','REACHABLE',1]])}];
 return {schemaVersion:'2.4',application:{name:'sample',personas},nodes:all.map(id=>screen(id,'/'+id)),relationships:[],behaviors:[]};
}
const load=async()=>{const p=await ownModule('personas'),m=await ownModule('map'),page=await ownModule('persona-page'),g=graph(),index=m.indexGraph(g);return {page,index,views:p.graphPersonas(g).map(x=>p.personaView(index,x)),ids:g.nodes.map(n=>n.id)};};

test('R22 sections group screens by which personas reach them: shared first, then each persona, then nobody folded',async()=>{
 const {page,index,views,ids}=await load();
 assert.deepEqual(page.comparisonSections(index,views,[...ids].reverse()).map(s=>[s.key,s.label,s.screens,s.folded]),[
  ['guest+member+owner','所有角色共用',['shared'],false],
  ['guest+member','訪客、會員共用',['both'],false],
  ['guest','只有訪客',['g'],false],
  ['member','只有會員',['m1','m2'],false],
  ['owner','只有店主',['o'],false],
  ['none','沒有角色走得到',['nobody'],true]]);
});

test('R22 a cell shows the step number, × when never reached, and nothing when the screen does not apply',async()=>{
 const {page,views}=await load();
 assert.deepEqual(views.map(v=>page.personaCellText(v,'shared')),['1','1','1']);
 assert.deepEqual(views.map(v=>page.personaCellText(v,'nobody')),['×','','']);
});
