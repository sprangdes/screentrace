import test from 'node:test';import assert from 'node:assert/strict';import {expandGraphFragments} from './template-fragments.mjs';
test('graph-proven named fragment projects literal parameters and preserves its original source line',async()=>{
 const text='<html>\n<body>\n<nav th:fragment="nav(show)"><li th:if="${show == \'yes\'}"><a>Link</a></li></nav>\n</body></html>',start=text.indexOf('<nav'),end=text.indexOf('</nav>')+6,screen={id:'s',attributes:{templateFragments:JSON.stringify([{ownerFile:'page.html',line:1,file:'parts.html',fragment:'nav',start,end,startLine:3,parameters:{show:'no'}}])}};
 const result=await expandGraphFragments('<div th:replace="parts :: nav(\'no\')"></div>','page.html',screen,{nodes:[],relationships:[]},async()=>text);assert.match(result,/<li[^>]*hidden/);assert.match(result,/data-st-source-line="3"/);assert.doesNotMatch(result,/<html>/);
 const untouched=await expandGraphFragments('<div th:replace="dynamic"></div>','other.html',screen,{nodes:[],relationships:[]},async()=>{throw Error('must not read');});assert.equal(untouched,'<div th:replace="dynamic"></div>');
});
