import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseSource,diagnostic} from './parser.mjs';
import {bindings,children,walk,text,calleeName,selectorOf,select,selectNodes} from './bindings.mjs';
import {environment,lookup,resolveValue} from './values.mjs';
import {expandModules} from './modules.mjs';
const table=JSON.parse(readFileSync(new URL('./api-table.json',import.meta.url),'utf8'));
const functionTypes=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
const rank={CONFIRMED:0,INFERRED:1,AMBIGUOUS:2,UNRESOLVED:3};
const status=(...values)=>values.filter(Boolean).sort((a,b)=>rank[b]-rank[a])[0]??'CONFIRMED';
export function identifyLibrary(file,header='') {
 // Specific library signatures take precedence over the generic jQuery signature.
 for(const name of ['jquery.validate','jquery-ui','bootstrap','select2','datepicker','jquery']) {
  const entry=table[name];const comments=header.slice(0,4096).match(/^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)(?:\s*))/)?.[0]??'';if(new RegExp(entry.file,'i').test(file)||new RegExp(entry.header,'i').test(comments))return name;
 }return null;
}
export function analyze(request) {
 const behaviors=[],rules=[],diagnostics=[],libraries=[],dom=request.dom??[];let occurrences=new Map();
 const globalFunctions=new Map(),globalValues=new Map(),runners=[];const maxDepth=Number.isInteger(request.maxDepth)&&request.maxDepth>=0?request.maxDepth:10;
 const stable=(kind,...parts)=>{const key=JSON.stringify(parts),count=occurrences.get(kind+key)??0;occurrences.set(kind+key,count+1);return kind+':js:'+createHash('sha256').update(JSON.stringify([...parts,count])).digest('hex').slice(0,24);};
 const expanded=expandModules(request.sources??[],request.moduleFiles??{});diagnostics.push(...expanded.diagnostics);
 for(const unit of expanded.sources) {
  const library=identifyLibrary(unit.file,unit.code);if(library){libraries.push({file:unit.file,name:library,source:{file:unit.file,line:1}});continue;}
  const parsed=parseSource(unit);diagnostics.push(...parsed.diagnostics);if(!parsed.ast)continue;
  const code=unit.code,unitDom=dom.filter(d=>!unit.ownerFile||d.ownerFile===unit.ownerFile||d.screenId===unit.screenId);
  const source=n=>({file:unit.file,line:(unit.line??1)+(n?.loc?.start.line??1)-1});
  const rootEnv=environment(parsed.ast);let currentContext=null;
  const exports=new Map();for(const statement of parsed.ast.body){if(statement.type==='ExportDefaultDeclaration')exports.set(statement.declaration.id?.name??'default','default');if(statement.type==='ExportNamedDeclaration'){const declaration=statement.declaration;if(declaration?.id)exports.set(declaration.id.name,declaration.id.name);for(const d of declaration?.declarations??[])if(d.id.name)exports.set(d.id.name,d.id.name);for(const e of statement.specifiers??[])exports.set(e.local.name,e.exported.name);}}
  const symbolKey=name=>{const alias=unit.aliases?.[name]??unit.aliases?.[name?.split('.')[0]];return alias?'module:'+alias.file+':'+(alias.name==='*'?name.split('.').slice(1).join('.'):alias.name):'global:'+name;};
  const valueGlobals={get:name=>globalValues.get(unit.screenId)?.get(symbolKey(name))};
  const value=n=>{const v=resolveValue(n,{env:currentContext?.env??rootEnv,code,elValues:unit.elValues??{},globals:valueGlobals});return {...v,value:v.status==='UNRESOLVED'?null:v.value};};
  const asObject=node=>{const seen=new Set();while(node?.type==='Identifier'&&!seen.has(node.name)){seen.add(node.name);const found=lookup(currentContext?.env??rootEnv,node.name);if(!found||found.scope.invalid.has(node.name))return null;node=found.entry.node;}return node?.type==='ObjectExpression'&&!node.properties.some(p=>p.computed||p.type==='SpreadElement')?node:null;};
  const prop=(object,name)=>asObject(object)?.properties.find(p=>(p.key.name??p.key.value)===name)?.value??null;
  const fields=n=>{
   if(asObject(n))return asObject(n).properties.filter(p=>p.type==='Property'&&!p.computed).map(p=>String(p.key.name??p.key.value)).sort();
   if(n?.type==='CallExpression'&&calleeName(n.callee)==='JSON.stringify')return fields(n.arguments[0]);
   if(n?.type==='CallExpression'&&n.callee.property?.name==='serialize') {
    const forms=selectNodes(selectorOf(n.callee.object,code),unitDom);const ids=new Set(forms.map(f=>f.id));let changed=true;while(changed){changed=false;for(const d of unitDom)if(ids.has(d.parent)&&!ids.has(d.id)){ids.add(d.id);changed=true;}}
    return [...new Set(unitDom.filter(d=>ids.has(d.id)&&d.attrs?.name).map(d=>d.attrs.name))].sort();
   }return [];
  };
  const root={triggerId:unit.triggerId??unit.screenId??null,event:unit.event??'load',selector:unit.event?'this':null,status:unit.event&&!unit.triggerId?'UNRESOLVED':'CONFIRMED',guard:unit.guard??unitDom.find(d=>d.componentId===unit.triggerId)?.guard??null,parentId:null,env:rootEnv,depth:0,stack:[],trace:[]};
  const emit=(type,node,ctx,extra={},resolution='CONFIRMED')=>{
   const expression=text(node,code),id=stable('behavior',unit.file,ctx.triggerId,ctx.event,type,expression,ctx.parentId);
   let dynamic=false;function inspect(n){if(!n?.type||functionTypes.has(n.type))return;if(n.type==='MemberExpression'&&n.computed)dynamic=true;for(const c of children(n))inspect(c);}inspect(node);
   const b={id,type,triggerId:ctx.triggerId,event:ctx.event,selector:ctx.selector,guard:ctx.guard,parentId:ctx.parentId,expression,ownerFile:unit.ownerFile,entryFile:unit.entryFile??unit.file,source:source(node),parser:'AcornStaticAnalyzer',status:status(parsed.status,unit.status,ctx.status,resolution,dynamic?'UNRESOLVED':null),trace:ctx.trace??[],...extra};behaviors.push(b);return b;
  };
  const rule=(kind,node,ctx,field,message,parameters={},resolution='CONFIRMED')=>{
   const id=stable('validation',unit.file,field,kind,text(node,code));const r={id,kind,fields:[field],message,parameters,layer:'CLIENT',source:source(node),parser:'AcornStaticAnalyzer',status:status(parsed.status,unit.status,ctx.status,resolution)};rules.push(r);emit('VALIDATE',node,ctx,{targetId:id},resolution);return r;
  };
  const bootstrapInstances=new Map();walk(parsed.ast,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='NewExpression'&&calleeName(n.init.callee)?.startsWith('bootstrap.'))bootstrapInstances.set(n.id.name,{name:calleeName(n.init.callee),selector:selectorOf(n.init.arguments[0],code)});});
  const dialogTarget=selector=>{const ids=selectNodes(selector,unitDom).filter(d=>d.tag==='dialog'||d.attrs?.role==='dialog'||String(d.attrs?.class??'').split(/\s+/).includes('modal')).map(d=>d.componentId).filter(Boolean);const candidates=[...new Set(ids)].sort();return {targetId:candidates.length===1?candidates[0]:null,targetCandidates:candidates,status:candidates.length===1?'CONFIRMED':candidates.length>1?'AMBIGUOUS':'UNRESOLVED'};};
  const httpMethod=(n,fallback='GET')=>n?value(n).value:fallback;
  const configuredMethod=(object)=>object?(asObject(object)?httpMethod(prop(object,'method')??prop(object,'type')):null):'GET';
  const xhr=new Map();walk(parsed.ast,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='NewExpression'&&calleeName(n.init.callee)==='XMLHttpRequest')xhr.set(n.id.name,[]);if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.property.name==='open'&&xhr.has(n.callee.object.name))xhr.get(n.callee.object.name).push(n.arguments);});
  const registered=new Map();for(const b of unit.event?[]:bindings(unit,unitDom,{resolveSelector:value})){if(b.handler){if(!registered.has(b.expression))registered.set(b.expression,[]);registered.get(b.expression).push(b);}}
  function visit(node,ctx) {const previous=currentContext;currentContext=ctx;try{return visitNode(node,ctx);}finally{currentContext=previous;}}
  function visitNode(node,ctx) {
   if(!node?.type||functionTypes.has(node.type))return;
   if(node.type==='IfStatement') {visit(node.test,ctx);visit(node.consequent,{...ctx,guard:ctx.guard?ctx.guard+' && '+text(node.test,code):text(node.test,code)});if(node.alternate)visit(node.alternate,{...ctx,guard:'!('+text(node.test,code)+')'});return;}
   if(node.type==='AssignmentExpression') {
    const name=calleeName(node.left);
    if(['window.onload','document.onload'].includes(name)&&functionTypes.has(node.right.type)){visit(node.right.body,{...root,event:'load'});return;}
    if(['location.href','window.location.href','window.location','location'].includes(name)){const v=value(node.right);emit('NAVIGATE',node,ctx,{url:v.value},v.status);return;}
    if(node.left.type==='MemberExpression'&&node.left.computed){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');return;}
    if(name?.endsWith('.value')||name?.includes('.style.')||['innerHTML','textContent','disabled','checked'].includes(node.left.property?.name)) {emit(name?.endsWith('.value')?'SELECT_CHANGE':'UI_STATE_CHANGE',node,ctx);return;}
    const registration=registered.get(text(node,code));if(registration){for(const b of registration)bound(b,ctx);return;}
   }
   if(node.type==='CallExpression') {
    if(functionTypes.has(node.callee.type)){execute(node.callee,node.arguments,ctx,node);return;}
    const name=calleeName(node.callee),method=node.callee.property?.name,args=node.arguments,receiver=node.callee.object;
    if(lookup(ctx.env??rootEnv,name,'functions')||lookup(ctx.env??rootEnv,name)){if(execute(node.callee,args,ctx,node))return;emit('UNKNOWN',node,ctx,{callee:name},'UNRESOLVED');return;}
    const ready=(name==='$'||name==='jQuery')&&functionTypes.has(args[0]?.type);
    const load=method==='ready'||(method==='addEventListener'&&args[0]?.value==='load'&&['window','document'].includes(calleeName(receiver)));
    if(ready||load||(['$','jQuery'].includes(name)&&args[0]?.type==='Identifier')){const fn=ready||['$','jQuery'].includes(name)?args[0]:args[method==='ready'?0:1];execute(fn,[],{...root,event:load&&method!=='ready'?'load':'ready'},node,true);return;}
    if(['done','then','success','catch','finally'].includes(method)&&receiver?.type==='CallExpression'){const parent=visit(receiver,ctx);for(const fn of args)if(functionTypes.has(fn?.type)||fn?.type==='Identifier')execute(fn,[],{...ctx,parentId:parent?.id??ctx.parentId,event:method},node,true);return parent;}
    const registration=registered.get(text(node,code))??(['on','click','change','submit','blur','focus','input','keydown','keyup','addEventListener'].includes(method)?bindings(unit,unitDom,{node,status:parsed.status,resolveSelector:value,thisId:ctx.triggerId}):[]);if(registration.some(b=>b.handler)){for(const b of registration)if(b.handler)bound(b,ctx);return;}
    if(!name&&node.callee.type==='MemberExpression'&&node.callee.computed){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','動態呼叫：'+text(node.callee,code)));return;}
    if(name==='eval'||name==='Function'){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','禁止解析執行式呼叫：'+name));return;}
    if(['location.assign','location.replace','window.location.assign','window.location.replace','history.pushState','window.history.pushState','window.open'].includes(name)){const v=value(args[name?.endsWith('pushState')?2:0]);emit(name==='window.open'?'OPEN_DIALOG':'NAVIGATE',node,ctx,{url:v.value},v.status);return;}
    if(['alert','confirm','prompt','window.alert','window.confirm','window.prompt'].includes(name)){emit('OPEN_DIALOG',node,ctx,{message:value(args[0]).value});return;}
    const jquery=receiver?.type==='CallExpression'&&['$','jQuery'].includes(calleeName(receiver.callee));
    let api=false,urlNode=null,methodValue='GET',data=null;
    if(['$.ajax','jQuery.ajax'].includes(name)){api=true;urlNode=prop(args[0],'url');methodValue=configuredMethod(args[0]);data=prop(args[0],'data');}
    else if(['$.get','$.post','$.getJSON','jQuery.get','jQuery.post','jQuery.getJSON'].includes(name)){api=true;urlNode=args[0];methodValue=name.endsWith('.post')?'POST':'GET';data=args[1];}
    else if(name==='fetch'){api=true;urlNode=args[0];methodValue=configuredMethod(args[1]);data=prop(args[1],'body');}
    else if(name==='axios'||name?.startsWith('axios.')){api=true;urlNode=name==='axios'?prop(args[0],'url'):args[0];methodValue=name==='axios'?configuredMethod(args[0]):name.slice(6).toUpperCase();data=name==='axios'?prop(args[0],'data'):args[1];}
    else if(jquery&&method==='load'&&args.length){api=true;urlNode=args[0];data=args[1];methodValue=data?.type==='ObjectExpression'?'POST':'GET';}
    else if(method==='send'&&xhr.has(receiver?.name)){api=true;const opens=xhr.get(receiver.name);if(opens.length>1){const urlCandidates=[...new Set(opens.map(a=>value(a[1]).value).filter(Boolean))].sort();return emit('CALL_API',node,ctx,{url:null,method:null,urlCandidates,dataFields:fields(args[0])},'AMBIGUOUS');}const opened=opens[0];urlNode=opened?.[1];methodValue=value(opened?.[0]).value??null;data=args[0];}
    if(api){const v=value(urlNode);const b=emit('CALL_API',node,ctx,{url:v.value,method:methodValue?.toUpperCase()??null,dataFields:fields(data)},methodValue?v.status:'UNRESOLVED');const callback=prop(args[0],'success');if(callback)execute(callback,[],{...ctx,parentId:b.id,event:'success'},node,true);return b;}
    if(method==='open'&&xhr.has(receiver?.name))return;
    if(method==='submit'&&!args.length){emit('SUBMIT_FORM',node,ctx,{selector:selectorOf(receiver,code)});return;}
    if(method==='setCustomValidity') {const ids=select(selectorOf(receiver,code),unitDom,ctx.triggerId),v=value(args[0]);for(const id of ids.length?ids:[selectorOf(receiver,code)])rule('custom',node,ctx,id,v.value,{},ids.length?v.status:'UNRESOLVED');return;}
    if(jquery&&['validate','valid','rules'].includes(method)) {
     const configured=prop(args[0],'rules'),messages=prop(args[0],'messages');
     if(configured?.type==='ObjectExpression')for(const field of configured.properties) {
      const fieldName=String(field.key.name??field.key.value),ids=select('[name="'+fieldName+'"]',unitDom);const details=field.value.type==='ObjectExpression'?field.value.properties:[];
      for(const detail of details){const kind=String(detail.key.name??detail.key.value),v=value(detail.value),msg=value(prop(prop(messages,fieldName),kind)).value;for(const id of ids.length?ids:[fieldName])rule(kind,node,ctx,id,msg,{value:v.value??text(detail.value,code)},ids.length?v.status:'UNRESOLVED');}
     }else{const ids=select(selectorOf(receiver,code),unitDom,ctx.triggerId);for(const id of ids.length?ids:[selectorOf(receiver,code)])rule('custom',node,ctx,id,null,{},'UNRESOLVED');}return;
    }
    if(bootstrapInstances.has(receiver?.name)&&['show','hide','toggle'].includes(method)){const instance=bootstrapInstances.get(receiver.name);const dialog=instance.name==='bootstrap.Modal'&&method!=='hide';const target=dialog?dialogTarget(instance.selector):{};const {status:targetStatus,...attributes}=target;emit(dialog?'OPEN_DIALOG':'UI_STATE_CHANGE',node,ctx,{library:'bootstrap',...attributes},targetStatus);return;}
    if(jquery) {
     if(['val','html','text'].includes(method)&&!args.length)return;
     const mapped=Object.entries(table).find(([,entry])=>entry.apis[method]);if(mapped){const selector=selectorOf(receiver,code);const operation=table[mapped[0]].operations?.[method]?.[args[0]?.value]??mapped[1].apis[method];const target=operation==='OPEN_DIALOG'?dialogTarget(selector):{};const {status:targetStatus,...attributes}=target;emit(operation,node,ctx,{library:mapped[0],selector,...attributes},targetStatus);return;}
    }
    if(['add','remove','toggle'].includes(method)&&receiver?.property?.name==='classList'){emit('UI_STATE_CHANGE',node,ctx);return;}
    if(['JSON.stringify','JSON.parse','console.log','Object.keys','Object.values'].includes(name)||['$','jQuery'].includes(name))return;
    if(execute(node.callee,args,ctx,node))return;
    emit('UNKNOWN',node,ctx,{callee:text(node.callee,code)},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','未知函式呼叫：'+text(node.callee,code)));return;
   }
   for(const child of children(node))visit(child,ctx);
  }
  function bound(binding,ctx) {
   const ids=binding.triggerIds.length?binding.triggerIds:[unit.screenId??ctx.triggerId];
   for(const triggerId of ids){const domGuard=unitDom.find(d=>d.componentId===triggerId)?.guard;const child={...ctx,triggerId,event:binding.event,selector:binding.selector,status:binding.status,guard:domGuard?(ctx.guard?ctx.guard+" && "+domGuard:domGuard):ctx.guard,trace:[...(ctx.trace??[]),{source:binding.source,callee:binding.expression}]};if(binding.handler?.type==='Program')visit(binding.handler,child);else if(binding.handler&&!execute(binding.handler,[],child,binding.handler,true))emit('UNKNOWN',binding.handler,child,{callee:text(binding.handler,code)},'UNRESOLVED');}
  }
  function invoke(fn,args,ctx,call,declEnv,asHandler=false) {
   const key=unit.file+':'+fn.start;
   if(ctx.stack.includes(key)||ctx.depth>=maxDepth){emit('UNKNOWN',call,ctx,{callee:text(call,code)},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(call).line,ctx.stack.includes(key)?'JS_CALL_CYCLE':'JS_DEPTH_LIMIT','函式追蹤停止：'+text(call,code)));return;}
   const env=environment(fn.body,declEnv);fn.params.forEach((p,i)=>{if(p.type==='Identifier')env.values.set(p.name,{resolved:args[i]??{value:null,status:'UNRESOLVED',known:false,tainted:true},at:0});});
   const next={...ctx,env,depth:asHandler?ctx.depth:ctx.depth+1,stack:[...ctx.stack,key]};
   if(/^validate/i.test(fn.id?.name??call.name??'')) {walk(fn.body,n=>{if(n.type==='IfStatement'){let ids=[];walk(n.test,c=>{if(c.type==='CallExpression'&&c.callee.type==='MemberExpression')ids.push(...select(selectorOf(c.callee.object,code),unitDom,ctx.triggerId));});let message=null;walk(n.consequent,c=>{if(c.type==='CallExpression'&&['alert','window.alert'].includes(calleeName(c.callee)))message=c.arguments[0]?.value??null;});for(const id of new Set(ids))rule('custom',n,{...next,guard:text(n.test,code)},id,message,{condition:text(n.test,code)});}});}
   visit(fn.body,next);
  }
  function execute(callee,args,ctx,call,asHandler=false) {
   const resolved=args.map(value);
   if(functionTypes.has(callee?.type)){invoke(callee,resolved,ctx,call,ctx.env??rootEnv,asHandler);return true;}
   const name=calleeName(callee);const local=lookup(ctx.env??rootEnv,name,'functions');
   if(local&&!local.scope.invalid.has(name?.split('.')[0])){invoke(local.entry.node,resolved,{...ctx,trace:[...(ctx.trace??[]),{source:source(call),callee:text(callee,code)}]},call,local.entry.env,asHandler);return true;}
   if(local||lookup(ctx.env??rootEnv,name))return false;
   const candidates=globalFunctions.get(unit.screenId)?.get(symbolKey(name))??[];
   if(candidates.length===1){candidates[0].invoke(resolved,{...ctx,trace:[...(ctx.trace??[]),{source:source(call),callee:text(callee,code)}]},asHandler);return true;}
   return false;
  }
  if(!globalFunctions.has(unit.screenId))globalFunctions.set(unit.screenId,new Map());
  for(const [localName,entry] of rootEnv.functions){if(rootEnv.invalid.has(localName.split('.')[0])||(unit.module&&!exports.has(localName)))continue;const name=unit.module?'module:'+unit.file+':'+exports.get(localName):'global:'+localName;const map=globalFunctions.get(unit.screenId);if(!map.has(name))map.set(name,[]);map.get(name).push({file:unit.file,invoke:(args,ctx,asHandler)=>invoke(entry.node,args,ctx,entry.node,entry.env,asHandler)});}
  if(!globalValues.has(unit.screenId))globalValues.set(unit.screenId,new Map());
  for(const [localName,entry] of rootEnv.values){if(unit.module&&!exports.has(localName))continue;const name=unit.module?'module:'+unit.file+':'+exports.get(localName):'global:'+localName;const map=globalValues.get(unit.screenId);if(!map.has(name))map.set(name,[]);map.get(name).push({resolve:seen=>rootEnv.invalid.has(localName)?{value:null,status:'UNRESOLVED',known:false,tainted:true}:resolveValue(entry.node,{env:rootEnv,code,elValues:unit.elValues??{},globals:valueGlobals,seen})});}
  runners.push(()=>{occurrences=new Map();visit(parsed.ast,root);});
 }
 for(const run of runners)run();
 return {schemaVersion:'1.0',behaviors,rules,diagnostics,libraries};
}
