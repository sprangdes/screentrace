import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {flowFixture} from './wp23-fixture.mjs';import {checkRoutes} from './overview-routes.mjs';
const layoutOf=async(ids,edges)=>{const map=await ownModule('map'),m=await ownModule('overview');return m.flowLayout(map.indexGraph(flowFixture(ids,edges).graph));};
const route=(layout,from,to)=>layout.routes.find(r=>r.relation.from===from&&r.relation.to===to).points;
const bends=points=>points.length-2;

test('R18 forward flows leave the right side and enter the left side, straight when the row between is free',async()=>{
 const layout=await layoutOf(['a','b','c'],[['a','b'],['b','c']]),[a,b,c]=['a','b','c'].map(id=>layout.positions.get(id));
 assert.equal(a.y,b.y);assert.equal(b.y,c.y,'a chain stays on one row');
 const ab=route(layout,'a','b');
 assert.equal(bends(ab),0);assert.equal(ab[0].x,a.x+250);assert.equal(ab.at(-1).x,b.x);assert.equal(ab[0].y,ab.at(-1).y);
 checkRoutes(layout);
});

test('R18 a card lines up with its predecessor, and flows to another row bend only in the channel between them',async()=>{
 const layout=await layoutOf(['a','b','c'],[['a','b'],['a','c']]),[a,b,c]=['a','b','c'].map(id=>layout.positions.get(id));
 assert.equal(b.x,c.x);assert.notEqual(b.y,c.y);assert.ok([b.y,c.y].includes(a.y),'one child stays on its parent row');
 for(const to of ['b','c']){const points=route(layout,'a',to);assert.ok(bends(points)<=2,`a->${to} bends ${bends(points)} times`);if(bends(points)===2)assert.ok(points[1].x>a.x+250&&points[1].x<b.x,'the bend sits in the channel');}
 checkRoutes(layout);
});

test('R18 flows back to an earlier column loop below the row, and self loops return into the bottom',async()=>{
 const layout=await layoutOf(['a','b'],[['a','b'],['b','a'],['a','a']]),a=layout.positions.get('a'),b=layout.positions.get('b');
 const back=route(layout,'b','a');
 assert.equal(back[0].y,b.y+220);assert.equal(back.at(-1).y,a.y+220);assert.equal(bends(back),2);assert.ok(back[1].y>a.y+220);
 const self=route(layout,'a','a');
 assert.equal(self[0].x,a.x+250);assert.equal(self.at(-1).y,a.y+220);
 checkRoutes(layout);
});

test('R18 lines sharing a channel or gutter get their own tracks and the gap widens to hold them',async()=>{
 const ids=['a','b','c','d','e','f'],edges=ids.flatMap(from=>ids.map(to=>[from,to])),layout=await layoutOf(ids,edges);
 checkRoutes(layout);
 const columns=[...new Set([...layout.positions.values()].map(p=>p.x))].sort((p,q)=>p-q);
 assert.ok(columns.slice(1).some((x,i)=>x-columns[i]>340),'a busy channel is wider than the default');
});

test('R18 rounded paths keep the route ends and turn with a short curve',async()=>{
 const m=await ownModule('overview'),d=m.roundedPath([{x:0,y:0},{x:100,y:0},{x:100,y:50}]);
 assert.equal(d,'M0,0 L94,0 Q100,0 100,6 L100,50');
 assert.equal(m.roundedPath([{x:0,y:0},{x:4,y:0},{x:4,y:4}]),'M0,0 L2,0 Q4,0 4,2 L4,4');
});
