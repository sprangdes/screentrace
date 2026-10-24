import {parseExpression} from '@babel/parser';
import {children,FUNCTIONS,text,line} from './modules.mjs';
import {unwrap,externalName} from './values.mjs';
import {atoms,unique,reduceUnder,simplify} from './audience.mjs';

/** OQ-037: exact setter/return identity through one statically identified Context Provider. */
export function contextTransfers(modules,evaluator){
 const sites=[],elements=[],references=[],functions=[];
 function visit(node,scope,parent=null,owner=null){
  if(FUNCTIONS.has(node.type)){scope=evaluator.functionScope(node,scope);owner=node;functions.push(node);}
  if(node.type==='JSXElement')elements.push({node,scope});
  if(node.type==='Identifier')references.push({node,scope,parent,owner});
  if(node.type==='JSXElement'&&node.openingElement.name.type==='JSXMemberExpression'&&node.openingElement.name.property.name==='Provider')sites.push({node,scope,owner});
  for(const child of children(node))visit(child,scope,node,owner);
 }
 for(const module of modules.values())visit(module.ast.program,evaluator.moduleScope(module.file));
 const declaration=(name,scope)=>evaluator.lookup(name,scope)?.entry?.node;
 const contextKey=(expr,scope)=>['Identifier','JSXIdentifier'].includes(expr?.type)?declaration(expr.name,scope):null;
 const records=[],states=[],providers=[];
 for(const site of sites){
  const context=contextKey(site.node.openingElement.name.object,site.scope);if(!context)continue;
  if(sites.filter(s=>contextKey(s.node.openingElement.name.object,s.scope)===context).length!==1)continue;
  // Multiple instances of the component also mean multiple Providers.
  const uses=elements.filter(({node,scope})=>{const name=node.openingElement.name;if(name.type!=='JSXIdentifier')return false;const value=evaluator.resolveName(name.name,scope);return value.t==='fn'&&value.node===site.owner;});
  if(uses.length!==1)continue;
  const valueAttr=site.node.openingElement.attributes.find(a=>a.type==='JSXAttribute'&&a.name.name==='value');
  const value=valueAttr?.value?.type==='JSXExpressionContainer'?evaluator.evaluate(valueAttr.value.expression,site.scope):null;
  if(value?.t!=='object'||value.node.type!=='ObjectExpression'||value.node.properties.some(p=>p.type!=='ObjectProperty'||p.computed))continue;
  const properties=value.node.properties;
  providers.push({context,properties,scope:value.scope});
  for(const property of properties){
   if(property.value.type!=='Identifier')continue;
   const state=declaration(property.value.name,value.scope),init=unwrap(state?.init),pattern=state?.id;
   if(init?.type!=='CallExpression'||pattern?.type!=='ArrayPattern'||pattern.elements[0]?.name!==property.value.name||pattern.elements[1]?.type!=='Identifier')continue;
   const hook=evaluator.evaluate(init.callee,value.scope);if(hook.t!=='external'||!['react','preact/compat'].includes(hook.specifier)||externalName(hook)!=='useState')continue;
   const refs=references.filter(r=>r.node.name===pattern.elements[1].name&&declaration(r.node.name,r.scope)===state);
   const escaped=refs.some(r=>r.parent!==pattern&&!(r.parent?.type==='ObjectProperty'&&properties.includes(r.parent))&&!(r.parent?.type==='CallExpression'&&r.parent.callee===r.node));
   states.push({context,field:property.key.name??property.key.value,state,escaped,source:{file:value.scope.module.file,line:line(state)}});
  }
  for(const property of properties){
   const fn=evaluator.evaluate(property.value,value.scope);if(fn.t!=='fn')continue;
   const inner=evaluator.functionScope(fn.node,fn.scope);
   for(const stateProp of properties){
    if(stateProp.value.type!=='Identifier')continue;
    const state=declaration(stateProp.value.name,value.scope);
    const init=unwrap(state?.init),pattern=state?.id;
    if(init?.type!=='CallExpression'||pattern?.type!=='ArrayPattern'||pattern.elements[0]?.name!==stateProp.value.name||pattern.elements[1]?.type!=='Identifier')continue;
    const hook=evaluator.evaluate(init.callee,value.scope);if(hook.t!=='external'||!['react','preact/compat'].includes(hook.specifier)||externalName(hook)!=='useState')continue;
    const setter=pattern.elements[1].name;
    const setterRefs=references.filter(r=>r.node.name===setter&&declaration(setter,r.scope)===state);
    if(setterRefs.some(r=>r.parent!==pattern&&!(r.parent?.type==='ObjectProperty'&&properties.includes(r.parent))&&!(r.owner===fn.node&&r.parent?.type==='CallExpression'&&r.parent.callee===r.node)))continue;
    let invalid=false,returns=0;
    function block(list,paths){
     for(const statement of list){
      if(!paths.length)break;
      if(statement.type==='ReturnStatement'){
       const result=unwrap(statement.argument);returns++;
       // Literal null branches are allowed only when that same literal was stored.
       const key=result?.type==='Identifier'?'id:'+result.name:result?.type==='NullLiteral'?'null':null;
       if(!key||paths.some(p=>p!==key))invalid=true;
       if(result?.type==='Identifier'){const local=evaluator.lookup(result.name,inner);if(local?.scope!==inner||local.entry?.kind!=='variable'||local.entry.node.id.type!=='Identifier')invalid=true;}
       return [];
      }
      if(statement.type==='ExpressionStatement'){
       const call=unwrap(statement.expression);
       if(call?.type==='CallExpression'&&call.callee.type==='Identifier'&&declaration(call.callee.name,inner)===state){const arg=unwrap(call.arguments[0]);const key=arg?.type==='Identifier'?'id:'+arg.name:arg?.type==='NullLiteral'?'null':null;if(call.arguments.length!==1||!key)invalid=true;paths=paths.map(()=>key);}
      }else if(statement.type==='IfStatement'){
       const left=block(statement.consequent.type==='BlockStatement'?statement.consequent.body:[statement.consequent],[...paths]);
       const right=statement.alternate?block(statement.alternate.type==='BlockStatement'?statement.alternate.body:[statement.alternate],[...paths]):paths;paths=[...left,...right];
      }else if(statement.type==='TryStatement'){
       paths=[...block(statement.block.body,[...paths]),...(statement.handler?block(statement.handler.body.body,[...paths]):[])];
       if(statement.finalizer)paths=block(statement.finalizer.body,paths);
      }else if(statement.type==='BlockStatement')paths=block(statement.body,paths);
      else if(['ForStatement','WhileStatement','DoWhileStatement','SwitchStatement','ThrowStatement'].includes(statement.type))invalid=true;
     }
     return paths;
    }
    // Writes to a returned local, or a finally block changing the stored state, defeat identity.
    function mutations(n){if(FUNCTIONS.has(n.type))return false;if(n.type==='AssignmentExpression'||n.type==='UpdateExpression')return true;if(n.type==='TryStatement'&&n.finalizer){let writes=false;function check(x){if(x.type==='CallExpression'&&x.callee.type==='Identifier'&&declaration(x.callee.name,inner)===state)writes=true;for(const c of children(x))check(c);}check(n.finalizer);if(writes)return true;}return children(n).some(mutations);}
    if(mutations(fn.node.body))invalid=true;
    const remaining=fn.node.body.type==='BlockStatement'?block(fn.node.body.body,[null]):[null];
    if(!invalid&&returns&&remaining.length===0)records.push({context,field:stateProp.key.name??stateProp.key.value,fnField:property.key.name??property.key.value,source:{file:fn.scope.module.file,line:line(fn.node)}});
   }
  }
 }
 function consumerContext(expr,scope,active=new Set()){
  expr=unwrap(expr);if(!expr||active.has(expr))return null;active=new Set([...active,expr]);
  if(expr.type==='Identifier'){const found=evaluator.lookup(expr.name,scope);return found?.entry?.node.init?consumerContext(found.entry.node.init,found.scope,active):null;}
  if(expr.type!=='CallExpression')return null;
  const fn=evaluator.evaluate(expr.callee,scope);
  if(fn.t==='external'&&['react','preact/compat'].includes(fn.specifier)&&externalName(fn)==='useContext')return contextKey(expr.arguments[0],scope);
  if(fn.t!=='fn')return null;
  const inner=evaluator.functionScope(fn.node,fn.scope),body=fn.node.body;
  const returns=body.type==='BlockStatement'?body.body.filter(s=>s.type==='ReturnStatement'):[];
  return returns.length===1?consumerContext(returns[0].argument,inner,active):null;
 }
 function identity(name,scope,active=new Set()){
  const found=evaluator.lookup(name,scope);if(!found||active.has(found.entry??found.binding))return null;active=new Set([...active,found.entry??found.binding]);
  if(found.binding?.expr?.type==='Identifier')return identity(found.binding.expr.name,found.binding.scope,active);
  const entry=found.entry,init=unwrap(entry?.node.init);
  if(entry?.node.id.type!=='Identifier'||init?.type!=='AwaitExpression'||init.argument.type!=='CallExpression'||init.argument.callee.type!=='Identifier')return null;
  const f=evaluator.lookup(init.argument.callee.name,found.scope);
  if(f?.entry?.node.id.type!=='ObjectPattern'||f.entry.steps?.length!==1)return null;
  const context=consumerContext(f.entry.node.init,f.scope),field=f.entry.steps[0].key,hook=consumerHook(f.entry.node.init,f.scope);
  const matches=records.filter(r=>r.context===context&&r.fnField===field);return matches.length===1?{...matches[0],hook}:null;
 }
 const contexts=[...new Set(states.map(r=>r.context))];
 function consumerHook(expr,scope){expr=unwrap(expr);if(expr?.type!=='CallExpression')return undefined;const fn=evaluator.evaluate(expr.callee,scope);return fn.t==='fn'?fn.node:fn.t==='external'&&externalName(fn)==='useContext'?null:undefined;}
 const contextId=context=>`Context#${contexts.indexOf(context)}`;
 const token=match=>`$context${contexts.indexOf(match.context)}_hook${match.hook===null?'direct':functions.indexOf(match.hook)}_${states.findIndex(s=>s.context===match.context&&s.field===match.field)}`;
 function stateField(name,scope){const found=evaluator.lookup(name,scope);if(found?.entry?.node.id.type!=='ObjectPattern'||found.entry.steps?.length!==1)return null;const context=consumerContext(found.entry.node.init,found.scope),field=found.entry.steps[0].key,hook=consumerHook(found.entry.node.init,found.scope);const state=states.find(r=>r.context===context&&r.field===field&&!r.escaped);return state&&hook!==undefined?{...state,hook}:null;}
 function callable(node,scope,active=new Set()){
  node=unwrap(node);if(!node||active.has(node))return null;active=new Set([...active,node]);
  if(node.type==='Identifier'){
   const found=evaluator.lookup(node.name,scope);
   const direct=states.find(s=>s.state===found?.entry?.node&&found.entry.steps?.[0]?.index===1);if(direct)return {state:direct};
   if(found?.entry?.node.id.type==='ObjectPattern'&&found.entry.steps?.length===1){const context=consumerContext(found.entry.node.init,found.scope),provider=providers.find(p=>p.context===context),field=found.entry.steps[0].key,property=provider?.properties.find(p=>(p.key.name??p.key.value)===field);if(property)return callable(property.value,provider.scope,active);}
   if(found?.binding?.expr)return callable(found.binding.expr,found.binding.scope,active);
  }
  const fn=evaluator.evaluate(node,scope);return fn.t==='fn'?fn:null;
 }
 function writes(callee,scope,active=new Set()){
  const result=new Set(),value=callable(callee,scope);if(!value)return result;
  if(value.state){result.add(contextId(value.state.context));return result;}
  if(active.has(value.node)||active.size>=evaluator.maxDepth)return result;active=new Set([...active,value.node]);
  const inner=evaluator.functionScope(value.node,value.scope);
  function walk(node,current){if(FUNCTIONS.has(node.type)){current=evaluator.functionScope(node,current);}if(node.type==='CallExpression'||node.type==='OptionalCallExpression'){for(const id of writes(node.callee,current,active))result.add(id);}for(const child of children(node))walk(child,current);}
  walk(value.node.body,inner);return result;
 }
 function transfer(facts,scope,target=false,onlyContext=false){
  const proofs=[];const result=[];
  for(const fact of facts){let node;try{node=parseExpression(fact.text,{plugins:['typescript']});}catch{result.push(fact);continue;}
   let unbound=false;const edits=[];function walk(n,parent){if(n.type==='Identifier'&&!(parent&&['MemberExpression','OptionalMemberExpression'].includes(parent.type)&&parent.property===n&&!parent.computed)){const match=target?stateField(n.name,scope):identity(n.name,scope);if(match){edits.push({start:n.start,end:n.end,value:token(match)});proofs.push(match.source);return;}unbound=true;}for(const child of children(n))walk(child,n);}
   walk(node,null);if(onlyContext&&unbound)continue;let expression=fact.text;for(const edit of edits.sort((a,b)=>b.start-a.start))expression=expression.slice(0,edit.start)+edit.value+expression.slice(edit.end);
   const rewritten=atoms(fact.truth?expression:`!(${expression})`,fact.source);if(fact.optional!==undefined)for(const atom of rewritten)atom.optional=fact.optional;result.push(...rewritten);
  }
  return {facts:unique(result),proofs};
 }
 const qualified=new WeakMap(),factScopes=new WeakMap();
 transfer.remember=(facts,scope)=>{for(const fact of facts){factScopes.set(fact,scope);qualified.set(fact,transfer([fact],scope,true).facts);}return facts;};
 transfer.writes=writes;
 transfer.writesIn=(expr,scope)=>{const result=new Set();function visit(node,current){if(FUNCTIONS.has(node.type))return;if(node.type==='CallExpression'||node.type==='OptionalCallExpression')for(const id of writes(node.callee,current))result.add(id);for(const child of children(node))visit(child,current);}visit(expr,scope);return result;};
 transfer.explain=(sourceFacts,targetFacts)=>{const assumed=transfer.navigationFacts(targetFacts);const clauses=sourceFacts.flatMap(f=>{const scope=factScopes.get(f);return scope?transfer([f],scope,true).facts:[];});const residual=reduceUnder(clauses,assumed);const displayed=simplify(targetFacts).map(a=>a.truth?a.text:`!(${a.text})`);const names=new Map();for(const fact of sourceFacts){const scope=factScopes.get(fact);let node;try{node=parseExpression(fact.text,{plugins:['typescript']});}catch{continue;}function visit(n){if(n.type==='Identifier'){const field=stateField(n.name,scope);if(field)names.set(token(field),n.name);}for(const child of children(n))visit(child);}if(scope)visit(node);}const display=text=>{for(const [key,name]of names)text=text.replaceAll(key,name);return text;};const extra=residual.map(a=>display(a.truth?a.text:`!(${a.text})`));return {condition:displayed.join(' && ')+(extra.length?'；來源條件：'+extra.join(' && '):''),sources:sourceFacts.flatMap(f=>[f.source,...(f.origins??[])]),sourceConditions:residual};};
 transfer.navigationFacts=(facts,blocked=[])=>facts.flatMap(fact=>{const scope=factScopes.get(fact);if(!scope)return [];const qualified=transfer([fact],scope,true,true).facts;return qualified.filter(a=>!blocked.some(id=>a.text.includes('$context'+id.split('#')[1]+'_')));});
 transfer.effectFacts=(expressions,scope,source,blocked=[])=>transfer.navigationFacts(transfer.remember(expressions.flatMap(expression=>atoms(expression,source)),scope),blocked);
 transfer.scopeOf=fact=>factScopes.get(fact);
 transfer.targetFacts=facts=>facts.flatMap(fact=>qualified.get(fact)??[fact]);
 return transfer;
}
