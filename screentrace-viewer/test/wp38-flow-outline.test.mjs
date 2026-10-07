import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture,node} from './fixture.mjs';

test('flow outline is deterministic, bounds depth and width, marks cycles, ambiguity and unresolved destinations, and excludes global navigation',async()=>{
 const {indexGraph}=await ownModule('map'),{buildFlowOutline}=await ownModule('flow-outline');
 const data=fixture();data.graph.nodes.push(node('c','SCREEN','丙',{route:'/c'}),node('d','SCREEN','丁',{route:'/d'}),node('e','SCREEN','戊',{route:'/e'}),node('q','SCREEN','未知來源',{route:'/q'}),node('nav','COMPONENT','Home',{kind:'LINK',tag:'a'}),node('unknown-button','COMPONENT','未知按鈕',{kind:'BUTTON'}));
 data.graph.nodes.push(...Array.from({length:9},(_,i)=>node(`s${i}`,'SCREEN',`候選${i}`,{route:`/s${i}`})));
 data.graph.relationships.push({id:'3',type:'NAVIGATES_TO',from:'shared',to:'c'}, {id:'4',type:'NAVIGATES_TO',from:'shared',to:'d'}, {id:'5',type:'NAVIGATES_TO',from:'shared',to:'e'});
 data.graph.relationships.push(...Array.from({length:9},(_,i)=>({id:`many-${i}`,type:'NAVIGATES_TO',from:'shared',to:`s${i}`})));
 data.graph.relationships.push({id:'global-a',type:'CONTAINS',from:'a',to:'nav'},{id:'global-b',type:'CONTAINS',from:'b',to:'nav'},{id:'global-to-a',type:'NAVIGATES_TO',from:'nav',to:'a'},{id:'global-to-b',type:'NAVIGATES_TO',from:'nav',to:'b'},{id:'unknown-owner',type:'CONTAINS',from:'q',to:'unknown-button'});
 for(const id of ['c','d','e','s0','s1','s2'])data.graph.relationships.push({id:`global-owner-${id}`,type:'CONTAINS',from:id,to:'nav'});
 data.graph.behaviors.push({id:'unknown',triggerId:'unknown-button',type:'NAVIGATE',event:'click',expression:'${dynamic}',confidence:'UNRESOLVED'});
 const index=indexGraph(data.graph),first=buildFlowOutline(index,'a'),second=buildFlowOutline(index,'a');
 assert.deepEqual(first,second);assert.ok(first.nodes.length<=8);assert.ok(first.more>0);
 assert.ok(first.nodes.some(n=>n.label==='丙'&&n.triggers.includes('共用按鈕')));
 assert.ok(buildFlowOutline(index,'q').nodes.some(n=>n.label==='無法確認的目的'));
 assert.ok(!first.nodes.some(n=>n.triggers.includes('Home')),'global navigation is excluded');
 const cycle=buildFlowOutline(index,'b');assert.ok(JSON.stringify(cycle).includes('回到已出現的畫面'));
 const all=[...first.nodes,...first.overflow];assert.ok(all.some(n=>n.label==='丙')&&all.some(n=>n.label==='丁'),'all candidates sharing one trigger remain available, including overflow');
 const height=(nodes,depth=1)=>nodes.reduce((max,node)=>Math.max(max,height(node.children,depth+1)),depth);assert.ok(height(first.nodes)<=5,'root plus four navigation levels');assert.ok(first.depth<=4);
});
