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
