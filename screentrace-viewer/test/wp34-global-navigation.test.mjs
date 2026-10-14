import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {expandedNavigationFixture} from './wp34-global-navigation-fixture.mjs';

test('WP34 groups expanded global navigation while preserving page-specific flows',async()=>{
 const map=await ownModule('map'),overview=await ownModule('overview'),data=expandedNavigationFixture(),index=map.indexGraph(data.graph),parts=overview.partitionNavigation(index);
 assert.equal(parts.global.length,12,'three shared navigation items on each of four screens');
 assert.equal(parts.flows.length,4,'one screen-specific link remains per screen');
 assert.deepEqual(parts.global.flatMap(r=>r.triggers).sort(),data.graph.nodes.filter(n=>n.id.startsWith('nav-')).map(n=>n.id).sort());
 assert.deepEqual(parts.flows.flatMap(r=>r.triggers).sort(),data.graph.nodes.filter(n=>n.id.startsWith('specific-')).map(n=>n.id).sort());
 assert.equal(index.screens.length,4);
});

test('destinations most screens reach are left off the overview once there are many screens, but stay in focus',async()=>{
 const map=await ownModule('map'),overview=await ownModule('overview'),canvas=await ownModule('canvas');
 const node=(id,type,name,attributes={})=>({id,type,name,attributes,confidence:'CONFIRMED'});
 const build=count=>{
  const ids=Array.from({length:count},(_,i)=>`s${i}`),nodes=ids.map((id,i)=>node(id,'SCREEN',id,{route:`/p${i}`})),relationships=[];
  ids.forEach((id,i)=>{
   // Every screen has its own sign-in link (different components) and one link to the next screen.
   for(const [kind,to] of [['login',ids[0]],['next',ids[(i+1)%count]]]){const c=`${kind}-${id}`;nodes.push(node(c,'COMPONENT',`${kind} ${id}`,{kind:'LINK',target:`/${kind}/${id}`}));relationships.push({id:'own-'+c,type:'CONTAINS',from:id,to:c,confidence:'CONFIRMED'},{id:'nav-'+c,type:'NAVIGATES_TO',from:c,to,confidence:'CONFIRMED'});}
  });
  return map.indexGraph({schemaVersion:'2.2',application:{name:'a',path:'.',technologies:[]},nodes,relationships,behaviors:[],apiContracts:[],validationRules:[]});
 };
 const many=build(16),common=overview.commonDestinations(many);
 assert.deepEqual([...common.keys()],['s0']);
 assert.ok(overview.overviewFlows(many).every(r=>r.to!=='s0'||r.from==='s0'),'no overview line into the common destination');
 assert.ok(canvas.focusLines(many,'s5').some(r=>r.to==='s0'),'zooming into a screen still draws its line there');
 assert.equal(overview.commonDestinations(build(8)).size,0,'small applications keep every line');
});
