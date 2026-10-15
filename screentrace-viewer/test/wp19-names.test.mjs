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
test('preview sample text never becomes a screen name',async()=>{
 const m=await ownModule('names'),screen=node('react','SCREEN','login',{view:'LoginPage'}),hints=new Map([[screen.id,{heading:'示例值'}]]);
 assert.equal(m.screenNames([screen],hints,new Map([[screen.id,['/login']]])).get(screen.id),'Login Page');
});
test('screens sharing a page heading keep it, told apart by route; layout headings shared widely do not',async()=>{
 const m=await ownModule('names'),screens=['today','pending','all'].map(id=>node(id,'SCREEN',id,{view:'ReservationCenterRoute'})),hints=new Map(screens.map(s=>[s.id,{heading:'預約中心'}])),routes=new Map([['today',['/reservation/today']],['pending',['/reservation/pending']],['all',['/reservation']]]);
 const names=m.screenNames(screens,hints,routes);assert.equal(names.get('today'),'預約中心（/reservation/today）');assert.equal(new Set(names.values()).size,3);
 const many=Array.from({length:6},(_,i)=>node('p'+i,'SCREEN','p'+i,{view:`web/page${i}.jsp`})),layout=new Map(many.map(s=>[s.id,{heading:'PetClinic'}]));
 assert.ok([...m.screenNames(many,layout,new Map()).values()].every(name=>name.startsWith('Page')));
});
test('a route that only redirects is named after its destination',async()=>{
 const m=await ownModule('names'),home=node('home','SCREEN','home',{view:'Home'}),old=node('old','SCREEN','old',{view:'Old',redirectTargets:'home'}),any=node('any','SCREEN','any',{view:'Route',redirectTargets:'home'}),lost=node('lost','SCREEN','lost',{view:'Route',redirectTargets:''});
 const names=m.screenNames([home,old,any,lost],new Map([['home',{heading:'營運概覽'}]]),new Map([['home',['/']],['old',['/old']],['any',['/*']],['lost',['/lost']]]));
 assert.equal(names.get('old'),'轉址到「營運概覽」');assert.equal(names.get('any'),'其他網址轉址到「營運概覽」');assert.equal(names.get('lost'),'轉址頁');
});
