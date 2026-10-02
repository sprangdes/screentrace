import {parseSource} from './parser.mjs';
export function children(node) {
 return Object.values(node??{}).flatMap(v=>Array.isArray(v)?v.filter(n=>n?.type):v?.type?[v]:[]);
}
export function walk(node,visit) {if(!node?.type)return;visit(node);for(const child of children(node))walk(child,visit);}
export function text(node,code) {return node?code.slice(node.start,node.end):'';}
export function calleeName(node) {
 if(node?.type==='Identifier')return node.name;
 if(node?.type==='ThisExpression')return 'this';
 if(node?.type==='MemberExpression'&&!node.computed){const head=calleeName(node.object);return head?head+'.'+node.property.name:null;}
 return null;
}
function splitSelector(selector) {
 if(typeof selector!=='string'||selector.includes('${')||selector.includes('#{'))return null;
 const parts=selector.trim().match(/(?:\[[^\]]*\]|[^\s\[])+/g);
 return parts?.length?parts:null;
}
function matches(part,node) {
 const pattern=/^([\w:-]+|\*)?((?:[#.][\w-]+|\[name\s*=\s*(?:"[^"]*"|'[^']*'|[\w-]+)\])*)$/;
 const found=pattern.exec(part);if(!found||!found[0])return false;
 if(found[1]&&found[1]!=='*'&&node.tag!==found[1].toLowerCase())return false;
 const attrs=node.attrs??{};
 for(const token of found[2].match(/[#.][\w-]+|\[name\s*=\s*(?:"[^"]*"|'[^']*'|[\w-]+)\]/g)??[]) {
  if(token[0]==='#'&&attrs.id!==token.slice(1))return false;
  if(token[0]==='.'&&!String(attrs.class??'').split(/\s+/).includes(token.slice(1)))return false;
  if(token[0]==='['){const value=token.slice(1,-1).split('=')[1].trim().replace(/^['"]|['"]$/g,'');if(attrs.name!==value)return false;}
 }
 return true;
}
export function selectNodes(selector,dom,thisId=null) {
 if(selector==='this')return dom.filter(n=>n.componentId===thisId||n.id===thisId);
 const parts=splitSelector(selector);if(!parts)return [];
 const index=new Map(dom.map(n=>[n.id,n]));
 return dom.filter(n=>{
  if(!matches(parts.at(-1),n))return false;
  let parent=index.get(n.parent);
  for(let i=parts.length-2;i>=0;i--){while(parent&&!matches(parts[i],parent))parent=index.get(parent.parent);if(!parent)return false;parent=index.get(parent.parent);}
  return true;
 });
}
export function select(selector,dom,thisId=null) {return [...new Set(selectNodes(selector,dom,thisId).map(n=>n.componentId).filter(Boolean))].sort();}
export function selectorOf(node,code) {
 if(node?.type==='ThisExpression')return 'this';
 if(node?.type==='CallExpression') {
  const name=calleeName(node.callee),a=node.arguments[0];
  if(['$','jQuery'].includes(name))return a?.type==='Literal'?String(a.value):a?.type==='ThisExpression'?'this':text(a,code);
  if(name==='document.getElementById')return a?.type==='Literal'?'#'+a.value:text(a,code);
  if(['document.querySelector','document.querySelectorAll'].includes(name))return a?.type==='Literal'?String(a.value):text(a,code);
 }
 return text(node,code);
}
export function bindings(unit,dom=[]) {
 const parsed=parseSource(unit);const result=[];const code=unit.code;
 const add=(node,selector,event,handler,delegated=false)=>{
  const triggerIds=select(selector,dom,unit.triggerId);result.push({selector,event,triggerIds,handler,delegated,screenId:unit.screenId,
   status:parsed.status==='CONFIRMED'&&triggerIds.length?'CONFIRMED':'UNRESOLVED',source:{file:unit.file,line:(unit.line??1)+(node.loc?.start.line??1)-1},expression:text(node,code)});
 };
 if(unit.event){add(parsed.ast,'this',unit.event,parsed.ast);return result;}
 function scan(node) {
  if(!node?.type)return;
  if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))return;
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed) {
   const method=node.callee.property.name,args=node.arguments;
   if(['on','click','change','submit','blur','focus','input','keydown','keyup','addEventListener'].includes(method)) {
    let selector=selectorOf(node.callee.object,code),event=['on','addEventListener'].includes(method)?args[0]?.value:method;
    const delegated=method==='on'&&args[1]?.type==='Literal'&&typeof args[1].value==='string';
    if(delegated)selector=selector+' '+args[1].value;
    add(node,selector,typeof event==='string'?event:text(args[0],code),args[delegated?2:['on','addEventListener'].includes(method)?1:0],delegated);return;
   }
  }
  if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&/^on/.test(node.left.property.name??'')) {
   add(node,selectorOf(node.left.object,code),node.left.property.name.slice(2),node.right);return;
  }
  for(const child of children(node))scan(child);
 }
 scan(parsed.ast);return result;
}
