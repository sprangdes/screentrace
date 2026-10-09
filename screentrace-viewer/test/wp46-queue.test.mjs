import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture,node} from './fixture.mjs';

test('WP46 queue groups screens by suspicion, orders within groups, filters undecided and toggles region grouping',async()=>{
 const {screenReviewQueue}=await ownModule('screen-review-queue');
 const data=fixture();
 data.graph.nodes.push(node('no-route','SCREEN','No route',{}),node('redirect','SCREEN','Redirect',{route:'/redirect',autoRedirect:'LOGIN'}),node('route-only','SCREEN','Route only',{route:'/only'}),node('inferred','SCREEN','Inferred',{route:'/inferred'}),node('confirmed','SCREEN','Confirmed',{route:'/confirmed'}),node('entry-z','SCREEN','Z entry',{route:'/z'}),node('entry-a','SCREEN','A entry',{route:'/a'}));
 data.graph.relationships.push(
  {id:'entry-inferred',type:'NAVIGATES_TO',from:'shared',to:'inferred',confidence:'INFERRED'},
  {id:'entry-confirmed',type:'NAVIGATES_TO',from:'shared',to:'confirmed',confidence:'CONFIRMED'},
  {id:'entry-z-1',type:'NAVIGATES_TO',from:'shared',to:'entry-z',confidence:'CONFIRMED'},
  {id:'entry-z-2',type:'NAVIGATES_TO',from:'shared',to:'entry-z',confidence:'CONFIRMED'},
  {id:'entry-a',type:'NAVIGATES_TO',from:'shared',to:'entry-a',confidence:'CONFIRMED'}
 );
 const regions=[{key:'left',name:'Left',screenIds:['no-route','route-only','inferred','confirmed']},{key:'right',name:'Right',screenIds:['redirect','entry-z','entry-a']}];
 const state={screenDecisions:{'no-route':'KEEP'},componentDecisions:{}};
 const result=screenReviewQueue(data.graph,regions,state,{groupByRegion:false,onlyUndecided:false});
 assert.deepEqual(result.map(group=>group.classification),['NO_ENTRY','ROUTE_ONLY','INFERRED_ENTRY','AUTO_REDIRECT','HAS_ENTRY']);
 assert.deepEqual(result[0].screens.map(item=>item.screenId),['no-route']);
 assert.deepEqual(result[4].screens.map(item=>item.screenId),['entry-a','entry-z']);
 assert.equal(result[4].screens[1].entryCount,2);
 const undecided=screenReviewQueue(data.graph,regions,state,{groupByRegion:true,onlyUndecided:true});
 assert.equal(undecided.some(group=>group.screens.some(item=>item.screenId==='no-route')),false);
 assert.ok(undecided.every(group=>group.regionName));
});
