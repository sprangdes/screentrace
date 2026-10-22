import {workflowGate,trimHelpers} from './workflow-gates.mjs';
import {keyFilter,dependentDate,disclosure,displayToggle} from './workflow-shapes.mjs';
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
 const comments=header.slice(0,4096).match(/^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)(?:\s*))/)?.[0]??'';
 if(/Popup Calendar\(Window\)/.test(header.slice(0,4096))&&/yxscripts\.com/.test(header.slice(0,4096)))return 'yx-calendar';
 if(/(?:^|\/)(?:jquery\.slimscroll|fastclick|sweetalert)(?:\.min)?\.js$/i.test(file))return 'bundled-widget';
 if(/AdminLTE app\.js/i.test(comments))return 'adminlte';
 if(/(?:^|\/)angular(?:[.-][^/]*)?\.js$/i.test(file)||/AngularJS\s+v\d/i.test(comments))return 'angularjs';
 for(const name of ['jquery.validate','jquery-ui','bootstrap','select2','datepicker','jquery']) {
  const entry=table[name];if(new RegExp(entry.file,'i').test(file)||new RegExp(entry.header,'i').test(comments))return name;
 }return null;
}
export function analyze(request) {
 const behaviors=[],rules=[],diagnostics=[],libraries=[],dom=request.dom??[];let occurrences=new Map();const emitted=new Map(),guardPaths=new Map();
 const globalFunctions=new Map(),globalValues=new Map(),angularFunctions=new Map(),runners=[];const maxDepth=Number.isInteger(request.maxDepth)&&request.maxDepth>=0?request.maxDepth:10;
 const stable=(kind,...parts)=>{const key=JSON.stringify(parts),count=occurrences.get(kind+key)??0;occurrences.set(kind+key,count+1);return kind+':js:'+createHash('sha256').update(JSON.stringify([...parts,count])).digest('hex').slice(0,24);};
 const expanded=expandModules(request.sources??[],request.moduleFiles??{});diagnostics.push(...expanded.diagnostics);
 const calendars=new Map(),calendarScreens=new Set(),calendarFormats=new Map();
 for(const unit of request.sources??[])if(identifyLibrary(unit.file,unit.code)==='yx-calendar')calendarScreens.add(unit.screenId);
 for(const unit of request.sources??[])if(calendarScreens.has(unit.screenId)){
  const parsed=parseSource(unit);if(!parsed.ast||parsed.status!=='CONFIRMED')continue;
  const list=calendars.get(unit.screenId)??new Map();
  for(const statement of parsed.ast.body){
   if(identifyLibrary(unit.file,unit.code)==='yx-calendar'&&statement.type==='VariableDeclaration')for(const d of statement.declarations)if(d.id.name==='calFormat'&&typeof d.init?.value==='string'&&!calendarFormats.has(unit.screenId))calendarFormats.set(unit.screenId,d.init.value);
   const n=statement.type==='ExpressionStatement'?statement.expression:null;if(n?.type!=='CallExpression')continue;
   if(calleeName(n.callee)==='setFormat')calendarFormats.set(unit.screenId,typeof n.arguments[0]?.value==='string'?n.arguments[0].value:null);
   if(calleeName(n.callee)==='addCalendar'&&n.arguments.length===4&&n.arguments.every(a=>a.type==='Literal'&&typeof a.value==='string')){const [name,title,field,form]=n.arguments.map(a=>a.value);list.set(name,list.has(name)?null:{title,field,form});}
  }calendars.set(unit.screenId,list);
 }
 const provenTrim=trimHelpers(expanded.sources);
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
  const navigationValue=node=>{
   const resolved=value(node);if(resolved.value!==null)return resolved;
   const parts=[];const flatten=n=>{if(n?.type==='BinaryExpression'&&n.operator==='+'){flatten(n.left);flatten(n.right);}else parts.push(n);};flatten(node);
   let result='',slot=0;for(const part of parts){const v=value(part);if((v.status==='CONFIRMED'||part?.type==='Literal'&&v.status==='INFERRED')&&typeof v.value==='string')result+=v.value;else if(result.includes('?')&&part?.type==='MemberExpression'&&part.property?.name==='value')result+='{input'+(++slot)+'}';else return resolved;}
   return result&&slot?{value:result,status:'INFERRED'}:resolved;
  };
  const parents=new WeakMap(),flowObjects=new WeakMap();
  const indexParents=n=>{for(const child of children(n)){parents.set(child,n);indexParents(child);}};indexParents(parsed.ast);
  function precedingObject(use){
   let statement=use;while(parents.get(statement)&&!['BlockStatement','Program'].includes(parents.get(statement).type))statement=parents.get(statement);
   const block=parents.get(statement);if(statement.type!=='ExpressionStatement'||!block?.body)return null;
   let at=block.body.indexOf(statement)-1;while(at>=0&&block.body[at].type==='EmptyStatement')at--;const previous=block.body[at];let object=null;
   if(previous?.type==='VariableDeclaration'&&previous.declarations.length===1&&previous.declarations[0].id.name===use.name)object=previous.declarations[0].init;
   if(previous?.type==='ExpressionStatement'&&previous.expression.type==='AssignmentExpression'&&previous.expression.operator==='='&&previous.expression.left.type==='Identifier'&&previous.expression.left.name===use.name)object=previous.expression.right;
   if(object?.type!=='ObjectExpression')return null;flowObjects.set(object,source(previous));return object;
  }
  const asObject=node=>{const seen=new Set();while(node?.type==='Identifier'&&!seen.has(node.name)){seen.add(node.name);const found=lookup(currentContext?.env??rootEnv,node.name);if(!found)return null;node=found.scope.invalid.has(node.name)||found.entry.at>node.start?precedingObject(node):found.entry.node;}return node?.type==='ObjectExpression'&&!node.properties.some(p=>p.computed||p.type==='SpreadElement')?node:null;};
  const prop=(object,name)=>asObject(object)?.properties.find(p=>(p.key.name??p.key.value)===name)?.value??null;
  const fields=n=>{
   if(asObject(n))return asObject(n).properties.filter(p=>p.type==='Property'&&!p.computed).map(p=>String(p.key.name??p.key.value)).sort();
   if(n?.type==='CallExpression'&&calleeName(n.callee)==='JSON.stringify')return fields(n.arguments[0]);
   if(n?.type==='CallExpression'&&n.callee.property?.name==='serialize') {
    const forms=selectNodes(selectorOf(n.callee.object,code),unitDom);const ids=new Set(forms.map(f=>f.id));let changed=true;while(changed){changed=false;for(const d of unitDom)if(ids.has(d.parent)&&!ids.has(d.id)){ids.add(d.id);changed=true;}}
    return [...new Set(unitDom.filter(d=>ids.has(d.id)&&d.attrs?.name).map(d=>d.attrs.name))].sort();
   }return [];
  };
  const root={triggerId:unit.triggerId??unit.screenId??null,event:unit.event??'load',selector:unit.event&&unit.event!=='load'?'this':null,status:unit.event&&!unit.triggerId&&unit.event!=='load'?'UNRESOLVED':'CONFIRMED',guard:unit.guard??unitDom.find(d=>d.componentId===unit.triggerId)?.guard??null,parentId:null,env:rootEnv,depth:0,stack:[],trace:[],controllerName:unit.controllerName??null};
  // One behavior per effect: the same node reached again for the same trigger through another call path (zeprs apgar.js:
  // ~2,400 paths per control) merges into it. The effect happens when any path's guard holds, so the guards are OR-ed,
  // and a path without a guard makes it unconditional. The trace keeps every distinct call-site step (bounded by the code,
  // unlike the paths through it); pathCount counts the paths.
  const emit=(type,node,ctx,extra={},resolution='CONFIRMED')=>{
   const expression=text(node,code);
   let dynamic=false;function inspect(n){if(!n?.type||functionTypes.has(n.type))return;if(n.type==='MemberExpression'&&n.computed)dynamic=true;for(const c of children(n))inspect(c);}inspect(node);
   const effectStatus=status(parsed.status,unit.status,ctx.status,resolution,dynamic&&!extra.operation?'UNRESOLVED':null);
   // The AST node itself identifies the effect, so ids stay independent of source positions.
   const key=JSON.stringify([unit.file,ctx.triggerId,ctx.event,ctx.selector,type,expression,ctx.parentId,effectStatus,extra]);
   if(!emitted.has(node))emitted.set(node,new Map());const existing=emitted.get(node).get(key);
   if(existing){
    const paths=guardPaths.get(existing.id);if(ctx.guard==null)paths.unconditional=true;else paths.guards.add(ctx.guard);
    existing.guard=paths.unconditional?null:paths.guards.size===1?[...paths.guards][0]:[...paths.guards].sort().map(g=>`(${g})`).join(' || ');
    const steps=new Set(existing.trace.map(step=>JSON.stringify(step)));for(const step of ctx.trace??[])if(!steps.has(JSON.stringify(step))){steps.add(JSON.stringify(step));existing.trace.push(step);}
    existing.pathCount=(existing.pathCount??1)+1;return existing;
   }
   const id=stable('behavior',unit.file,ctx.triggerId,ctx.event,type,expression,ctx.parentId);
   guardPaths.set(id,{unconditional:ctx.guard==null,guards:new Set(ctx.guard==null?[]:[ctx.guard])});
   const b={id,type,triggerId:ctx.triggerId,event:ctx.event,selector:ctx.selector,guard:ctx.guard,parentId:ctx.parentId,expression,ownerFile:unit.ownerFile,entryFile:unit.entryFile??unit.file,source:source(node),parser:'AcornStaticAnalyzer',status:effectStatus,trace:[...(ctx.trace??[])],...(extra.operation?{order:node.start}:{}),...extra};emitted.get(node).set(key,b);behaviors.push(b);return b;
  };
  const rule=(kind,node,ctx,field,message,parameters={},resolution='CONFIRMED')=>{
   const id=stable('validation',unit.file,field,kind,text(node,code));const r={id,kind,fields:[field],message,parameters,layer:'CLIENT',source:source(node),parser:'AcornStaticAnalyzer',status:status(parsed.status,unit.status,ctx.status,resolution)};rules.push(r);emit('VALIDATE',node,ctx,{targetId:id},resolution);return r;
  };
  const bootstrapInstances=new Map();walk(parsed.ast,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='NewExpression'&&calleeName(n.init.callee)?.startsWith('bootstrap.'))bootstrapInstances.set(n.id.name,{name:calleeName(n.init.callee),selector:selectorOf(n.init.arguments[0],code)});});
  const dialogTarget=selector=>{const ids=selectNodes(selector,unitDom).filter(d=>d.tag==='dialog'||d.attrs?.role==='dialog'||String(d.attrs?.class??'').split(/\s+/).includes('modal')).map(d=>d.componentId).filter(Boolean);const candidates=[...new Set(ids)].sort();return {targetId:candidates.length===1?candidates[0]:null,targetCandidates:candidates,status:candidates.length===1?'CONFIRMED':candidates.length>1?'AMBIGUOUS':'UNRESOLVED'};};
  const httpMethod=(n,fallback='GET')=>n?value(n).value:fallback;
  const configuredMethod=(object)=>object?(asObject(object)?httpMethod(prop(object,'method')??prop(object,'type')):null):'GET';
  const xhr=new Map();walk(parsed.ast,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='NewExpression'&&calleeName(n.init.callee)==='XMLHttpRequest')xhr.set(n.id.name,[]);if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.property.name==='open'&&xhr.has(n.callee.object.name))xhr.get(n.callee.object.name).push(n.arguments);});
  const registered=new Map();for(const b of unit.event?[]:bindings(unit,unitDom,{resolveSelector:value,resolveReceiver:n=>domReference(n)?.selector})){if(b.handler){if(!registered.has(b.expression))registered.set(b.expression,[]);registered.get(b.expression).push(b);}}
  function visit(node,ctx) {const previous=currentContext;currentContext=ctx;try{return visitNode(node,ctx);}finally{currentContext=previous;}}
  function visitNestedApiCalls(values,ctx) {
   const isRequest=node=>{
    if(node?.type!=='CallExpression')return false;
    const name=calleeName(node.callee),method=node.callee.property?.name,receiver=node.callee.object;
    return name==='$http'||name?.startsWith('$http.')||['$.ajax','jQuery.ajax','$.get','$.post','$.getJSON','jQuery.get','jQuery.post','jQuery.getJSON','fetch','axios'].includes(name)||name?.startsWith('axios.')||method==='load'&&receiver?.type==='CallExpression'&&['$','jQuery'].includes(calleeName(receiver.callee))||method==='send'&&xhr.has(receiver?.name);
   };
   const scan=node=>{
    if(!node?.type||functionTypes.has(node.type))return;
    if(isRequest(node)){visit(node,ctx);return;}
    for(const child of children(node))scan(child);
   };
   for(const valueNode of values)scan(valueNode);
  }
  function domReference(node,seen=new Set()){
   if(node?.type==='Identifier') {const found=lookup(currentContext?.env??rootEnv,node.name);if(!found||found.scope.invalid.has(node.name)||seen.has(found.entry)||found.entry.at>node.start)return null;return domReference(found.entry.node,new Set([...seen,found.entry]));}
   if(node?.type==='MemberExpression'&&['previousElementSibling','nextElementSibling'].includes(node.property?.name)){const ref=domReference(node.object,seen);return ref?{...ref,relative:node.property.name}:null;}

   if(node?.type==='MemberExpression'&&node.computed&&node.property?.value===0){const ref=domReference(node.object);return ref?{...ref,index:0}:null;}
   if(calleeName(node)==='document.body'&&!lookup(currentContext?.env??rootEnv,'document')&&!lookup(currentContext?.env??rootEnv,'document','functions'))return {selector:'body',index:0};
   if(node?.type!=='CallExpression')return null;
   const name=calleeName(node.callee),arg=node.arguments[0]?.value;const head=name?.split('.')[0];if(head&&(['$','jQuery','document'].includes(head))&&(lookup(currentContext?.env??rootEnv,head)||lookup(currentContext?.env??rootEnv,head,'functions')))return null;if(['$','jQuery'].includes(name)&&node.arguments[0]?.type==='ThisExpression')return {selector:'this',library:'jquery'};if(typeof arg!=='string')return null;
   if(['$','jQuery'].includes(name))return {selector:arg,library:'jquery'};
   if(name==='document.getElementById')return {selector:'#'+arg};
   if(name==='document.getElementsByName')return {selector:'[name="'+arg.replaceAll('"','')+'"]'};
   if(['document.querySelector','document.body.querySelector'].includes(name))return {selector:arg,index:0};
   return null;
  }
  function visitNode(node,ctx) {
   if(!node?.type||functionTypes.has(node.type))return;
   if(unit.event==='keypress'&&parsed.ast.type==='Program'&&parsed.ast.body.length===1&&parsed.ast.body[0]===node&&ctx.depth===0&&!ctx.guard&&!ctx.parentId&&!lookup(ctx.env??rootEnv,'event')) {
    const filter=keyFilter(node);if(filter){emit('VALIDATE',node,ctx,{operation:'keyFilter',...filter});return;}
   }
   if(node.type==='ReturnStatement'&&node.argument?.type==='CallExpression'&&!ctx.guard&&ctx.depth===0&&!ctx.parentId&&unit.event){
    const call=node.argument,name=calleeName(call.callee);
    if(['confirm','window.confirm'].includes(name)&&!lookup(ctx.env??rootEnv,name)&&!lookup(ctx.env??rootEnv,name,'functions')&&!lookup(ctx.env??rootEnv,name.split('.')[0])){
     const message=value(call.arguments[0]);emit('OPEN_DIALOG',call,ctx,{operation:'confirm',cancelsDefault:true,message:message.value},message.status);return;
    }
   }
   if(node.type==='ReturnStatement'&&node.argument?.value===false&&!ctx.guard){emit('UI_STATE_CHANGE',node,ctx,{operation:'preventSubmit'});return;}
   if(node.type==='WithStatement'){
    const ref=domReference(node.object),list=node.body?.body;
    const assignments=list?.slice(0,2).map(s=>s.type==='ExpressionStatement'?s.expression:null),last=list?.[2]?.expression;
    if(ref&&list.length===3&&assignments.every(a=>a?.type==='AssignmentExpression'&&a.operator==='='&&a.left.type==='Identifier')&&assignments.map(a=>a.left.name).sort().join(',')==='action,method'&&last?.type==='CallExpression'&&last.callee.type==='Identifier'&&last.callee.name==='submit'&&!last.arguments.length){
     const form=selectNodes(ref.selector,unitDom);const ids=new Set(form.map(f=>f.id));let changed=true;while(changed){changed=false;for(const d of unitDom)if(ids.has(d.parent)&&!ids.has(d.id)){ids.add(d.id);changed=true;}}
     const action=assignments.find(a=>a.left.name==='action'),method=assignments.find(a=>a.left.name==='method'),url=value(action.right),verb=value(method.right);
     if(form.length===1&&form[0].tag==='form'&&!unitDom.some(d=>ids.has(d.id)&&['action','method','submit'].includes(d.attrs?.name))&&url.value&&['get','post'].includes(verb.value?.toLowerCase())){emit('SUBMIT_FORM',node,ctx,{selector:ref.selector,url:url.value,method:verb.value.toUpperCase()},url.status);return;}
    }
    emit('UNKNOWN',node,ctx,{},'UNRESOLVED');return;
   }
   if(node.type==='SwitchStatement'){
    const ref=node.discriminant?.type==='MemberExpression'&&node.discriminant.property?.name==='value'?domReference(node.discriminant.object):null;
    if(ref&&node.cases.every(c=>c.test?.type==='Literal'&&typeof c.test.value==='string'&&c.consequent.at(-1)?.type==='BreakStatement')){
     for(const branch of node.cases)for(const child of branch.consequent)if(child.type!=='BreakStatement')visit(child,{...ctx,when:{selector:ref.selector,value:branch.test.value}});return;
    }
   }
   if(node.type==='IfStatement'&&unit.event&&ctx.depth===0&&!ctx.guard&&!ctx.parentId&&parsed.ast.body.length===1&&!node.alternate&&node.test.type==='UnaryExpression'&&node.test.operator==='!'){
    const call=node.test.argument,statements=node.consequent.type==='BlockStatement'?node.consequent.body:[node.consequent];
    if(call.type==='CallExpression'&&['confirm','window.confirm'].includes(calleeName(call.callee))&&call.arguments.length===1&&statements.length===1&&statements[0].type==='ReturnStatement'&&statements[0].argument?.value===false&&!lookup(ctx.env,calleeName(call.callee))&&!lookup(ctx.env,calleeName(call.callee),'functions')&&!lookup(ctx.env,calleeName(call.callee).split('.')[0])){const message=value(call.arguments[0]);if(message.status==='CONFIRMED'){emit('OPEN_DIALOG',call,ctx,{operation:'confirm',cancelsDefault:true,message:message.value});return;}}
   }
   if(node.type==='IfStatement') {const exists=n=>{if(n?.type==='LogicalExpression'&&n.operator==='&&')return exists(n.left)&&exists(n.right);const ref=domReference(n);if(!ref)return false;const matched=selectNodes(ref.selector,unitDom,ctx.triggerId);return matched.length===1&&!matched[0].dynamic;};if(exists(node.test)){visit(node.consequent,ctx);return;}visit(node.test,ctx);visit(node.consequent,{...ctx,guard:ctx.guard?ctx.guard+' && '+text(node.test,code):text(node.test,code)});if(node.alternate){const negated='!('+text(node.test,code)+')';visit(node.alternate,{...ctx,guard:ctx.guard?ctx.guard+' && '+negated:negated});}return;}
   if(node.type==='AssignmentExpression') {
    const name=calleeName(node.left);
    if(node.left?.type==='MemberExpression'&&node.left.property?.name==='display'&&node.left.object?.property?.name==='style'){
     const ref=domReference(node.left.object.object),v=value(node.right);if(ref&&v.status==='CONFIRMED'){emit('UI_STATE_CHANGE',node,ctx,{operation:'setStyle',...ref,property:'display',value:v.value,...(ctx.when?{when:ctx.when}:{})});return;}
    }
    if(node.left.type==='MemberExpression'&&node.left.property?.name==='value'){
     const ref=domReference(node.left.object),v=value(node.right);
     if(ref&&v.status==='CONFIRMED'){emit('SELECT_CHANGE',node,ctx,{operation:'setValue',...ref,value:v.value});return;}
    }
    if(['window.onload','document.onload'].includes(name)&&functionTypes.has(node.right.type)){visit(node.right.body,{...root,event:'load'});return;}
    if(['location.href','window.location.href','window.location','location','window.self.location','window.self.location.href','self.location','self.location.href'].includes(name)){if(['window','self','location'].includes(name.split('.')[0])&&(lookup(ctx.env,name.split('.')[0])||lookup(ctx.env,name.split('.')[0],'functions')))return;const v=navigationValue(node.right);emit('NAVIGATE',node,ctx,{url:v.value,...(v.status==='INFERRED'?{operation:'queryNavigation'}:{})},v.status);return;}
    if(node.left.type==='MemberExpression'&&node.left.computed){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');return;}
    if(name?.endsWith('.value')||name?.includes('.style.')||['innerHTML','textContent','disabled','checked'].includes(node.left.property?.name)) {emit(name?.endsWith('.value')?'SELECT_CHANGE':'UI_STATE_CHANGE',node,ctx);return;}
    const registration=registered.get(text(node,code));if(registration){for(const b of registration)bound(b,ctx);return;}
   }
   if(node.type==='CallExpression') {
    if(functionTypes.has(node.callee.type)){execute(node.callee,node.arguments,ctx,node);return;}
    const name=calleeName(node.callee),method=node.callee.property?.name,args=node.arguments,receiver=node.callee.object;
    if(calendarScreens.has(unit.screenId)&&name==='showCal'){
     const calendar=calendars.get(unit.screenId)?.get(value(args[0]).value);
     if(calendar&&calendarFormats.get(unit.screenId)){emit('UI_STATE_CHANGE',node,ctx,{operation:'datePicker',selector:'[name="'+calendar.field.replaceAll('"','')+'"]',title:calendar.title,format:calendarFormats.get(unit.screenId)});return;}
    }
    if(calendarScreens.has(unit.screenId)&&['addCalendar','setWidth','setColor','setFont','setFormat','setSize','setFontColor','setWeekDay','setMonthNames','setDayNames','setLinkNames'].includes(name))return;
    if(method==='controller'&&receiver?.type==='CallExpression'&&calleeName(receiver.callee)==='angular.module')return;
    if(lookup(ctx.env??rootEnv,name,'functions')||lookup(ctx.env??rootEnv,name)){if(execute(node.callee,args,ctx,node))return;emit('UNKNOWN',node,ctx,{callee:name},'UNRESOLVED');return;}
    const ready=(name==='$'||name==='jQuery')&&functionTypes.has(args[0]?.type);
    const load=method==='ready'||(method==='addEventListener'&&['load','DOMContentLoaded'].includes(args[0]?.value)&&['window','document'].includes(calleeName(receiver))&&!lookup(ctx.env??rootEnv,calleeName(receiver))&&!lookup(ctx.env??rootEnv,calleeName(receiver),'functions'));
    if(ready||load||(['$','jQuery'].includes(name)&&args[0]?.type==='Identifier')){const fn=ready||['$','jQuery'].includes(name)?args[0]:args[method==='ready'?0:1];execute(fn,[],{...root,event:load&&method!=='ready'?'load':'ready'},node,true);return;}
    if(['done','then','success','catch','fail','finally'].includes(method)&&receiver?.type==='CallExpression'){const parent=visit(receiver,ctx);for(const fn of args)if(functionTypes.has(fn?.type)||fn?.type==='Identifier')execute(fn,[],{...ctx,parentId:parent?.id??ctx.parentId,event:method},node,true);return parent;}
    const registration=registered.get(text(node,code))??(['on','click','change','submit','blur','focus','input','keydown','keyup','addEventListener'].includes(method)?bindings(unit,unitDom,{node,status:parsed.status,resolveSelector:value,resolveReceiver:n=>domReference(n)?.selector,thisId:ctx.triggerId}):[]);if(registration.some(b=>b.handler)){for(const b of registration)if(b.handler)bound(b,ctx);return;}
    if(!name&&node.callee.type==='MemberExpression'&&node.callee.computed){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','動態呼叫：'+text(node.callee,code)));return;}
    if(name==='eval'||name==='Function'){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','禁止解析執行式呼叫：'+name));return;}
    if(['location.assign','location.replace','window.location.assign','window.location.replace','history.pushState','window.history.pushState','window.open'].includes(name)){const v=value(args[name?.endsWith('pushState')?2:0]);emit(name==='window.open'?'OPEN_DIALOG':'NAVIGATE',node,ctx,{url:v.value},v.status);return;}
    if(['alert','confirm','prompt','window.alert','window.confirm','window.prompt'].includes(name)){const message=value(args[0]);emit('OPEN_DIALOG',node,ctx,{operation:'message',message:message.value},message.status);return;}
    if(['location.reload','window.location.reload'].includes(name)){emit('UI_STATE_CHANGE',node,ctx,{operation:'reload'});return;}
    if(['window.print','print'].includes(name)){emit('UI_STATE_CHANGE',node,ctx,{operation:'print'});return;}
    const ref=domReference(receiver);const jquery=ref?.library==='jquery';
    let api=false,urlNode=null,methodValue='GET',data=null;
    if(['$.ajax','jQuery.ajax'].includes(name)){api=true;urlNode=prop(args[0],'url');methodValue=configuredMethod(args[0]);data=prop(args[0],'data');}
    else if(['$.get','$.post','$.getJSON','jQuery.get','jQuery.post','jQuery.getJSON'].includes(name)){api=true;urlNode=args[0];methodValue=name.endsWith('.post')?'POST':'GET';data=args[1];}
    else if(name==='$http'){api=true;urlNode=prop(args[0],'url');methodValue=configuredMethod(args[0]);data=prop(args[0],'data');}
    else if(name?.startsWith('$http.')){api=true;urlNode=args[0];methodValue=name.slice(6).toUpperCase();data=args[1];}
    else if(name==='fetch'){api=true;urlNode=args[0];methodValue=configuredMethod(args[1]);data=prop(args[1],'body');}
    else if(name==='axios'||name?.startsWith('axios.')){api=true;urlNode=name==='axios'?prop(args[0],'url'):args[0];methodValue=name==='axios'?configuredMethod(args[0]):name.slice(6).toUpperCase();data=name==='axios'?prop(args[0],'data'):args[1];}
    else if(jquery&&method==='load'&&args.length){api=true;urlNode=args[0];data=args[1];methodValue=data?.type==='ObjectExpression'?'POST':'GET';}
    else if(method==='send'&&xhr.has(receiver?.name)){api=true;const opens=xhr.get(receiver.name);if(opens.length>1){const urlCandidates=[...new Set(opens.map(a=>value(a[1]).value).filter(Boolean))].sort();return emit('CALL_API',node,ctx,{url:null,method:null,urlCandidates,dataFields:fields(args[0])},'AMBIGUOUS');}const opened=opens[0];urlNode=opened?.[1];methodValue=value(opened?.[0]).value??null;data=args[0];}
    if(api){const v=value(urlNode),configurationSource=flowObjects.get(asObject(args[0]))??flowObjects.get(asObject(args[1]));const b=emit('CALL_API',node,ctx,{url:v.value,method:methodValue?.toUpperCase()??null,dataFields:fields(data),...(configurationSource?{configurationSource}:{})},methodValue?configurationSource?status(v.status,'INFERRED'):v.status:'UNRESOLVED');for(const event of ['success','error']){const callback=prop(args[0],event);if(callback)execute(callback,[],{...ctx,parentId:b.id,event},node,true);}return b;}
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
     const selector={value:ref.selector,status:'CONFIRMED'};
     if(['addClass','removeClass','toggleClass'].includes(method)&&args.length===1){const v=value(args[0]);if(v.status==='CONFIRMED'&&/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(v.value)){emit('UI_STATE_CHANGE',node,ctx,{operation:method==='addClass'?'classAdd':method==='removeClass'?'classRemove':'classToggle',selector:selector.value,value:v.value});return;}}
     if(method==='text'&&args.length){const v=value(args[0]);if(v.status==='CONFIRMED'){emit('UI_STATE_CHANGE',node,ctx,{operation:'setText',selector:selector.value,value:v.value},v.status);return;}}
     if(method==='css'&&args.length===2&&['color','display'].includes(args[0]?.value)){const v=value(args[1]);if(v.status==='CONFIRMED'){emit('UI_STATE_CHANGE',node,ctx,{operation:'setStyle',selector:selector.value,property:args[0].value,value:v.value},v.status);return;}}
     if(['show','hide','toggle'].includes(method)&&selector.status==='CONFIRMED'){emit('UI_STATE_CHANGE',node,ctx,{operation:method,selector:selector.value});return;}
     if(method==='val'&&args.length&&selector.status==='CONFIRMED'){const v=value(args[0]);if(v.status==='CONFIRMED'){emit('SELECT_CHANGE',node,ctx,{operation:'setValue',selector:selector.value,value:v.value});return;}}

     if(['val','html','text'].includes(method)&&!args.length)return;
     const mapped=Object.entries(table).find(([,entry])=>entry.apis[method]);if(mapped){const selector=selectorOf(receiver,code);const operation=table[mapped[0]].operations?.[method]?.[args[0]?.value]??mapped[1].apis[method];const target=operation==='OPEN_DIALOG'?dialogTarget(selector):{};const {status:targetStatus,...attributes}=target;emit(operation,node,ctx,{library:mapped[0],selector,...attributes},targetStatus);return;}
    }
    if(['add','remove','toggle'].includes(method)&&receiver?.property?.name==='classList'){const target=domReference(receiver.object),v=value(args[0]);if(target&&args.length===1&&v.status==='CONFIRMED'&&/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(v.value))emit('UI_STATE_CHANGE',node,ctx,{operation:'class'+method[0].toUpperCase()+method.slice(1),...target,value:v.value});else emit('UI_STATE_CHANGE',node,ctx);return;}
    if(['JSON.stringify','JSON.parse','console.log','Object.keys','Object.values'].includes(name)||['$','jQuery'].includes(name))return;
    if(execute(node.callee,args,ctx,node))return;
   emit('UNKNOWN',node,ctx,{callee:text(node.callee,code)},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,ctx.controllerName?'ANGULAR_CONTROLLER_UNRESOLVED':'UNKNOWN_CALL',ctx.controllerName?'AngularJS 控制器函式無法對應：'+text(node.callee,code):'未知函式呼叫：'+text(node.callee,code)));return;
   }
   for(const child of children(node))visit(child,ctx);
  }
  function bound(binding,ctx) {
   const ids=binding.triggerIds.length?binding.triggerIds:[unit.screenId??ctx.triggerId];
   for(const triggerId of ids){const domGuard=unitDom.find(d=>d.componentId===triggerId)?.guard;const child={...ctx,triggerId,event:binding.event,selector:binding.selector,status:binding.status,guard:domGuard?(ctx.guard?ctx.guard+" && "+domGuard:domGuard):ctx.guard,trace:[...(ctx.trace??[]),{source:binding.source,callee:binding.callee??binding.expression}]};if(binding.handler?.type==='Program')visit(binding.handler,child);else if(binding.handler&&!execute(binding.handler,[],child,binding.handler,true))emit('UNKNOWN',binding.handler,child,{callee:text(binding.handler,code)},'UNRESOLVED');}
  }
  function invoke(fn,args,ctx,call,declEnv,asHandler=false) {
   const key=unit.file+':'+fn.start;
   if(ctx.stack.includes(key)||ctx.depth>=maxDepth){emit('UNKNOWN',call,ctx,{callee:text(call,code)},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(call).line,ctx.controllerName?'ANGULAR_SCOPE_DEPTH_LIMIT':ctx.stack.includes(key)?'JS_CALL_CYCLE':'JS_DEPTH_LIMIT','函式追蹤停止：'+text(call,code)));return;}
   const env=environment(fn.body,declEnv);fn.params.forEach((p,i)=>{if(p.type==='Identifier')env.values.set(p.name,{resolved:args[i]&&(args[i].value!==null||args[i].properties)?args[i]:{value:'{'+p.name+'}',status:'UNRESOLVED',known:false,tainted:false},at:0});});
   const next={...ctx,env,depth:asHandler?ctx.depth:ctx.depth+1,stack:[...ctx.stack,key]};
   if(/^validate/i.test(fn.id?.name??call.name??'')) {walk(fn.body,n=>{if(n.type==='IfStatement'){let ids=[];walk(n.test,c=>{if(c.type==='CallExpression'&&c.callee.type==='MemberExpression')ids.push(...select(selectorOf(c.callee.object,code),unitDom,ctx.triggerId));});let message=null;walk(n.consequent,c=>{if(c.type==='CallExpression'&&['alert','window.alert'].includes(calleeName(c.callee)))message=c.arguments[0]?.value??null;});for(const id of new Set(ids))rule('custom',n,{...next,guard:text(n.test,code)},id,message,{condition:text(n.test,code)});}});}
   if(ctx.event==='click'&&!ctx.guard&&!ctx.parentId&&!lookup(env,'document')&&!lookup(env,'document','functions')){const gate=workflowGate(fn,{trimProven:provenTrim(unit.screenId)&&!env.values.has('trim')&&!env.functions.has('trim'),domReference});if(gate){emit('VALIDATE',fn.body,next,{operation:'workflowGate',checks:gate.checks});for(const statement of gate.remaining)visit(statement,next);return;}}
   if(asHandler&&ctx.event==='click'){const shape=displayToggle(fn),target=shape&&domReference(shape);if(target){emit('UI_STATE_CHANGE',fn.body,next,{operation:'toggleDisplay',selector:target.selector});return;}}
   if(asHandler&&ctx.event==='click'){const shape=disclosure(fn),button=shape&&domReference(shape.button),menu=shape&&domReference(shape.menu);if(button&&menu){emit('UI_STATE_CHANGE',fn.body,next,{operation:'toggleDisclosure',selector:menu.selector,inputSelector:button.selector});return;}}
   if(asHandler&&ctx.event==='change'&&!lookup(env,'Date')&&!lookup(env,'Date','functions')){const date=dependentDate(fn);const ref=date&&domReference(date.target);if(ref){emit('UI_STATE_CHANGE',fn.body,next,{operation:'dateMin',...ref,days:date.days,inputSelector:ctx.selector});return;}}
   visit(fn.body,next);
  }
  walk(parsed.ast,n=>{if(n.type!=='CallExpression'||n.callee?.type!=='MemberExpression'||n.callee.property?.name!=='controller'||!n.arguments?.[0]?.value||!functionTypes.has(n.arguments[1]?.type))return;const controller=n.arguments[0].value,fn=n.arguments[1];walk(fn.body,a=>{if(a.type!=='AssignmentExpression'||a.left?.type!=='MemberExpression'||calleeName(a.left.object)!=='$scope'||!functionTypes.has(a.right?.type))return;const name=a.left.property?.name;if(!name)return;const key=`${unit.screenId}:${controller}:${name}`;if(!angularFunctions.has(key))angularFunctions.set(key,[]);angularFunctions.get(key).push({file:unit.file,invoke:(args,ctx)=>invoke(a.right,args,ctx,a.right,rootEnv,ctx.stack.length===0)});});});
  function execute(callee,args,ctx,call,asHandler=false) {
   visitNestedApiCalls(args,ctx);
   const resolved=args.map(value);
   if(functionTypes.has(callee?.type)){invoke(callee,resolved,ctx,call,ctx.env??rootEnv,asHandler);return true;}
   const name=calleeName(callee);const local=lookup(ctx.env??rootEnv,name,'functions');
   if(local&&!local.scope.invalid.has(name?.split('.')[0])){invoke(local.entry.node,resolved,{...ctx,trace:[...(ctx.trace??[]),{source:source(call),callee:text(callee,code)}]},call,local.entry.env,asHandler);return true;}
   if(local||lookup(ctx.env??rootEnv,name))return false;
   if(ctx.controllerName){const angularName=name?.startsWith('$scope.')?name.slice(7):name;const angular=angularFunctions.get(`${unit.screenId}:${ctx.controllerName}:${angularName}`)??[];if(angular.length===1){angular[0].invoke(resolved,{...ctx,trace:[...(ctx.trace??[]),{source:source(call),callee:text(callee,code)}]});return true;}}
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
