import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

function basisFixture(){
 const data=fixture();
 data.graph.nodes=data.graph.nodes.filter(item=>item.type!=='ENDPOINT');
 data.graph.relationships=data.graph.relationships.filter(edge=>!['ep','unused'].includes(edge.to));
 const endpoints=[
  node('js-static','ENDPOINT','JS 常值 API',{path:'/api/literal',method:'GET',category:'REST_API'}),
  node('js-template','ENDPOINT','JS 樣板 API',{path:'/api/items/{itemId}',method:'GET',category:'REST_API'}),
  node('jsp-static','ENDPOINT','JSP 靜態 API',{path:'/api/jsp',method:'GET',category:'REST_API'}),
  node('not-called','ENDPOINT','無呼叫來源 API',{path:'/api/unused',method:'GET',category:'REST_API'})
 ];
 data.graph.nodes.push(...endpoints);
 const addCaller=(id,label,endpoint,relationship,evidence,attributes={})=>{
  data.graph.nodes.push(node(id,'COMPONENT',label,{kind:'LINK',...attributes}));
  data.graph.relationships.push({id:`contains-${id}`,type:'CONTAINS',from:'a',to:id});
  data.graph.relationships.push({id:`calls-${id}`,type:relationship,from:id,to:endpoint,confidence:'INFERRED',evidence});
 };
 addCaller('js-literal-caller','JS 常值呼叫','js-static','CALLS',[{parser:'AcornStaticAnalyzer',resolution:'CONFIRMED',source:{file:'web/controller.js',line:3},detail:JSON.stringify({expression:"$http.get('/api/literal')",url:'/api/literal',status:'CONFIRMED'})}]);
 addCaller('js-template-caller','JS 串接呼叫','js-template','CALLS',[
  {parser:'AcornStaticAnalyzer',resolution:'INFERRED',source:{file:'web/controller.js',line:8},detail:JSON.stringify({expression:"$http.get('/api/items/' + itemId)",url:'/api/items/{itemId}',status:'INFERRED'})},
  {parser:'UrlResolution',resolution:'CONFIRMED',source:{file:'workspace:config.json',line:4},detail:'設定鍵=contextPaths；候選值=[/example]；採用值=/example'}
 ]);
 addCaller('jsp-static-caller','JSP 靜態連結','jsp-static','TRIGGERS',[{parser:'UrlResolution',resolution:'CONFIRMED',source:{file:'web/page.jsp',line:12},detail:'靜態網址=/api/jsp'}],{target:'/api/jsp',targetStatus:'CONFIRMED'});
 return data;
}

test('R14 API source basis distinguishes literal JS/JSP sources from JS concatenation',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(await fileFixture(basisFixture()));await page.locator('#app[data-ready=true]').waitFor();
  const inferredHome=Number((await page.locator('[data-inferred-api-link]').innerText()).match(/另有 (\d+) 個 API/)[1]);
  assert.equal(inferredHome,1,'only the concatenated JS request is template inference');
  await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  const filters=page.locator('.api-state-filters');
  for(const [id,state]of [['js-static','使用中'],['js-template','推定使用中'],['jsp-static','使用中']])assert.match(await page.locator(`[data-api-row="${id}"]`).innerText(),new RegExp(state),id);
  for(const [key,count]of [['IN_USE',2],['INFERRED_USAGE',1],['UNREFERENCED',1],['REMOVABLE',0]]){
   const value=await filters.locator(`[data-api-filter="${key}"]`).innerText();
   assert.equal(Number(value.match(/(\d+)/)[1]),count,key);
  }
 }finally{await browser.close();}
});
