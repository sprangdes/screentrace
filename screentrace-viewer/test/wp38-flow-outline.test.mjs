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

test('flow outline expands each screen once, reuses destinations as jump links, merges unresolved targets, and applies readable trigger names',async()=>{
 const {indexGraph}=await ownModule('map'),{buildFlowOutline}=await ownModule('flow-outline');
 const data=fixture();
 data.graph.nodes.push(node('c','SCREEN','寵物表單',{route:'/pets/new'}),node('d','SCREEN','就診表單',{route:'/visits/new'}),
  node('add-owner-form','COMPONENT','add-owner-form',{kind:'FORM'}),node('generic-form','COMPONENT','表單 1',{kind:'FORM'}),node('generic-link','COMPONENT','連結 6',{kind:'LINK'}),node('readable','COMPONENT','編輯飼主',{kind:'LINK'}),node('unknown-one','COMPONENT','unknown-one',{kind:'BUTTON'}),node('unknown-two','COMPONENT','unknown-two',{kind:'LINK'}));
 data.graph.relationships.push({id:'owner-trigger',type:'CONTAINS',from:'a',to:'add-owner-form'},
  {id:'generic-form-owner',type:'CONTAINS',from:'a',to:'generic-form'},{id:'generic-link-owner',type:'CONTAINS',from:'a',to:'generic-link'},
  {id:'readable-owner',type:'CONTAINS',from:'b',to:'readable'},{id:'unknown-one-owner',type:'CONTAINS',from:'a',to:'unknown-one'},{id:'unknown-two-owner',type:'CONTAINS',from:'a',to:'unknown-two'},
  {id:'a-b',type:'NAVIGATES_TO',from:'add-owner-form',to:'b'},{id:'a-c',type:'NAVIGATES_TO',from:'generic-form',to:'c'},
  {id:'a-d-1',type:'NAVIGATES_TO',from:'generic-link',to:'d'},{id:'a-d-2',type:'NAVIGATES_TO',from:'generic-form',to:'d'},
  {id:'b-d',type:'NAVIGATES_TO',from:'readable',to:'d'});
 data.graph.behaviors.push({id:'unknown-1',triggerId:'unknown-one',type:'NAVIGATE',expression:'first()',confidence:'UNRESOLVED'},
  {id:'unknown-2',triggerId:'unknown-two',type:'NAVIGATE',expression:'second()',confidence:'UNRESOLVED'});
 const outline=buildFlowOutline(indexGraph(data.graph),'a');
 const all=[],visit=nodes=>nodes.forEach(item=>{all.push(item);visit(item.children);});visit(outline.nodes);
 const expandedD=all.filter(item=>item.id==='d'&&!item.alreadyExpanded),reusedD=all.filter(item=>item.id==='d'&&item.alreadyExpanded);
 assert.equal(expandedD.length,1,'a destination screen is expanded once in the tree');
 assert.equal(reusedD.length,1,'a later reference is a single jump link marked already expanded');
 assert.equal(reusedD[0].label,'就診表單（已在上面展開）');assert.equal(reusedD[0].canNavigate,true);
 assert.equal(all.filter(item=>item.unresolved).length,1,'all unknown targets share one node per source screen');
 assert.deepEqual(all.find(item=>item.unresolved).triggers,['按鈕（web/unknown-one.jsp 第 1 行）','連結（web/unknown-two.jsp 第 1 行）']);
 const text=JSON.stringify(outline);for(const internal of ['add-owner-form','表單 1','連結 6','unknown-one','unknown-two'])assert.equal(text.includes(internal),false,`internal name ${internal} must not appear`);
 assert.ok(all.some(item=>item.triggers.includes('編輯飼主')),'readable component labels use the shared R5 naming rule');
});
