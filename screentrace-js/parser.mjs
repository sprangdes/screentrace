import {parse} from 'acorn';
import {parse as parseLoose} from 'acorn-loose';
import path from 'node:path';
import {readUtf8Limited} from '../screentrace-capture/safe-files.mjs';
export const MAX_BYTES=8*1024*1024;
export function diagnostic(file,line,code,message) {
 return {code,message,source:{file,line},parser:'AcornStaticParser',status:'UNRESOLVED'};
}
// JSP expressions outside JS strings are unknown arguments, not malformed JS.
// Keep offsets/newlines so evidence still references the original expression.
function maskJspArguments(code,ranges){let result='',i=0,quote=null;
 while(i<code.length){const c=code[i];if(quote){result+=c;i++;if(c==='\\'&&i<code.length){result+=code[i++];continue;}if(c===quote)quote=null;continue;}
  if(['"',"'",'`'].includes(c)){quote=c;result+=c;i++;continue;}
  if(code.startsWith('//',i)){const end=code.indexOf('\n',i);if(end<0)return result+code.slice(i);result+=code.slice(i,end);i=end;continue;}
  if(code.startsWith('/*',i)){const end=code.indexOf('*/',i+2);if(end<0)return result+code.slice(i);result+=code.slice(i,end+2);i=end+2;continue;}
  if((c==='$'||c==='#')&&code[i+1]==='{'){let end=i+2,depth=1,q=null;for(;end<code.length;end++){const x=code[end];if(q){if(x==='\\')end++;else if(x===q)q=null;}else if(x==='"'||x==="'")q=x;else if(x==='{')depth++;else if(x==='}'&&!--depth)break;}if(!depth){ranges.add(i);result+='_$'+code.slice(i+2,end+1).replace(/[^\n]/g,' ');i=end+1;continue;}}
  result+=c;i++;
 }return result;
}
export function parseSource({file,code,module=false,line=1}) {
 const diagnostics=[];let ast=null,status='CONFIRMED';const jspRanges=new Set();
 const options={ecmaVersion:'latest',sourceType:module?'module':'script',locations:true,allowReturnOutsideFunction:true};
 if(Buffer.byteLength(code)>MAX_BYTES) return {file,ast,status:'UNRESOLVED',diagnostics:[diagnostic(file,line,'JS_SOURCE_LIMIT','JavaScript 來源超過 8 MiB 上限')]};
 try {ast=parse(maskJspArguments(code,jspRanges),options);} catch(error) {
  status='UNRESOLVED';diagnostics.push(diagnostic(file,line+(error.loc?.line??1)-1,'JS_SYNTAX_ERROR',`JavaScript 語法錯誤：${error.message}`));
  try {ast=parseLoose(maskJspArguments(code,jspRanges),options);} catch {diagnostics.push(diagnostic(file,line,'JS_RECOVERY_FAILED','JavaScript AST 無法恢復'));}
 }
 if(ast&&jspRanges.size){const mark=node=>{if(!node?.type)return;if(node.type==='Identifier'&&jspRanges.has(node.start))node.jspExpression=true;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(mark);else if(value?.type)mark(value);};mark(ast);}
 return {file,ast,status,diagnostics};
}
export async function parseFile(root,file,options={}) {
 try {return parseSource({file,code:await readUtf8Limited(root,path.resolve(root,file),MAX_BYTES),...options});}
 catch(error) {return {file,ast:null,status:'UNRESOLVED',diagnostics:[diagnostic(file,1,'JS_SOURCE_READ',`JavaScript 來源讀取失敗：${error.message}`)]};}
}
