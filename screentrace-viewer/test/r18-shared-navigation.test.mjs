import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {commonNavigation} from './common-navigation-fixture.mjs';
test('R18 shared navigation lists the screens tied only through header/footer links, each way, with their link labels',async()=>{
 const map=await ownModule('map'),r=await ownModule('relations'),index=map.indexGraph(commonNavigation().graph);
 const d=r.sharedNavigation(index,'d');
 assert.deepEqual(d.into,['b','c'],'a also reaches d through a page flow, so it is drawn as a normal line');
 assert.ok(d.intoLabels.some(label=>label.includes('Home')));
 assert.deepEqual(r.sharedNavigation(index,'b').out,['d']);assert.deepEqual(r.sharedNavigation(index,'a').out,[]);
 assert.deepEqual(r.sharedNavigation(index,'d',false).intoLabels,[]);
});
