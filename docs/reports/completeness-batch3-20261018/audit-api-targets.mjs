/** Independent source Block traversal: expected literal Ajax config, then backend source mapping.
 * No product analyzer import and no target execution. Source cohort is frozen in baseline.json. */
import {parse} from '../../../screentrace-js/node_modules/acorn/dist/acorn.mjs';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=process.env.ST_BATCH3_OUTPUT??path.join(root,'analyze/completeness-batch3-fixed-20261018');
const census=JSON.parse(await readFile(path.join(here,'source-census.json'))),units=JSON.parse(await readFile('/private/tmp/screentrace-batch3-20261018/js-inputs.json')),expected=[],results=[];
const children=n=>Object.values(n??{}).flatMap(v=>Array.isArray(v)?v.filter(x=>x?.type):v?.type?[v]:[]),name=n=>n?.type==='Identifier'?n.name:n?.type==='MemberExpression'&&!n.computed?name(n.object)+'.'+n.property.name:'';
const property=(o,k)=>o?.type==='ObjectExpression'?o.properties.find(p=>(p.key?.name??p.key?.value)===k)?.value:undefined;
for(const unit of units){const ast=parse(unit.code,{ecmaVersion:'latest',locations:true,allowReturnOutsideFunction:true});
 function visit(n,scope){if(!n?.type)return;if(n.type==='Program'||n.type==='BlockStatement'){const env=new Map(scope);for(const st of n.body){if(st.type==='VariableDeclaration')for(const d of st.declarations)if(d.id.type==='Identifier')env.set(d.id.name,d.init);if(st.type==='ExpressionStatement'&&st.expression.type==='AssignmentExpression'&&st.expression.left.type==='Identifier')env.set(st.expression.left.name,st.expression.right);visit(st,env);}return;}
 if(n.type==='CallExpression'&&['$.ajax','jQuery.ajax'].includes(name(n.callee))){let config=n.arguments[0];if(config?.type==='Identifier')config=scope.get(config.name);const url=property(config,'url'),method=property(config,'method')??property(config,'type');expected.push({project:unit.project,file:unit.file,line:unit.line+n.loc.start.line-1,url:url?.type==='Literal'?url.value:null,method:method?.type==='Literal'?String(method.value).toUpperCase():'GET'});}
 for(const child of children(n))visit(child,new Map(scope));}
 visit(ast,new Map());}
for(const item of expected){const c=census[item.project],g=JSON.parse(await readFile(path.join(out,item.project,'application-graph.json'))),route=item.url?new URL(item.url,'https://source.invalid/').pathname:null;
 const declared=[...c.java.filter(r=>r.kind==='endpoint'&&r.path===route&&[item.method,'ANY'].includes(r.httpMethod)),...c.struts.filter(r=>r.path+'.do'===route)];
 const ids=g.nodes.filter(n=>n.type==='ENDPOINT'&&declared.some(r=>r.file===n.source?.file&&r.line===n.source?.line)).map(n=>n.id);
 const calls=g.behaviors.filter(b=>b.type==='CALL_API'&&b.evidence.some(e=>e.parser==='AcornStaticAnalyzer'&&e.source.file===item.file&&e.source.line===item.line));
 const resolved=calls.filter(b=>ids.includes(b.targetId)).length;
 results.push({...item,expectedRoute:route,sourceHandlers:declared,behaviorCount:calls.length,resolvedBehaviorCount:resolved,result:!item.url?'SOURCE_EXPECTATION_UNRESOLVED':!declared.length?'SOURCE_NO_DECLARED_HANDLER':calls.length&&resolved===calls.length?'PASS':'FAIL'});
}
const target=process.env.ST_API_RESULTS??path.join(here,'after/api-target-results.json');await writeFile(target,JSON.stringify({expectations:expected,results},null,2)+'\n');console.log(JSON.stringify({sourceCalls:expected.length,counts:results.reduce((a,r)=>(a[r.result]=(a[r.result]??0)+1,a),{}),failures:results.filter(r=>r.result!=='PASS').map(r=>({project:r.project,file:r.file,line:r.line,url:r.url,result:r.result}))},null,2));
process.exitCode=results.some(r=>r.result==='FAIL'||r.result==='SOURCE_EXPECTATION_UNRESOLVED')?1:0;
