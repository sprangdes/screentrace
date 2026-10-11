import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {ownModule} from './module.mjs';import {fixture} from './fixture.mjs';
test('WP29 mapped reasons share simulation decisions, including event filtering and data-only navigation',async()=>{
 const m=await ownModule('simulation'),vectors=JSON.parse(await readFile(new URL('../../fixtures/r7/coverage/mapped-reasons.json',import.meta.url)));
 for(const v of vectors.cases){const p=fixture(),record={graphComponentId:'shared',componentResolution:'INFERRED'};
 p.graph.behaviors=v.type?[{id:'test',triggerId:'shared',type:v.type,event:v.event,targetId:v.target,evidence:[{parser:'Fixture',resolution:v.resolution,detail:v.resolution==='AMBIGUOUS'?'候選：[missing1, missing2]':''}]}]:[];
 const intent={tag:v.tag,valid:true},actual=m.assessSimulation(p,'a',record,intent);
 assert.deepEqual(actual.effect,m.simulate(p,'a',record,intent),v.name);assert.equal(actual.possible,m.canSimulate(actual.effect),v.name);assert.equal(actual.reason??null,v.reason,v.name);
 if(v.reason)assert.doesNotMatch(m.simulationReasonText(v.reason),/NO_KNOWN|UNRESOLVED|UNSUPPORTED|AMBIGUOUS/);
 }
});
test('WP29 unresolved component reasons cannot classify a uniquely mapped component',async()=>{
 const m=await ownModule('contracts'),graph={schemaVersion:'2.2',nodes:[],relationships:[]};
 for(const unmappedReason of ['NO_GRAPH_COMPONENT','AMBIGUOUS_CANDIDATES','ANCHOR_MISSING','DYNAMIC_OR_UNRESOLVED_SOURCE','OTHER'])assert.equal(m.requirePreview({elements:[{tag:'a',componentResolution:unmappedReason==='AMBIGUOUS_CANDIDATES'?'AMBIGUOUS':'UNRESOLVED',unmappedReason}]},graph).elements[0].unmappedReason,unmappedReason);
 assert.throws(()=>m.requirePreview({elements:[{tag:'a',componentResolution:'UNRESOLVED',unmappedReason:'UNKNOWN'}]},graph),/unmappedReason/);
 assert.throws(()=>m.requirePreview({elements:[{tag:'a',graphComponentId:'c',componentResolution:'INFERRED',unmappedReason:'OTHER'}]},graph),/unmappedReason/);
 assert.throws(()=>m.requirePreview({elements:[{tag:'div',componentResolution:'UNRESOLVED',unmappedReason:'OTHER'}]},graph),/unmappedReason/);
});
