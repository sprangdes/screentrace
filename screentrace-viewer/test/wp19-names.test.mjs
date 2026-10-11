import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {node} from './fixture.mjs';
test('WP19 duplicate view basenames append routes and still identical names get deterministic suffixes',async()=>{
 const m=await ownModule('names');const nodes=[node('a','SCREEN','old',{view:'web/a/ownerDetails.jsp'}),node('b','SCREEN','old',{view:'web/b/ownerDetails.jsp'}),node('c','SCREEN','old',{view:'web/c/ownerDetails.jsp'})];const routes=new Map([['a',['/owners/{id}']],['b',['/owners/new']],['c',['/owners/new']]]),hints=new Map(nodes.map(n=>[n.id,{title:'Shared'}]));
 const names=m.screenNames(nodes,hints,routes);assert.equal(names.get('a'),'Owner Details（/owners/{id}）');assert.equal(new Set(names.values()).size,3);assert.deepEqual([...names],[...m.screenNames([...nodes].reverse(),hints,routes)]);
});
test('R16 Tiles page names keep the definition-derived screen name ahead of shared layout document hints',async()=>{
 const m=await ownModule('names'),screen=node('tiles-page','SCREEN','Main Menu',{view:'src/main/webapp/layout.jsp',tilesDefinition:'true',tilesDefinitionName:'.mainMenu',screenNameSource:'Tiles definition name'}),hints=new Map([[screen.id,{title:'Shared Layout Title',heading:'Layout'}]]);
 assert.equal(m.screenNames([screen],hints,new Map([[screen.id,['/mainMenu.do']]])).get(screen.id),'Main Menu');
});
test('R16 duplicate Tiles labels use readable source context instead of numeric suffixes',async()=>{
 const m=await ownModule('names'),nodes=[node('first','SCREEN','Main Menu',{tilesDefinition:'true',view:'src/main/webapp/WEB-INF/views/first.jsp'}),node('second','SCREEN','Main Menu',{tilesDefinition:'true',view:'src/main/webapp/WEB-INF/views/second.jsp'})],hints=new Map(),routes=new Map([['first',['/menu.do']],['second',['/menu.do']]]);
 const names=m.screenNames(nodes,hints,routes);assert.equal(new Set(names.values()).size,2);assert.ok([...names.values()].every(name=>!/[（(]\d+[）)]$/.test(name)),[...names.values()].join('；'));
});
