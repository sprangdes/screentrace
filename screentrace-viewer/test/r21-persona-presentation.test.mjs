import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
const source={file:'workspace:config.json',line:1};
const screen=(id,route)=>({id,type:'SCREEN',name:id,attributes:{route},confidence:'CONFIRMED'});
// s1 (step 1) leads to s2 and s3 (step 2); s3 also links back to s1; s4 is never reached; s5 does not apply.
function graph(){
 const steps=[{from:'entry:root',to:'s1',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'s1',to:'s2',kind:'NAVIGATE',behaviorId:'b1',status:'APPLIES'},{from:'s1',to:'s3',kind:'NAVIGATE',behaviorId:'b2',status:'UNKNOWN'},{from:'s3',to:'s1',kind:'NAVIGATE',behaviorId:'b3',status:'APPLIES'}];
 const member={id:'member',name:'會員',description:'已登入的一般會員',facts:[{text:'user',truth:true,source},{text:'admin',truth:false,source}],startPaths:['/'],screens:{s1:'APPLIES',s2:'APPLIES',s3:'UNKNOWN',s4:'APPLIES',s5:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'s1',reach:'REACHABLE',depth:1},{screenId:'s2',reach:'REACHABLE',depth:2},{screenId:'s3',reach:'POSSIBLE',depth:2}],unreached:['s4'],steps,unevaluatedNavigations:1}};
 const guest={id:'guest',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{s1:'APPLIES',s2:'EXCLUDED',s3:'EXCLUDED',s4:'APPLIES',s5:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'s1',reach:'REACHABLE',depth:1}],unreached:['s4'],steps:[steps[0]],unevaluatedNavigations:0}};
 return {schemaVersion:'2.4',application:{name:'sample',personas:[member,guest]},nodes:[screen('s1','/'),screen('s2','/a'),screen('s3','/b'),screen('s4','/c'),screen('s5','/d')],relationships:[],behaviors:[]};
}
const load=async()=>{const p=await ownModule('personas'),m=await ownModule('map'),g=graph(),index=m.indexGraph(g);return {p,index,views:p.graphPersonas(g).map(x=>p.personaView(index,x))};};

test('R21 plain words: reach labels, description with a fallback, and the short summary',async()=>{
 const {p,views:[member,guest]}=await load();
 assert.deepEqual(p.reachLabel,{REACHABLE:'會走到',POSSIBLE:'可能走到',UNREACHED:'走不到',EXCLUDED:'不適用'});
 assert.equal(p.personaDescription(member.persona),'已登入的一般會員');
 assert.equal(p.personaDescription(guest.persona),'依 1 個條件判定');
 assert.equal(p.reachSummary(member),'會走到 2 · 可能走到 1');
 assert.equal(p.reachText(member,'s3'),'可能走到 · 第 2 步');
});

test('R21 the flow map has one column per step, then unreached and excluded, with only step-to-next-step lines',async()=>{
 const {p,index,views:[member]}=await load();
 const layout=p.personaLayout(index,member);
 assert.deepEqual(layout.groups.map(g=>[g.key,g.label,g.members]),[['step-1','第 1 步 · 1 個畫面',['s1']],['step-2','第 2 步 · 2 個畫面',['s2','s3']],['unreached','走不到 · 1 個畫面',['s4']],['excluded','不適用 · 1 個畫面',['s5']]]);
 assert.equal(layout.positions.size,5);
 const x=id=>layout.positions.get(id).x,y=id=>layout.positions.get(id).y;
 assert.ok(x('s1')<x('s2')&&x('s2')===x('s3')&&x('s3')<x('s4')&&x('s4')<x('s5'));
 assert.ok(y('s2')<y('s3'),'the certain screen comes first when both follow the same screen');
 assert.deepEqual(layout.routes.map(r=>[r.relation.from,r.relation.to]),[['s1','s2'],['s1','s3']]);
 for(const route of layout.routes){const first=route.points[0],last=route.points.at(-1);assert.equal(first.x,x('s1')+250);assert.equal(last.x,x(route.relation.to));}
 assert.equal(layout.routes[0].points.length,2,'a line between screens on the same row is straight');assert.equal(layout.routes[1].points.length,4,'a line to another row bends once in the gap');
 assert.deepEqual(layout.links,[]);assert.deepEqual(layout.cross,[]);
 assert.deepEqual(p.personaLayout(index,member),layout,'the layout is deterministic');
});

test('R21 the comparison orders rows by step',async()=>{
 const {index,views}=await load(),page=await ownModule('persona-page');
 assert.deepEqual(page.comparisonOrder(index,views,['s5','s4','s3','s2','s1']),['s1','s2','s3','s4','s5']);
});

test('R21 steps count screens: a redirect through a URL entry is not a step, and the flow map still draws that move',async()=>{
 const p=await ownModule('personas'),m=await ownModule('map');
 // s1 → (NAVIGATE to entry:x, which RENDERS s2) → s2: the analysis puts s2 at depth 3; on screen it is step 2.
 const steps=[{from:'entry:root',to:'s1',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'s1',to:'entry:x',kind:'NAVIGATE',behaviorId:'b1',status:'APPLIES'},{from:'entry:x',to:'s2',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'s1',to:'entry:y',kind:'NAVIGATE',behaviorId:'b2',status:'UNKNOWN'},{from:'entry:y',to:'s3',kind:'RENDERS',behaviorId:null,status:'APPLIES'}];
 const persona={id:'member',name:'會員',facts:[],startPaths:['/'],screens:{s1:'APPLIES',s2:'APPLIES',s3:'APPLIES'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'s1',reach:'REACHABLE',depth:1},{screenId:'s2',reach:'REACHABLE',depth:3},{screenId:'s3',reach:'POSSIBLE',depth:3}],unreached:[],steps,unevaluatedNavigations:0}};
 const g={schemaVersion:'2.4',application:{name:'sample',personas:[persona]},nodes:[screen('s1','/'),screen('s2','/a'),screen('s3','/b')],relationships:[],behaviors:[]};
 const index=m.indexGraph(g),view=p.personaView(index,p.graphPersonas(g)[0]);
 assert.deepEqual(Object.fromEntries(view.depth),{s1:1,s2:2,s3:2});
 assert.equal(view.lines.size,0,'the overview still draws no line through a URL entry');
 assert.deepEqual(Object.fromEntries(view.hops),{[p.lineKey('s1','s2')]:'APPLIES',[p.lineKey('s1','s3')]:'UNKNOWN'});
 const layout=p.personaLayout(index,view);
 assert.deepEqual(layout.groups.map(x=>x.key),['step-1','step-2']);
 assert.deepEqual(layout.routes.map(r=>[r.relation.from,r.relation.to]),[['s1','s2'],['s1','s3']]);
});
