import {children,walk,calleeName,text} from './bindings.mjs';
const functions=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
export function environment(body,parent=null) {
 const env={parent,values:new Map(),functions:new Map(),invalid:new Set()};
 function collect(node,conditional=false) {
  if(!node?.type)return;
  if(node.type==='FunctionDeclaration'){env.functions.set(node.id?.name??'default',{node,env});return;}
  if(functions.has(node.type))return;
  if(node.type==='VariableDeclarator'&&node.id.type==='Identifier') {
   const name=node.id.name;if(env.values.has(name)||conditional)env.invalid.add(name);env.values.set(name,{node:node.init,at:node.end});
   if(functions.has(node.init?.type))env.functions.set(name,{node:node.init,env});
   if(node.init?.type==='ObjectExpression')for(const p of node.init.properties)if(!p.computed&&functions.has(p.value?.type))env.functions.set(name+'.'+(p.key.name??p.key.value),{node:p.value,env});
  }
  for(const c of children(node))collect(c,conditional||['IfStatement','ForStatement','WhileStatement','SwitchStatement','ConditionalExpression','ForOfStatement','ForInStatement'].includes(node.type));
 }
 collect(body);
 const writes=new Map();walk(body,n=>{if(n.type==='AssignmentExpression'||n.type==='UpdateExpression'){const t=n.left??n.argument;const name=t.type==='Identifier'?t.name:t.object?.name;if(name){if(!writes.has(name))writes.set(name,[]);writes.get(name).push(n);}}});
 walk(body,n=>{if(n.type==='AssignmentExpression'||n.type==='UpdateExpression') {const target=n.left??n.argument;const name=target.type==='Identifier'?target.name:target.object?.type==='Identifier'?target.object.name:null;if(name){const entry=env.values.get(name);if(entry&&!entry.node&&writes.get(name)?.length===1&&n.operator==='='&&target.type==='Identifier'&&body.body?.some(statement=>statement.type==='ExpressionStatement'&&statement.expression===n)){entry.node=n.right;entry.at=n.end;}else env.invalid.add(name);}}});
 return env;
}
export function lookup(env,name,kind='values') {for(let scope=env;scope;scope=scope.parent)if(scope[kind].has(name))return {entry:scope[kind].get(name),scope};return null;}
const unknown=(expression,tainted=false)=>({value:'{'+expression+'}',status:'UNRESOLVED',known:false,tainted});
export function resolveValue(node,{env,code,elValues={},globals=new Map(),seen=new Set()}) {
 const recur=(n,e=env,s=seen)=>resolveValue(n,{env:e,code,elValues,globals,seen:s});
 if(!node)return unknown('missing');
 if(node.type==='Literal'&&['string','number','boolean'].includes(typeof node.value)) {
  if(typeof node.value==='string'&&node.value.includes('<%'))return unknown(text(node,code),true);
  let value=String(node.value),unresolved=false;
  if(typeof node.value==='string')value=value.replace(/\$\{([^}]+)\}/g,(_,name)=>{if(Object.hasOwn(elValues,name))return String(elValues[name]);unresolved=true;return '{'+name+'}';});
  const known=!unresolved||value.replace(/\{[^}]*\}/g,'').length>0;return {value,status:unresolved?(known?'INFERRED':'UNRESOLVED'):'CONFIRMED',known,tainted:false,type:typeof node.value};
 }
 if(node.type==='Identifier') {
  const found=lookup(env,node.name);if(found) {
   if(found.scope.invalid.has(node.name)||seen.has(found.entry)||found.entry.at>node.start)return unknown(node.name,true);
   if(found.entry.resolved)return found.entry.resolved;
   return recur(found.entry.node,found.scope,new Set([...seen,found.entry]));
  }
  const global=globals.get(node.name);if(global?.length===1&&!seen.has(global[0]))return global[0].resolve(new Set([...seen,global[0]]));
  return unknown(node.name);
 }
 if(node.type==='ObjectExpression'&&!node.properties.some(p=>p.type!=='Property'||p.computed||p.kind!=='init'))return {...unknown('object'),properties:Object.fromEntries(node.properties.map(p=>[p.key.name??p.key.value,recur(p.value)]))};
 if(node.type==='MemberExpression') {
  let computed=false;walk(node,n=>{if(n.type==='MemberExpression'&&n.computed)computed=true;});if(computed)return unknown(text(node,code),true);
  if(['value','files','checked'].includes(node.property.name))return unknown(text(node,code),true);
  if(node.object.type==='Identifier') {
   const found=lookup(env,node.object.name);if(found&&found.scope.invalid.has(node.object.name))return unknown(text(node,code),true);if(found&&!found.scope.invalid.has(node.object.name)&&!seen.has(found.entry)) {
    if(found.entry.resolved)return found.entry.resolved.properties?.[node.property.name]??unknown(text(node,code),found.entry.resolved.tainted);
    const object=found.entry.node;
    if(object?.type==='ObjectExpression'&&!object.properties.some(p=>p.type==='SpreadElement'||p.computed)) {
     const p=object.properties.find(p=>(p.key.name??p.key.value)===node.property.name);if(p)return recur(p.value,found.scope,new Set([...seen,found.entry]));
    }
   }
  }
  return unknown(text(node,code));
 }
 if(node.type==='BinaryExpression'&&node.operator==='+') {
  const a=recur(node.left),b=recur(node.right);if(a.tainted||b.tainted)return unknown(text(node,code),true);
  if(!a.known&&!b.known)return unknown(text(node,code));
  return {value:a.type==='number'&&b.type==='number'?String(Number(a.value)+Number(b.value)):a.value+b.value,status:a.status==='CONFIRMED'&&b.status==='CONFIRMED'?'CONFIRMED':'INFERRED',known:true,tainted:false};
 }
 if(node.type==='TemplateLiteral') {
  const values=node.expressions.map(n=>recur(n));if(values.some(v=>v.tainted))return unknown(text(node,code),true);
  let value='',known=node.quasis.some(q=>q.value.cooked);node.quasis.forEach((q,i)=>{value+=q.value.cooked??q.value.raw;if(values[i]){value+=values[i].value;known ||= values[i].known;}});
  return {value,status:values.every(v=>v.status==='CONFIRMED')?'CONFIRMED':known?'INFERRED':'UNRESOLVED',known,tainted:false};
 }
 if(node.type==='CallExpression'||node.type==='NewExpression')return unknown(text(node,code),true);
 return unknown(text(node,code));
}
