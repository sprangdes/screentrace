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
test('Thymeleaf rows, text and select options use only graph-proven model fields',()=>{
 const screen={attributes:{view:'list.html',simulationBindings:JSON.stringify([{operation:'readAll',model:'items',collection:'R',fields:['code','name']}])}};
 const result=templatePreview('<table><tr th:each="row : ${items}"><td th:text="${row.name}">Name</td></tr></table><select><option th:each="row : ${items}" th:value="${row.code}" th:text="${row.name}">Example</option></select>',screen,[]);
 assert.equal((result.match(/data-st-demo-row="R"/g)||[]).length,2);assert.match(result,/data-st-demo-text="&#36;\{row.name}/);assert.match(result,/data-st-demo-attrs=/);
});
test('server model feedback markers require graph evidence and preserve request-scope keys',()=>{
 const nodes=[],screen={id:'form',attributes:{view:'form.jsp'}},edges=[{to:'form',evidence:[{parser:'SpringModelFeedback',resolution:'INFERRED',detail:JSON.stringify({version:1,values:{error:'Mismatch'}})}]}];
 assert.match(templatePreview('<b>${requestScope.error}</b>',screen,nodes,edges),/data-st-model-key="error"/);
 assert.doesNotMatch(templatePreview('<b>${requestScope.error}</b>',screen,nodes,[]),/data-st-model-key/);
});
test('string concatenated option labels keep proven fields while calls and numeric addition remain unresolved',()=>{
 const screen={attributes:{view:'list.html',simulationBindings:JSON.stringify([{operation:'readAll',model:'items',collection:'R',fields:['code','name']}])}};
 assert.match(templatePreview(`<option th:each="row : \${items}" th:text="\${row.code + ' - ' + row.name}">Example</option>`,screen,[]),/data-st-demo-parts=/);
 for(const expression of ["${row.code + row.name + 'x'}","${service.call()}","${row.unknown + 'x'}"]){assert.doesNotMatch(templatePreview(`<option th:each="row : \${items}" th:text="${expression}">Example</option>`,screen,[]),/data-st-demo-parts=/);}
});
test('request directories retain multiple bases and reject unknown path segments',async()=>{
 const {requestDirectories}=await import('./template-preview.mjs');const g={nodes:[{id:'e',type:'ENDPOINT',attributes:{httpMethod:'GET',path:'/app/home'}}],relationships:[{type:'HANDLED_BY',from:'e',to:'h'},{type:'RENDERS',from:'h',to:'s'}]};assert.deepEqual(requestDirectories(g,'s'),['/app/']);g.nodes.push({id:'other',type:'ENDPOINT',attributes:{httpMethod:'GET',path:'/other/home'}});g.relationships.push({type:'HANDLED_BY',from:'other',to:'h'});assert.deepEqual(requestDirectories(g,'s'),['/app/','/other/']);g.nodes[0].attributes.path='/app/{id}/home';assert.deepEqual(requestDirectories(g,'s'),[]);
});

test('public source aliases prove relative bases without exposing private templates',async()=>{
 const {requestDirectories}=await import('./template-preview.mjs');
 for(const [view,routeAliases,expected]of [['src/main/webapp/forms/input.jsp','/forms/input.jsp',['/forms/']],['src/main/webapp/forms/input.jsp','/start.do',[]],['src/main/webapp/WEB-INF/input.jsp','/WEB-INF/input.jsp',[]],['src/main/resources/templates/input.html','/input.html',[]]])assert.deepEqual(requestDirectories({nodes:[{id:'s',type:'SCREEN',attributes:{view,routeAliases}}],relationships:[]},'s'),expected);
});

test('model feedback for another destination cannot authorize a screen projection',()=>{
 const screen={id:'form',attributes:{view:'form.jsp'}},edges=[{to:'other',evidence:[{parser:'SpringModelFeedback',resolution:'INFERRED',detail:JSON.stringify({version:1,values:{error:'Other form error'}})}]}];
 assert.doesNotMatch(templatePreview('<b>${error}</b>',screen,[],edges),/data-st-model-key/);
});
test('stylesheet projections require a resource node with parser evidence',()=>{
 const source='<link rel="stylesheet" th:href="@{/css/local.css}">',screen={attributes:{view:'page.html'}},node={type:'SOURCE_ARTIFACT',source:{file:'page.html',line:1},attributes:{kind:'STATIC_RESOURCE_REFERENCE',tag:'link','th:href':'@{/css/local.css}',href:'/css/local.css'},evidence:[{parser:'StaticResourceParser',resolution:'INFERRED'}]};
 assert.match(templatePreview(source,screen,[node]),/ href="\/css\/local.css"/);assert.doesNotMatch(templatePreview(source,screen,[{...node,evidence:[]}]),/ href=/);
});
test('simple conditional feedback has an inert marker only with destination evidence',()=>{
 const source='<div th:if="${error}" th:text="${error}">Error</div>',screen={id:'s',attributes:{view:'page.html'}},edges=[{to:'s',evidence:[{parser:'SpringModelFeedback',resolution:'INFERRED',detail:JSON.stringify({version:1,values:{error:'Denied'}})}]}];
 assert.match(templatePreview(source,screen,[],edges),/data-st-model-if="error"/);assert.doesNotMatch(templatePreview(source,screen,[]),/data-st-model-if/);
});
test('submitted date markers require direct binding evidence and do not authorize nested relations',()=>{
 const screen={id:'s',attributes:{view:'result.html'}},edges=[{to:'s',evidence:[{parser:'SpringSubmittedModel',resolution:'INFERRED',detail:JSON.stringify({version:1,scope:'submitted-binding-demo',fields:{'record.date':'date'}})}]}];
 const source='<span th:text="${#temporals.format(record.date, \'dd-MM-yyyy\')}">Sample</span><span th:text="${record.guest.name}">Guest</span>';
 const projected=templatePreview(source,screen,[],edges);assert.match(projected,/data-st-submitted-key="record.date"/);assert.match(projected,/data-st-submitted-format="dd-MM-yyyy"/);assert.doesNotMatch(projected,/data-st-submitted-key="record.guest.name"/);assert.doesNotMatch(templatePreview(source,screen,[]),/data-st-submitted-key/);
});
