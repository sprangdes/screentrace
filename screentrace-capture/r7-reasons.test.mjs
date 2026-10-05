import test from 'node:test';import assert from 'node:assert/strict';import * as m from './element-styles.mjs';
test('WP29 only unmapped operables receive one of the five evidence-based reasons',()=>{
 const base={tag:'a',componentResolution:'UNRESOLVED',graphComponentCandidates:[]};
 for(const [item,reason] of [[base,'NO_GRAPH_COMPONENT'],[{...base,componentResolution:'AMBIGUOUS',graphComponentCandidates:['a','b']},'AMBIGUOUS_CANDIDATES'],[{...base,source:{file:'part.tag',line:1}},'ANCHOR_MISSING'],[{...base,source:{file:'${unknown}',line:1}},'DYNAMIC_OR_UNRESOLVED_SOURCE'],[{...base,componentResolution:'unexpected'},'OTHER']])assert.equal(m.unmappedReason(item),reason);
 assert.equal(m.unmappedReason({...base,tag:'div'}),undefined);assert.equal(m.unmappedReason({...base,graphComponentId:'c',componentResolution:'INFERRED'}),undefined);
});
