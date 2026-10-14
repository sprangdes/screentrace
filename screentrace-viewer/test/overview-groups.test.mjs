import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';

const node=(id,type,name,attributes={})=>({id,type,name,attributes,confidence:'CONFIRMED'});
/** Screens with the given routes; `links` are [fromRoute, toRoute] pairs, each through its own link component. */
async function app(routes,links){
 const map=await ownModule('map'),nodes=[],relationships=[];
 routes.forEach((route,i)=>nodes.push(node(`s${i}`,'SCREEN',`s${i}`,{route})));
 const id=route=>`s${routes.indexOf(route)}`;
 links.forEach(([from,to],i)=>{const c=`c${i}`;nodes.push(node(c,'COMPONENT',c,{kind:'LINK',target:to}));relationships.push({id:'own'+i,type:'CONTAINS',from:id(from),to:c,confidence:'CONFIRMED'},{id:'nav'+i,type:'NAVIGATES_TO',from:c,to:id(to),confidence:'CONFIRMED'});});
 return map.indexGraph({schemaVersion:'2.2',application:{name:'a',path:'.',technologies:[]},nodes,relationships,behaviors:[],apiContracts:[],validationRules:[]});
}
const ROUTES=['/shop','/shop/cart','/shop/item/:id','/admin','/admin/users','/admin/users/{id}','/report/daily','/report/monthly','/login','/help','/about','/terms','/faq'];

test('areas follow the first URL segment, pool single screens into 其他 and skip a shared context path',async()=>{
 const groups=await ownModule('groups'),index=await app(ROUTES,[]),areas=groups.screenGroups(index);
 assert.equal(areas.get('s1'),'/shop');assert.equal(areas.get('s5'),'/admin');assert.equal(areas.get('s7'),'/report');
 for(const id of ['s8','s9','s10','s11','s12'])assert.equal(areas.get(id),groups.OTHER_GROUP);
 const prefixed=await app(ROUTES.map(r=>'/app'+r),[]);
 assert.equal(groups.screenGroups(prefixed).get('s1'),'/app/shop');
 assert.equal(groups.screenGroups(await app(ROUTES.slice(0,12),[])),undefined,'twelve screens or fewer keep one layout');
 assert.equal(groups.screenGroups(await app(['/a','/b','/c','/d','/e','/f','/g','/h','/i','/j','/k','/l','/m/1','/m/2'],[])),undefined,'one real area is no grouping');
});

test('links between areas are bundled, counted and routed around every other area',async()=>{
 const groups=await ownModule('groups'),links=[['/shop','/admin'],['/shop/cart','/admin/users'],['/admin','/report/daily'],['/report/monthly','/shop'],['/login','/report/daily'],['/shop','/shop/cart'],['/help','/admin']];
 const index=await app(ROUTES,links),layout=groups.groupedLayout(index);
 const pair=layout.links.find(l=>l.from==='/shop'&&l.to==='/admin');
 assert.equal(pair.relations.length,2,'two screen links bundled into one area link');
 assert.equal(layout.cross.length,6);
 assert.ok(layout.routes.some(r=>r.relation.from==='s0'&&r.relation.to==='s1'),'links inside an area keep their own route');
 const inside=(p,box)=>p.x>box.x+1&&p.x<box.x+box.width-1&&p.y>box.y+1&&p.y<box.y+box.height-1;
 for(const link of layout.links){
  for(const box of layout.groups.filter(g=>g.key!==link.from&&g.key!==link.to).map(g=>g.box))
   for(let i=1;i<link.points.length;i++){const a=link.points[i-1],b=link.points[i];for(let t=0;t<=20;t++)assert.ok(!inside({x:a.x+(b.x-a.x)*t/20,y:a.y+(b.y-a.y)*t/20},box),`${link.from}→${link.to} crosses an area`);}
 }
 assert.deepEqual(groups.groupedLayout(index),layout,'deterministic');
});
