import {openingAnchorPositions} from './expansion-anchor.mjs';
import {createHash} from 'node:crypto';
function nestedTagEnd(source,start){
 if(source.startsWith('<%',start)){const e=source.indexOf('%>',start+2);return e<0?-1:e+1;}
 if(!/[A-Za-z]/.test(source[start+1]||''))return -1;
 let q=null;for(let i=start+1;i<source.length;i++){const c=source[i];if(q){if(c===q)q=null;}else if(c==='"'||c==="'")q=c;else if(c==='>')return i;}return -1;
}
// Lexical markup scanner: quoted attributes, raw-text elements and JSP/comment regions are atomic.
export function markupTokens(source) {
 const result=[];let cursor=0,line=1;
 while(cursor<source.length){const start=source.indexOf('<',cursor);if(start<0){result.push({text:source.slice(cursor)});break;}if(start>cursor){const text=source.slice(cursor,start);result.push({text});line+=text.split('\n').length-1;}
  let end;if(source.startsWith('<!--',start))end=source.indexOf('-->',start+4)+3;else if(source.startsWith('<%--',start))end=source.indexOf('--%>',start+4)+4;else if(source.startsWith('<%',start))end=source.indexOf('%>',start+2)+2;
  else{let quote=null,index=start+1;for(;index<source.length;index++){const char=source[index];if(quote){if(char==='<'){const nested=nestedTagEnd(source,index);if(nested>=0){index=nested;continue;}}if(char===quote)quote=null;}else if(char==='"'||char==="'")quote=char;else if(char==='>')break;}end=Math.min(index+1,source.length);}
  if(end<=start)end=source.length;let text=source.slice(start,end),match=/^<\s*(\/?)\s*([A-Za-z][\w:.-]*)(?=[\s/>])/.exec(text);
  if(match&&!match[1]&&['script','style'].includes(match[2].toLowerCase())){const close=new RegExp(`</${match[2]}\\s*>`,'ig');close.lastIndex=end;const last=close.exec(source);if(last)end=close.lastIndex;text=source.slice(start,end);match=null;}
  result.push({text,start,line,name:match?.[2]?.toLowerCase(),originalName:match?.[2],closing:!!match?.[1],selfClosing:/\/\s*>$/.test(text)});line+=text.split('\n').length-1;cursor=end;
 }
 return result;
}
const escape = value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('$','&#36;');
function attributes(text){
 const values={};let index=(/^<\s*[^\s/>]+/.exec(text)?.[0].length)||0;
 while(index<text.length){while(/\s/.test(text[index]||'')&&index<text.length)index++;if(!text[index]||text[index]==='/'||text[index]==='>')break;
  const start=index;while(index<text.length&&!/[\s=/>]/.test(text[index]))index++;const name=text.slice(start,index).toLowerCase();if(!name){index++;continue;}while(/\s/.test(text[index]||'')&&index<text.length)index++;
  let value='';if(text[index]==='='){index++;while(/\s/.test(text[index]||'')&&index<text.length)index++;const quote=text[index];if(quote==='"'||quote==="'"){index++;const begin=index;while(index<text.length&&text[index]!==quote){if(text[index]==='<'){const nested=nestedTagEnd(text,index);if(nested>=0){index=nested+1;continue;}}index++;}value=text.slice(begin,index);index++;}else{const begin=index;while(index<text.length&&!/[\s>]/.test(text[index]))index++;value=text.slice(begin,index).replace(/\/$/,'');}}
  values[name]=value;
 }return values;
}
function componentId(file,kind,identity,occurrence){const fields=[file.replaceAll('\\','/').replace(/^\.\//,''),kind,...Object.keys(identity).sort().flatMap(key=>[key,identity[key]]),String(occurrence)];const bytes=createHash('md5').update(fields.map(value=>`${value.length}:${value}`).join('')).digest();bytes[6]=(bytes[6]&15)|48;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return 'component:'+`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}

function removeReserved(text,names){return stripMarkupAttributes(text,name=>names.includes(name));}
function add(text,attrs){return text.replace(/\s*(\/?)>$/,(_,slash)=>Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')+(slash?'/':'')+'>');}
export function annotateSource(source,file,nodes=[],parentAnchor=''){
 const positions=openingAnchorPositions(source,file),occurrences=new Map();return markupTokens(source).map(t=>{if(!t.name||t.closing)return t.text;
  const identity={...attributes(t.text),tag:t.name},kinds=[...new Set(nodes.filter(n=>n.type==='COMPONENT'&&n.source?.file===file&&n.attributes?.tag?.toLowerCase()===t.name).map(n=>n.attributes.kind).filter(Boolean))];let ids=[];
  for(const kind of kinds){const key=JSON.stringify([kind,Object.entries(identity).sort(([a],[b])=>a<b?-1:a>b?1:0)]),occurrence=occurrences.get(key)||0;occurrences.set(key,occurrence+1);const id=componentId(file,kind,identity,occurrence);if(nodes.some(n=>n.id===id))ids.push(id);}
  const metadata={'data-st-source-file':file,'data-st-source-line':t.line};const position=positions.get(t.start);if(position)metadata['data-st-expansion-anchor']=parentAnchor?parentAnchor+' > '+position:position;if(ids.length===1)metadata['data-st-component-id']=ids[0];
  return add(removeReserved(t.text,['data-st-source-file','data-st-source-line','data-st-component-id','data-st-expansion-anchor']),metadata);
 }).join('');
}

export function annotateConditions(source) {
 const stack=[];return markupTokens(source).map(token=>{
  const kind=token.name?.replace(/^c:/,'');
  if(token.name?.startsWith('c:')&&['if','choose','when','otherwise'].includes(kind)){
   if(token.closing){const index=stack.findLastIndex(s=>s.kind===kind);if(index>=0)stack.splice(index);return '';}
   const test=attributes(token.text).test||'(未知條件)';
   if(kind==='choose')stack.push({kind,seen:[]});
   else if(kind==='if')stack.push({kind,condition:test});
   else{const choose=stack.findLast(s=>s.kind==='choose');const condition=kind==='when'?test:`otherwise（前述條件皆不成立：${choose?.seen.join(' | ')||'未知條件'}）`;if(kind==='when')choose?.seen.push(test);stack.push({kind,condition});}
   if(token.selfClosing)stack.pop();return '';
  }
  if(!token.name||token.closing)return token.text;
  const text=removeReserved(token.text,['data-st-conditional','data-st-condition']);const conditions=stack.filter(s=>s.condition).map(s=>s.condition);
  return conditions.length?add(text,{'data-st-conditional':'true','data-st-condition':JSON.stringify(conditions)}):text;
 }).join('');
}
function dynamicTokens(source){
 const tokens=[];for(let index=0;index<source.length;index++){
  if(source.startsWith('<%--',index)){const end=source.indexOf('--%>',index+4);if(end<0)break;index=end+3;continue;}
  if(source.startsWith('<%@',index)){const end=source.indexOf('%>',index+3);if(end<0)break;index=end+1;continue;}
  if(source.startsWith('<%',index)){const end=source.indexOf('%>',index+2);if(end<0)break;tokens.push({start:index,end:end+2,expression:source.slice(index,end+2),scriptlet:true});index=end+1;continue;}
  if(!source.startsWith('${',index)&&!source.startsWith('#{',index))continue;
  let depth=1,quote=null,end=index+2;for(;end<source.length;end++){const char=source[end];if(quote){if(char==='\\')end++;else if(char===quote)quote=null;}else if(char==='"'||char==="'")quote=char;else if(char==='{')depth++;else if(char==='}'&&--depth===0)break;}
  if(depth!==0)continue;tokens.push({start:index,end:end+1,expression:source.slice(index,end+1)});index=end;
 }return tokens;
}
export function expressionList(source){return [...new Set(dynamicTokens(source).map(token=>token.expression))];}
export function replaceDynamicExpressions(source,resolver){let result='',cursor=0;for(const token of dynamicTokens(source)){result+=source.slice(cursor,token.start)+(token.scriptlet?'示例值':escape(resolver(token.expression.slice(2,-1))));cursor=token.end;}return result+source.slice(cursor);}

export function convertControls(source) {
 const controls={form:'form',input:'input',text:'input',password:'input',hidden:'input',textarea:'textarea',select:'select',option:'option',options:'option',checkbox:'input',radio:'input',submit:'input',reset:'input',button:'button',link:'a',img:'img'};
 return markupTokens(source).map(t=>{
  // Only a host tag whose attribute value nests <bean:write> is rewritten; the bean:write tag itself is left alone.
  if(t.name&&!t.closing&&Object.values(attributes(t.text)).some(value=>value.includes('<bean:write'))){
   const a=attributes(t.text);let opening='<'+t.originalName;
   for(const [key,raw]of Object.entries(a)){
    const value=markupTokens(raw).map(n=>{if(n.name==='bean:write'){const b=attributes(n.text);if(/^[A-Za-z_][\w]*$/.test(b.name||'')&&/^[A-Za-z_][\w]*$/.test(b.property||''))return '${'+b.name+'.'+b.property+'}';return '示例值';}return n.text;}).join('');
    // Raw attribute text is already entity-encoded; re-encoding & would turn &quot; into &amp;quot;.
    opening+=' '+key+'="'+value.replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'"';
   }
   return opening+(t.selfClosing?'/':'')+'>';
  }
  if(t.name&&!t.closing){const a=attributes(t.text),classes=(a.class||'').split(/\s+/);if(classes.some(c=>['modal','offcanvas'].includes(c))&&!classes.includes('show')&&!classes.includes('in'))return add(t.text,{hidden:''});}
  if(!t.name||!['html','form'].includes(t.name.split(':')[0]))return t.text;const name=t.name.split(':')[1],tag=controls[name];if(!tag)return t.text;
  if(t.closing)return ['input','img'].includes(tag)?'':`</${tag}>`;
  let text=t.text.replace(new RegExp(`^<\\s*${t.name}`),`<${tag}`).replace(/\b(?:path|property)\s*=/g,'name=').replace(/\bstyleClass\s*=/gi,'class=').replace(/\bstyleId\s*=/gi,'id=');
  const a=attributes(t.text);if(name==='form'&&!('method' in a))text=add(text,{method:'post'});
  const types={button:'button',text:'text',password:'password',hidden:'hidden',checkbox:'checkbox',radio:'radio',submit:'submit',reset:'reset'};if(types[name])text=add(text,{type:types[name]});
  if(t.selfClosing&&!['input','img'].includes(tag))text=text.replace(/\/\s*>$/,`>${name==='button'?escape(a.value??''):''}</${tag}>`);return text;
 }).join('');
}

export {attributes as markupAttributes};
function attributeSpans(text){
 const spans=[];let i=(/^<\s*[^\s/>]+/.exec(text)?.[0].length)||0;
 while(i<text.length){const start=i;while(/\s/.test(text[i]||'')&&i<text.length)i++;if(!text[i]||'/>'.includes(text[i]))break;
  const nameStart=i;while(i<text.length&&!/[\s=/>]/.test(text[i]))i++;const name=text.slice(nameStart,i).toLowerCase();if(!name){i++;continue;}
  const nameEnd=i;while(/\s/.test(text[i]||'')&&i<text.length)i++;
  if(text[i]!=='='){i=nameEnd;spans.push({start,end:i,name});continue;}i++;while(/\s/.test(text[i]||'')&&i<text.length)i++;
  const quote=['"',"'"].includes(text[i])?text[i++]:null,valueStart=i;
  while(i<text.length&&(quote?text[i]!==quote:!/[\s>]/.test(text[i]))){if(text[i]==='<'){const nested=nestedTagEnd(text,i);if(nested>=0){i=nested+1;continue;}}i++;}
  const valueEnd=i;if(quote&&text[i]===quote)i++;spans.push({start,end:i,name,valueStart,valueEnd,quote});
 }return spans;
}
/** Source cannot supply viewer-owned metadata, including through unquoted attributes. */
export function stripMarkupAttributes(text,predicate){for(const a of attributeSpans(text).reverse())if(predicate(a.name))text=text.slice(0,a.start)+text.slice(a.end);return text;}
/** Replace a parsed value; quoted text in other attributes stays atomic. */
export function replaceMarkupAttribute(text,key,value){const a=attributeSpans(text).find(a=>a.name===key.toLowerCase());if(!a||a.valueStart===undefined)return text;return text.slice(0,a.valueStart)+(a.quote?escape(value).replaceAll("'",'&#39;'):'"'+escape(value)+'"')+text.slice(a.valueEnd);}
