/** Independent Acorn syntax census; no target script evaluation or product analyzer calls. */
import {parse} from '../../../screentrace-js/node_modules/acorn/dist/acorn.mjs';import fs from 'node:fs/promises';
const units=JSON.parse(await fs.readFile('/private/tmp/screentrace-batch5-20261020/js-inputs.json')),rows=[],failures=[];
const name=n=>n?.type==='Identifier'?n.name:n?.type==='MemberExpression'&&!n.computed?[name(n.object),n.property.name].filter(Boolean).join('.'):'';
for(const unit of units){let ast;try{ast=parse(unit.code,{ecmaVersion:'latest',sourceType:'script',locations:true,allowReturnOutsideFunction:true});}catch(e){failures.push({project:unit.project,file:unit.file,line:unit.line+(e.loc?.line||1)-1,error:e.message});continue;}
 function walk(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'){
  const callee=name(n.callee),method=n.callee?.property?.name;let kind=null,url=null,httpMethod=null;
  if(['$.ajax','jQuery.ajax','fetch','axios','$.get','$.post','$.getJSON'].includes(callee)||callee.startsWith('axios.')){
   kind='request';const a=n.arguments[0];if(a?.type==='Literal')url=a.value;
   if(a?.type==='ObjectExpression'){const prop=k=>a.properties.find(p=>(p.key?.name||p.key?.value)===k)?.value;if(prop('url')?.type==='Literal')url=prop('url').value;httpMethod=prop('type')?.value||prop('method')?.value||'GET';}
   else httpMethod=callee.endsWith('.post')?'POST':'GET';
  }else if(['on','click','change','submit','addEventListener'].includes(method))kind='eventBinding';
  else if(['show','hide','toggle','modal','collapse','offcanvas','text','html','val','css','append','remove','empty','add','setAttribute','setItem'].includes(method)||['alert','confirm','prompt'].includes(callee))kind='uiCall';
  if(kind)rows.push({project:unit.project,file:unit.file,line:unit.line+(n.loc.start.line-1),kind,callee:callee||method,url,httpMethod,expression:unit.code.slice(n.start,n.end).slice(0,180)});
 }for(const [key,value] of Object.entries(n))if(!['loc','start','end'].includes(key))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 walk(ast);
}
await fs.writeFile(new URL('./js-census.json',import.meta.url),JSON.stringify({units:units.length,rows,parseFailures:failures},null,2));console.log('JS AST calls',rows.length,'parse failures',failures.length,'requests',rows.filter(r=>r.kind==='request').length);
