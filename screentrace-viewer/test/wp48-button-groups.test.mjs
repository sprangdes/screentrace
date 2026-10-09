import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture,node} from './fixture.mjs';

test('WP48 groups identical label and action signatures, and exposes divergent actions as non-markable variants',async()=>{
 const data=fixture();const labels=[['save-a','a','Save'],['save-b','b','Save'],['run-a','a','Run'],['run-b','b','Run']];
 for(const [id,screen,label]of labels){data.graph.nodes.push(node(id,'COMPONENT',label,{kind:'BUTTON',visibleText:label}));data.graph.relationships.push({id:`contains-${id}`,type:'CONTAINS',from:screen,to:id,confidence:'CONFIRMED'});}
 data.graph.nodes.push(node('target-one','SCREEN','Target One',{route:'/one'}),node('target-two','SCREEN','Target Two',{route:'/two'}));
 data.graph.relationships.push(
  {id:'save-a-target',type:'NAVIGATES_TO',from:'save-a',to:'b',confidence:'CONFIRMED'},
  {id:'save-b-target',type:'NAVIGATES_TO',from:'save-b',to:'b',confidence:'CONFIRMED'},
  {id:'run-a-target',type:'NAVIGATES_TO',from:'run-a',to:'target-one',confidence:'CONFIRMED'},
  {id:'run-b-target',type:'NAVIGATES_TO',from:'run-b',to:'target-two',confidence:'CONFIRMED'}
 );
 const [{indexGraph},{buttonTableRows}]=await Promise.all([ownModule('map'),ownModule('button-table')]);const rows=buttonTableRows(indexGraph(data.graph));
 const save=rows.find(row=>row.name==='Save');assert.equal(save?.members.length,2);assert.equal(save?.behaviorDifferent,false);
 const run=rows.find(row=>row.name==='Run');assert.equal(run?.behaviorDifferent,true);assert.equal(run?.members.length,2);assert.equal(run?.variants.length,2);assert.equal(run?.markable,false);
 assert.equal(rows.filter(row=>row.name==='Save'||row.name==='Run').length,2);
});
