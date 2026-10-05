// OQ-017: count original opening qualified names before any expansion or conversion.
export function openingAnchorPositions(source,file) {
 const tags=[];let line=1,lineCursor=0;
 const expressionEnd=start=>{let depth=1,quote=null;for(let i=start+2;i<source.length;i++){const c=source[i];if(quote){if(c==='\\')i++;else if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return i;}return source.length-1;};
 for(let start=0;start<source.length;start++){
  if(source.startsWith('${',start)||source.startsWith('#{',start)){start=expressionEnd(start);continue;}
  if(source[start]!=='<')continue;
  let terminator,offset;
  if(source.startsWith('<!--',start)){terminator='-->';offset=4;}
  else if(source.startsWith('<%--',start)){terminator='--%>';offset=4;}
  else if(source.startsWith('<![CDATA[',start)){terminator=']]>';offset=9;}
  else if(source.startsWith('<%',start)){terminator='%>';offset=2;}
  if(terminator){const end=source.indexOf(terminator,start+offset);if(end<0)break;start=end+terminator.length-1;continue;}
  let quote=null,end=start+1;for(;end<source.length;end++){const c=source[end];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}if(end===source.length)break;
  while(lineCursor<start)if(source[lineCursor++]==='\n')line++;
  const token=source.slice(start,end+1),match=/^<\s*([A-Za-z][\w:.-]*)(?=[\s/>])/.exec(token);
  if(match){const name=match[1].toLowerCase();tags.push({start,line,name});
   if(['script','style'].includes(name)){const closing=source.toLowerCase().indexOf('</'+name,end+1);if(closing<0)break;start=closing-1;continue;}}
  start=end;
 }
 const counts=new Map(),ordinals=new Map();for(const t of tags){const key=t.name+':'+t.line;counts.set(key,(counts.get(key)||0)+1);}
 return new Map(tags.map(t=>{const key=t.name+':'+t.line,n=(ordinals.get(key)||0)+1;ordinals.set(key,n);return[t.start,`${file.replaceAll('\\','/')}:${t.line}${counts.get(key)>1?'#'+n:''}`];}));
}
export function metadataValue(value=''){return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,(_m,key)=>{if(key[0]==='#'){const n=Number.parseInt(key.slice(key[1]?.toLowerCase()==='x'?2:1),key[1]?.toLowerCase()==='x'?16:10);return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):_m;}return{amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key.toLowerCase()]||_m;});}
