import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,node} from './fixture.mjs';
import {ownModule} from './module.mjs';

test('WP45 classifies each screen from proven inbound entries, auto redirect and route evidence',async()=>{
 const {classifyScreenEntry}=await ownModule('inventory');
 const data=fixture();
 data.graph.relationships.find(edge=>edge.id==='3').confidence='CONFIRMED';
 data.graph.nodes.push(
  node('no-entry','SCREEN','沒有入口',{}),
  node('auto','SCREEN','自動導向',{autoRedirect:'LOGIN_PAGE'}),
  node('inferred','SCREEN','推定入口',{route:'/inferred'}),
  node('confirmed','SCREEN','確定入口',{route:'/confirmed'}),
  node('mixed','SCREEN','混合入口',{route:'/mixed'}),
  node('source','SCREEN','來源畫面',{route:'/source'}),
  node('global','COMPONENT','全站導覽',{kind:'LINK'}),
  node('self-link','COMPONENT','自連結',{kind:'LINK'})
 );
 data.graph.relationships.push(
  {id:'to-inferred',type:'NAVIGATES_TO',from:'shared',to:'inferred',confidence:'INFERRED',evidence:[{source:{file:'a.jsp',line:2},parser:'test',resolution:'INFERRED'}]},
  {id:'to-confirmed',type:'NAVIGATES_TO',from:'shared',to:'confirmed',confidence:'CONFIRMED',evidence:[{source:{file:'b.jsp',line:3},parser:'test',resolution:'CONFIRMED'}]},
  {id:'to-mixed-inferred',type:'NAVIGATES_TO',from:'shared',to:'mixed',confidence:'INFERRED'},
  {id:'to-mixed-confirmed',type:'NAVIGATES_TO',from:'shared',to:'mixed',confidence:'CONFIRMED'},
  {id:'global-owner-a',type:'CONTAINS',from:'source',to:'global',confidence:'CONFIRMED'},
  {id:'global-owner-b',type:'CONTAINS',from:'b',to:'global',confidence:'CONFIRMED'},
  {id:'global-entry',type:'NAVIGATES_TO',from:'global',to:'a',confidence:'CONFIRMED'},
  {id:'self-owner',type:'CONTAINS',from:'no-entry',to:'self-link',confidence:'CONFIRMED'},
  {id:'self-entry',type:'NAVIGATES_TO',from:'self-link',to:'no-entry',confidence:'CONFIRMED'}
 );
 const result=classifyScreenEntry(data.graph);
 assert.deepEqual([...result].map(([id,value])=>[id,value.classification]),[
  ['a','HAS_ENTRY'],['auto','AUTO_REDIRECT'],['b','HAS_ENTRY'],['confirmed','HAS_ENTRY'],
  ['inferred','INFERRED_ENTRY'],['mixed','HAS_ENTRY'],['no-entry','NO_ENTRY'],['source','ROUTE_ONLY']
 ]);
 assert.equal(result.get('a').entries.length,2,'global navigation and shared cross-screen links count as entries');
 assert.equal(result.get('no-entry').entries.length,0,'self links do not count as incoming entries');
 assert.deepEqual(result.get('inferred').entries[0].evidence[0].source,{file:'a.jsp',line:2});
});

test('WP45 classifies entry confidence from URL acquisition evidence, not relationship confidence',async()=>{
 const {classifyScreenEntry}=await ownModule('inventory');
 const data=fixture();
 data.graph.nodes.push(node('static-target','SCREEN','靜態網址入口',{route:'/static'}),node('template-target','SCREEN','樣板推定入口',{route:'/template/{id}'}));
 data.graph.relationships.push(
  {id:'static-entry',type:'NAVIGATES_TO',from:'shared',to:'static-target',confidence:'INFERRED',evidence:[{source:{file:'static.jsp',line:4},parser:'UrlResolution',resolution:'INFERRED',detail:'靜態網址解析'}]},
  {id:'template-entry',type:'NAVIGATES_TO',from:'shared',to:'template-target',confidence:'INFERRED',evidence:[{source:{file:'template.jsp',line:8},parser:'RouteTemplateInference',resolution:'INFERRED',detail:'路由樣板推定'}]}
 );
 const result=classifyScreenEntry(data.graph);
 assert.equal(result.get('static-target').classification,'HAS_ENTRY');
 assert.equal(result.get('template-target').classification,'INFERRED_ENTRY');
});

test('Struts wildcard callers retain STATIC_URL basis from their explicit source evidence',async()=>{
 const {apiSourceBasis}=await ownModule('inventory');
 const data=fixture();data.graph.nodes.push(node('wildcard-endpoint','ENDPOINT','ANY /Edit*.do',{path:'/Edit*.do'}));
 data.graph.relationships.push({id:'struts-static-caller',type:'TRIGGERS',from:'shared',to:'wildcard-endpoint',confidence:'CONFIRMED',evidence:[{source:{file:'Menu.jsp',line:30},parser:'StrutsProjectAnalyzer',resolution:'CONFIRMED',detail:'basis=STATIC_URL；萬用字元=/Edit*；實際路徑=/EditRegistration'}]});
 assert.equal(apiSourceBasis(data.graph,'wildcard-endpoint'),'STATIC_URL');
});
