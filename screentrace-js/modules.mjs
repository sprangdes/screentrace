import path from 'node:path';
import {parseSource,diagnostic} from './parser.mjs';
import {walk} from './bindings.mjs';
export function expandModules(sources,files={}) {
 const result=[],diagnostics=[],seen=new Set();
 function add(unit) {
  const key=unit.screenId+'|'+unit.ownerFile+'|'+unit.file+'|'+(unit.line??1)+'|'+(unit.event??'')+'|'+unit.code;
  if(seen.has(key))return;seen.add(key);const copy={...unit,aliases:{}};result.push(copy);
  if(!unit.module)return;const parsed=parseSource(unit);if(!parsed.ast)return;
  walk(parsed.ast,n=>{
   if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type)||!n.source)return;
   const raw=n.source.value;
   if(typeof raw!=='string'||!raw.startsWith('.')){diagnostics.push(diagnostic(unit.file,(unit.line??1)+n.loc.start.line-1,'JS_MODULE_REFERENCE','非本地模組引用保持未解析：'+raw));return;}
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(unit.file),raw));
   if(target.startsWith('../')||!Object.hasOwn(files,target)){diagnostics.push(diagnostic(unit.file,(unit.line??1)+n.loc.start.line-1,'JS_MODULE_REFERENCE','找不到安全模組來源：'+raw));return;}
   for(const specifier of n.specifiers??[])copy.aliases[specifier.local?.name??specifier.exported?.name]={file:target,name:specifier.type==='ImportDefaultSpecifier'?'default':specifier.type==='ImportNamespaceSpecifier'?'*':specifier.imported?.name??specifier.local?.name};
   add({...unit,file:target,line:1,code:files[target],module:true,event:undefined,triggerId:undefined});
  });
 }
 for(const unit of sources)add(unit);return {sources:result,diagnostics};
}
