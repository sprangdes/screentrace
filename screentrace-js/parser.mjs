import {parse} from 'acorn';
import {parse as parseLoose} from 'acorn-loose';
import path from 'node:path';
import {readUtf8Limited} from '../screentrace-capture/safe-files.mjs';
export const MAX_BYTES=8*1024*1024;
export function diagnostic(file,line,code,message) {
 return {code,message,source:{file,line},parser:'AcornStaticParser',status:'UNRESOLVED'};
}
export function parseSource({file,code,module=false,line=1}) {
 const diagnostics=[];let ast=null,status='CONFIRMED';
 const options={ecmaVersion:'latest',sourceType:module?'module':'script',locations:true,allowReturnOutsideFunction:true};
 if(Buffer.byteLength(code)>MAX_BYTES) return {file,ast,status:'UNRESOLVED',diagnostics:[diagnostic(file,line,'JS_SOURCE_LIMIT','JavaScript 來源超過 8 MiB 上限')]};
 try {ast=parse(code,options);} catch(error) {
  status='UNRESOLVED';diagnostics.push(diagnostic(file,line+(error.loc?.line??1)-1,'JS_SYNTAX_ERROR',`JavaScript 語法錯誤：${error.message}`));
  try {ast=parseLoose(code,options);} catch {diagnostics.push(diagnostic(file,line,'JS_RECOVERY_FAILED','JavaScript AST 無法恢復'));}
 }
 return {file,ast,status,diagnostics};
}
export async function parseFile(root,file,options={}) {
 try {return parseSource({file,code:await readUtf8Limited(root,path.resolve(root,file),MAX_BYTES),...options});}
 catch(error) {return {file,ast:null,status:'UNRESOLVED',diagnostics:[diagnostic(file,1,'JS_SOURCE_READ',`JavaScript 來源讀取失敗：${error.message}`)]};}
}
