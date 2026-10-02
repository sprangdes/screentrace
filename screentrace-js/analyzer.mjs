import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseSource,diagnostic} from './parser.mjs';
import {bindings,children,walk,text,calleeName,selectorOf,select,selectNodes} from './bindings.mjs';
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
 const behaviors=[],rules=[],diagnostics=[],libraries=[],dom=request.dom??[],occurrences=new Map();
 const stable=(kind,...parts)=>{const key=JSON.stringify(parts),count=occurrences.get(kind+key)??0;occurrences.set(kind+key,count+1);return kind+':js:'+createHash('sha256').update(JSON.stringify([...parts,count])).digest('hex').slice(0,24);};
 for(const unit of request.sources??[]) {
  const library=identifyLibrary(unit.file,unit.code);if(library){libraries.push({file:unit.file,name:library,source:{file:unit.file,line:1}});continue;}
  const parsed=parseSource(unit);diagnostics.push(...parsed.diagnostics);if(!parsed.ast)continue;
  const code=unit.code,unitDom=dom.filter(d=>!unit.ownerFile||d.ownerFile===unit.ownerFile||d.screenId===unit.screenId);
  const source=n=>({file:unit.file,line:(unit.line??1)+(n?.loc?.start.line??1)-1});
  const value=n=>n?.type==='Literal'&&['string','number','boolean'].includes(typeof n.value)?{value:String(n.value),status:'CONFIRMED'}:{value:null,status:'UNRESOLVED'};
  const prop=(object,name)=>object?.type==='ObjectExpression'?object.properties.find(p=>!p.computed&&(p.key.name??p.key.value)===name)?.value:null;
  const fields=n=>{
   if(n?.type==='ObjectExpression')return n.properties.filter(p=>p.type==='Property'&&!p.computed).map(p=>String(p.key.name??p.key.value)).sort();
   if(n?.type==='CallExpression'&&calleeName(n.callee)==='JSON.stringify')return fields(n.arguments[0]);
   if(n?.type==='CallExpression'&&n.callee.property?.name==='serialize') {
    const forms=selectNodes(selectorOf(n.callee.object,code),unitDom);const ids=new Set(forms.map(f=>f.id));let changed=true;while(changed){changed=false;for(const d of unitDom)if(ids.has(d.parent)&&!ids.has(d.id)){ids.add(d.id);changed=true;}}
    return [...new Set(unitDom.filter(d=>ids.has(d.id)&&d.attrs?.name).map(d=>d.attrs.name))].sort();
   }return [];
  };
  const root={triggerId:unit.triggerId??unit.screenId??null,event:unit.event??'load',selector:unit.event?'this':null,status:unit.event&&!unit.triggerId?'UNRESOLVED':'CONFIRMED',guard:null,parentId:null};
  const emit=(type,node,ctx,extra={},resolution='CONFIRMED')=>{
   const expression=text(node,code),id=stable('behavior',unit.file,ctx.triggerId,ctx.event,type,expression,ctx.parentId);
   const b={id,type,triggerId:ctx.triggerId,event:ctx.event,selector:ctx.selector,guard:ctx.guard,parentId:ctx.parentId,expression,source:source(node),parser:'AcornStaticAnalyzer',status:status(parsed.status,unit.status,ctx.status,resolution),...extra};behaviors.push(b);return b;
  };
  const rule=(kind,node,ctx,field,message,parameters={},resolution='CONFIRMED')=>{
   const id=stable('validation',unit.file,field,kind,text(node,code));const r={id,kind,fields:[field],message,parameters,layer:'CLIENT',source:source(node),parser:'AcornStaticAnalyzer',status:status(parsed.status,unit.status,ctx.status,resolution)};rules.push(r);emit('VALIDATE',node,ctx,{targetId:id},resolution);return r;
  };
  const bootstrapInstances=new Map();walk(parsed.ast,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='NewExpression'&&calleeName(n.init.callee)?.startsWith('bootstrap.'))bootstrapInstances.set(n.id.name,calleeName(n.init.callee));});
  const httpMethod=(n,fallback='GET')=>n?value(n).value:fallback;
  const xhr=new Map();walk(parsed.ast,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='NewExpression'&&calleeName(n.init.callee)==='XMLHttpRequest')xhr.set(n.id.name,null);if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.property.name==='open'&&xhr.has(n.callee.object.name))xhr.set(n.callee.object.name,n.arguments);});
  const registered=new Map(bindings(unit,unitDom).filter(b=>b.handler).map(b=>[b.expression,b]));
  function visit(node,ctx) {
   if(!node?.type||functionTypes.has(node.type))return;
   if(node.type==='IfStatement') {visit(node.test,ctx);visit(node.consequent,{...ctx,guard:ctx.guard?ctx.guard+' && '+text(node.test,code):text(node.test,code)});if(node.alternate)visit(node.alternate,{...ctx,guard:'!('+text(node.test,code)+')'});return;}
   if(node.type==='AssignmentExpression') {
    const name=calleeName(node.left);
    if(['window.onload','document.onload'].includes(name)&&functionTypes.has(node.right.type)){visit(node.right.body,{...root,event:'load'});return;}
    if(['location.href','window.location.href','window.location','location'].includes(name)){const v=value(node.right);emit('NAVIGATE',node,ctx,{url:v.value},v.status);return;}
    if(node.left.type==='MemberExpression'&&node.left.computed){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');return;}
    if(name?.endsWith('.value')||name?.includes('.style.')||['innerHTML','textContent','disabled','checked'].includes(node.left.property?.name)) {emit(name?.endsWith('.value')?'SELECT_CHANGE':'UI_STATE_CHANGE',node,ctx);return;}
    const binding=registered.get(text(node,code));if(binding){bound(binding,ctx);return;}
   }
   if(node.type==='CallExpression') {
    const name=calleeName(node.callee),method=node.callee.property?.name,args=node.arguments,receiver=node.callee.object;
    const ready=(name==='$'||name==='jQuery')&&functionTypes.has(args[0]?.type);
    const load=method==='ready'||(method==='addEventListener'&&args[0]?.value==='load'&&['window','document'].includes(calleeName(receiver)));
    if(ready||load){const fn=ready?args[0]:args[method==='ready'?0:1];if(functionTypes.has(fn?.type))visit(fn.body,{...root,event:load&&method!=='ready'?'load':'ready'});return;}
    const binding=registered.get(text(node,code));if(binding&&binding.handler){bound(binding,ctx);return;}
    if(!name&&node.callee.type==='MemberExpression'&&node.callee.computed){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','動態呼叫：'+text(node.callee,code)));return;}
    if(name==='eval'||name==='Function'){emit('UNKNOWN',node,ctx,{},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','禁止解析執行式呼叫：'+name));return;}
    if(['location.assign','location.replace','window.location.assign','window.location.replace','history.pushState','window.history.pushState','window.open'].includes(name)){const v=value(args[name?.endsWith('pushState')?2:0]);emit(name==='window.open'?'OPEN_DIALOG':'NAVIGATE',node,ctx,{url:v.value},v.status);return;}
    if(['alert','confirm','prompt','window.alert','window.confirm','window.prompt'].includes(name)){emit('OPEN_DIALOG',node,ctx,{message:value(args[0]).value});return;}
    const jquery=receiver?.type==='CallExpression'&&['$','jQuery'].includes(calleeName(receiver.callee));
    let api=false,urlNode=null,methodValue='GET',data=null;
    if(['$.ajax','jQuery.ajax'].includes(name)){api=true;urlNode=prop(args[0],'url');methodValue=httpMethod(prop(args[0],'method')??prop(args[0],'type'));data=prop(args[0],'data');}
    else if(['$.get','$.post','$.getJSON','jQuery.get','jQuery.post','jQuery.getJSON'].includes(name)){api=true;urlNode=args[0];methodValue=name.endsWith('.post')?'POST':'GET';data=args[1];}
    else if(name==='fetch'){api=true;urlNode=args[0];methodValue=httpMethod(prop(args[1],'method'));data=prop(args[1],'body');}
    else if(name==='axios'||name?.startsWith('axios.')){api=true;urlNode=name==='axios'?prop(args[0],'url'):args[0];methodValue=name==='axios'?httpMethod(prop(args[0],'method')):name.slice(6).toUpperCase();data=name==='axios'?prop(args[0],'data'):args[1];}
    else if(jquery&&method==='load'&&args.length){api=true;urlNode=args[0];data=args[1];methodValue=data?.type==='ObjectExpression'?'POST':'GET';}
    else if(method==='send'&&xhr.has(receiver?.name)){api=true;const opened=xhr.get(receiver.name);urlNode=opened?.[1];methodValue=value(opened?.[0]).value??null;data=args[0];}
    if(api){const v=value(urlNode);emit('CALL_API',node,ctx,{url:v.value,method:methodValue?.toUpperCase()??null,dataFields:fields(data)},methodValue?v.status:'UNRESOLVED');return;}
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
    if(bootstrapInstances.has(receiver?.name)&&['show','hide','toggle'].includes(method)){emit(bootstrapInstances.get(receiver.name)==='bootstrap.Modal'&&method!=='hide'?'OPEN_DIALOG':'UI_STATE_CHANGE',node,ctx,{library:'bootstrap'});return;}
    if(jquery) {
     const mapped=Object.entries(table).find(([,entry])=>entry.apis[method]);if(mapped){emit(mapped[1].apis[method],node,ctx,{library:mapped[0],selector:selectorOf(receiver,code)});return;}
    }
    if(['add','remove','toggle'].includes(method)&&receiver?.property?.name==='classList'){emit('UI_STATE_CHANGE',node,ctx);return;}
    if(['JSON.stringify','JSON.parse','console.log','Object.keys','Object.values'].includes(name)||['$','jQuery'].includes(name))return;
    emit('UNKNOWN',node,ctx,{callee:text(node.callee,code)},'UNRESOLVED');diagnostics.push(diagnostic(unit.file,source(node).line,'UNKNOWN_CALL','未知函式呼叫：'+text(node.callee,code)));return;
   }
   for(const child of children(node))visit(child,ctx);
  }
  function bound(binding,ctx) {
   const ids=binding.triggerIds.length?binding.triggerIds:[unit.screenId??ctx.triggerId];
   for(const triggerId of ids){const child={...ctx,triggerId,event:binding.event,selector:binding.selector,status:binding.status};if(functionTypes.has(binding.handler?.type))visit(binding.handler.body,child);else if(binding.handler?.type==='Program')visit(binding.handler,child);else if(binding.handler)emit('UNKNOWN',binding.handler,child,{callee:text(binding.handler,code)},'UNRESOLVED');}
  }
  if(unit.event)visit(parsed.ast,root);else visit(parsed.ast,root);
 }
 return {schemaVersion:'1.0',behaviors,rules,diagnostics,libraries};
}
