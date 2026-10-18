import test from 'node:test';import assert from 'node:assert/strict';import {templatePreview} from './template-preview.mjs';
test('demo table markers bind only the graph-proven collection and primitive fields',()=>{
 const screen={attributes:{view:'list.jsp',simulationBindings:JSON.stringify([{operation:'readAll',model:'items',collection:'R',fields:['id','name']}])}};
 const result=templatePreview('<c:forEach var="row" items="${items}"><tr><td>${row.name}</td><td><a href="/edit/${row.id}">Edit</a></td></tr></c:forEach>',screen,[]);
 assert.match(result,/data-st-demo-row="R"/);assert.match(result,/data-st-demo-text="&#36;\{row.name}/);assert.match(result,/data-st-demo-attrs=/);
 assert.doesNotMatch(templatePreview('<c:forEach var="row" items="${unproven}"><tr><td>${row.name}</td></tr></c:forEach>',screen,[]),/data-st-demo-row/);
});
test('template URL projection comes from the graph, not evaluation of target template expressions',()=>{
 const screen={attributes:{view:'list.html'}},nodes=[{type:'COMPONENT',source:{file:'list.html',line:1},attributes:{tag:'a','th:href':'@{/items/{id}(id=${row.id})}',href:'/items/{id}'}}];
 assert.match(templatePreview('<a th:href="@{/items/{id}(id=${row.id})}">Open</a>',screen,nodes),/ href="\/items\/\{id}"/);
});

test('two template links on one source line keep their own graph-proven destinations',()=>{
 const screen={attributes:{view:'page.html'}},nodes=['/one','/two'].map(href=>({type:'COMPONENT',source:{file:'page.html',line:1},attributes:{tag:'a','th:href':'@{'+href+'}',href}}));
 const result=templatePreview('<a th:href="@{/one}">One</a><a th:href="@{/two}">Two</a>',screen,nodes);
 assert.match(result,/<a[^>]* href="\/one"[^>]*>One/);assert.match(result,/<a[^>]* href="\/two"[^>]*>Two/);
});
