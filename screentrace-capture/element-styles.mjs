import {createHash} from 'node:crypto';
const sorted = values => Object.fromEntries(Object.entries(values).sort(([a],[b])=>a.localeCompare(b,'en')));
export function captureOptions(args) {
 const read=(key,fallback)=>{const raw=args.find(s=>s.startsWith(`--${key}=`));if(!raw)return fallback;const value=Number(raw.split('=')[1]);if(!Number.isSafeInteger(value)||value<1)throw new Error(`無效預覽設定：${key}`);return value;};
 return {maxElements:read('style-element-limit',50000),maxStyleBytes:read('style-byte-limit',16*1024*1024)};
}
function componentLinks(elements,graph,screenId) {
 const owned=new Set(graph.relationships.filter(e=>e.type==='CONTAINS'&&e.from===screenId).map(e=>e.to));
 const nodes=graph.nodes.filter(n=>n.type==='COMPONENT'&&owned.has(n.id)).sort((a,b)=>a.source.file.localeCompare(b.source.file,'en')||a.source.line-b.source.line||a.id.localeCompare(b.id,'en'));
 const used=new Set();
 for(const element of elements) {
  const matches=(key,value)=>value?nodes.filter(n=>n.attributes?.[key]===value):[];
  const exact=nodes.filter(n=>element.source&&n.source.file===element.source.file&&n.source.line===element.source.line&&n.attributes?.tag?.split(':').at(-1)===element.tag);
  let candidates=matches('expansionAnchor',element.expansionAnchor),basis=candidates.length?'ANCHOR':undefined;
  if(!candidates.length)candidates=nodes.filter(n=>n.id===element.sourceComponentId);if(!candidates.length)candidates=matches('id',element.id);if(!candidates.length)candidates=matches('name',element.name);
  if(!candidates.length)candidates=matches('field',element.name);
  if(!candidates.length&&exact.length)candidates=exact.filter(n=>!used.has(n.id));
  if(candidates.length)element.matchBasis=basis||'HEURISTIC';
  element.graphComponentCandidates=candidates.map(n=>n.id).sort();element.graphComponentId=candidates.length===1?candidates[0].id:null;
  element.componentResolution=candidates.length===1?'INFERRED':candidates.length>1?'AMBIGUOUS':'UNRESOLVED';
  if(candidates.length===1)used.add(candidates[0].id);
 }
}
/** Inspector code is tool-owned; the page context has target JavaScript disabled. */
export async function collectElementStyles(page,context,graph,screenId,options=captureOptions([])) {
 if(graph.schemaVersion!=='2.2')throw new Error(`預覽樣式只接受 schema 2.2，收到 ${graph.schemaVersion??'未設定'}`);
 const raw=await page.locator('html,body,body *').evaluateAll(nodes=>nodes.filter(n=>!['SCRIPT','STYLE'].includes(n.tagName)&&!n.closest('script,style')).map(n=>{
  const css=getComputedStyle(n),box=n.getBoundingClientRect();
  let visibleText='';const textStack=[n];while(textStack.length){const node=textStack.pop();if(node.nodeType===3)visibleText+=node.nodeValue;else if(!['HEAD','SCRIPT','STYLE'].includes(node.nodeName.toUpperCase()))textStack.push(...[...node.childNodes].reverse());}
  const step=e=>`${e.localName}[${[...e.parentElement.children].filter(s=>s.localName===e.localName).indexOf(e)+1}]`;
  const parts=[];let current=n;while(current&&current!==document.body&&current!==document.documentElement){parts.unshift(step(current));current=current.parentElement;}
  const path=n===document.documentElement?'html':n===document.body?'body':`body>${parts.join('>')}`;
  const conditions=JSON.parse(n.getAttribute('data-st-condition')||'[]');const source=n.hasAttribute('data-st-source-file')?{file:n.getAttribute('data-st-source-file'),line:Number(n.getAttribute('data-st-source-line'))}:null;
  return {expansionAnchor:n.getAttribute('data-st-expansion-anchor'),sourceComponentId:n.getAttribute('data-st-component-id'),path,tag:n.localName,namespace:n.namespaceURI,id:n.id||null,name:n.getAttribute('name'),className:n.getAttribute('class')||null,text:Array.from(visibleText.replace(/\s+/g,' ').trim()).slice(0,80).join(''),source,bounds:{x:box.left+scrollX,y:box.top+scrollY,width:box.width,height:box.height},conditions,css:Object.fromEntries([...css].sort().map(k=>[k,css.getPropertyValue(k)]))};
 }));
 const tags=[...new Map(raw.map(e=>[`${e.namespace}:${e.tag}`,{tag:e.tag,namespace:e.namespace}])).values()].sort((a,b)=>a.tag.localeCompare(b.tag,'en')||a.namespace.localeCompare(b.namespace,'en'));
 const baseline=await context.newPage();let defaults;
 try{await baseline.setContent('<!doctype html><html><head></head><body></body></html>');defaults=await baseline.evaluate(tags=>{
  const result={};for(const {tag,namespace} of tags){let element=tag==='html'?document.documentElement:tag==='body'?document.body:document.createElementNS(namespace,tag);if(!['html','body'].includes(tag))document.body.append(element);const css=getComputedStyle(element);result[`${namespace}:${tag}`]=Object.fromEntries([...css].sort().map(k=>[k,css.getPropertyValue(k)]));if(!['html','body'].includes(tag))element.remove();}return result;
 },tags);}finally{await baseline.close();}
 const styles={};const elements=raw.map(({css,namespace,...element})=>{
  const defaultId=`${namespace}:${element.tag}`,base=defaults[defaultId],delta=sorted(Object.fromEntries(Object.entries(css).filter(([key,value])=>base[key]!==value)));
  const styleId='style:'+createHash('sha256').update(JSON.stringify(delta)).digest('hex');styles[styleId]=delta;
  return {...element,defaultId,styleId};
 });
 componentLinks(elements,graph,screenId);
 const bytes=Buffer.byteLength(JSON.stringify(styles)),diagnostics=[];
 if(elements.length>options.maxElements)diagnostics.push({code:'STYLE_ELEMENT_LIMIT',screenId,message:'元素樣式超過設定上限，完整資料保留',limit:options.maxElements,actual:elements.length});
 if(bytes>options.maxStyleBytes)diagnostics.push({code:'STYLE_BYTE_LIMIT',screenId,message:'樣式容量超過設定上限，完整資料保留',limit:options.maxStyleBytes,actual:bytes});
 return {elements,styles:sorted(styles),defaults:sorted(defaults),diagnostics};
}
export async function thumbnailDataUri(context,png,width,height) {
 const page=await context.newPage();try{const thumbWidth=640,thumbHeight=Math.max(1,Math.ceil(height*thumbWidth/width));await page.setViewportSize({width:thumbWidth,height:thumbHeight});await page.setContent('<!doctype html><html><head><style>html,body{margin:0;padding:0}img{display:block;width:100%;height:auto}</style></head><body></body></html>');await page.evaluate(data=>{const img=document.createElement('img');img.src=data;document.body.append(img);},`data:image/png;base64,${png.toString('base64')}`);await page.locator('img').waitFor();await page.evaluate(async()=>{await document.images[0].decode();});const image=await page.screenshot({clip:{x:0,y:0,width:thumbWidth,height:thumbHeight},animations:'disabled'});return `data:image/png;base64,${image.toString('base64')}`;}finally{await page.close();}
}
