import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture,node} from './fixture.mjs';

test('confirmation targets have deterministic region, screen, component order and advance past completed decisions',async()=>{
 const {orderedReviewTargets,nextUndecidedTarget,targetKey}=await ownModule('confirmation-workflow');
 const data=fixture();data.graph.nodes.push(node('c','SCREEN','丙'),node('zbutton','COMPONENT','Z',{kind:'BUTTON'}),node('abutton','COMPONENT','A',{kind:'BUTTON'}));
 data.graph.relationships.push({id:'owner-z',type:'CONTAINS',from:'a',to:'zbutton'},{id:'owner-a',type:'CONTAINS',from:'a',to:'abutton'});
 const regions=[{key:'z',name:'Zulu',basis:'',strategy:'url',screenIds:['b']},{key:'a',name:'Alpha',basis:'',strategy:'url',screenIds:['c','a']}];
 const targets=orderedReviewTargets(data.graph,regions);
 assert.deepEqual(targets.map(targetKey),['a:','a:abutton','a:shared','a:zbutton','c:','b:','b:shared']);
 const state={screenDecisions:{a:'REMOVE'},componentDecisions:{a:{abutton:'KEEP',shared:'KEEP'}}};
 assert.equal(targetKey(nextUndecidedTarget(targets,state,targets[0])),'a:zbutton');
 const complete={screenDecisions:{a:'REMOVE',b:'KEEP',c:'KEEP'},componentDecisions:{a:{abutton:'KEEP',shared:'KEEP',zbutton:'REMOVE'},b:{shared:'KEEP'}}};
 assert.equal(nextUndecidedTarget(targets,complete,targets[0]),undefined);
 assert.equal(nextUndecidedTarget(targets,complete),undefined);
});
