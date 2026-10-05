import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
test('preview match basis accepts only known values and validates every anchor candidate',async()=>{
 const m=await ownModule('contracts'),graph={schemaVersion:'2.2',nodes:[{id:'a',type:'COMPONENT',attributes:{expansionAnchor:'page.jsp:1'}},{id:'b',type:'COMPONENT',attributes:{expansionAnchor:'page.jsp:1'}}],relationships:['a','b'].map(to=>({type:'CONTAINS',from:'screen',to}))};
 const item={graphScreenId:'screen',expansionAnchor:'page.jsp:1',matchBasis:'ANCHOR',graphComponentCandidates:['a','b'],graphComponentId:null,componentResolution:'AMBIGUOUS'};
 assert.equal(m.requirePreview({elements:[item]},graph).elements[0],item);
 assert.throws(()=>m.requirePreview({elements:[{...item,matchBasis:'GUESSED'}]},graph),/matchBasis/);
 assert.throws(()=>m.requirePreview({elements:[{...item,expansionAnchor:'wrong'}]},graph),/anchor/);
 assert.throws(()=>m.requirePreview({elements:[{...item,graphComponentCandidates:['a']}]},graph),/anchor/);
 assert.equal(m.requirePreview({elements:[{...item,matchBasis:'HEURISTIC'}]},graph).elements.length,1);
 assert.equal(m.requirePreview({elements:[{path:'body',componentResolution:'UNRESOLVED'}]},graph).elements.length,1);
});
