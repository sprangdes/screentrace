import {markupTokens,markupAttributes,stripMarkupAttributes} from './preview-markup.mjs';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('$','&#36;');
const add=(text,attrs)=>text.replace(/\s*(\/?)>$/,(_,slash)=>Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')+(slash?'/':'')+'>');
function renameFallback(text,key){
 let result='',cursor=0,i=1;while(i<text.length&&!/\s/.test(text[i]))i++;
 while(i<text.length){while(i<text.length&&/\s/.test(text[i]))i++;const start=i;while(i<text.length&&!/[\s=/>]/.test(text[i]))i++;if(start===i){i++;continue;}
  if(text.slice(start,i).toLowerCase()===key){result+=text.slice(cursor,start)+'data-st-template-fallback-'+key;cursor=i;}
  while(i<text.length&&/\s/.test(text[i]))i++;
  if(text[i]==='='){i++;while(i<text.length&&/\s/.test(text[i]))i++;if(['"',"'"].includes(text[i])){const quote=text[i++];while(i<text.length&&text[i]!==quote)i++;i++;}else while(i<text.length&&!/[\s>]/.test(text[i]))i++;}
 }return result+text.slice(cursor);
}
// Grammar: proven model.field or quoted string, joined by +. No calls or evaluation.
function textParts(expression,loop){
 if(!expression?.startsWith('${')||!expression.endsWith('}'))return null;
 const body=expression.slice(2,-1),parts=[];let i=0;
 while(i<body.length){while(/\s/.test(body[i]||'')&&i<body.length)i++;const quote=body[i];
  if(quote==="'"||quote==='"'){i++;let value='';for(;i<body.length&&body[i]!==quote;i++){if(body[i]==='\\'){i++;if(!['\\',quote].includes(body[i]))return null;}value+=body[i];}if(body[i]!==quote||value.length>4000)return null;i++;parts.push({literal:value});}
  else{const m=/^([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)/.exec(body.slice(i));if(!m||m[1]!==loop.variable||!loop.binding.fields.includes(m[2]))return null;i+=m[0].length;parts.push({field:m[2]});}
  if(parts.length>64)return null;while(/\s/.test(body[i]||'')&&i<body.length)i++;if(i===body.length)break;if(body[i++]!=='+')return null;if(i===body.length)return null;
 }
 // Avoid guessing numeric addition before string concatenation starts.
 return parts.length&&parts.slice(0,2).some(p=>Object.hasOwn(p,'literal'))?parts:null;
}
/** Graph-derived template projections only; target expressions are never evaluated. */
export function templatePreview(source,screen,nodes,relationships=[]){
 let bindings=[];try{bindings=JSON.parse(screen.attributes?.simulationBindings||'[]');}catch{}
 const stack=[],frames=[];
 const submittedKeys=new Set();for(const edge of relationships.filter(e=>e.to===screen.id))for(const e of edge.evidence||[])if(e.parser==='SpringSubmittedModel'&&e.resolution==='INFERRED')try{const item=JSON.parse(e.detail);if(item.version===1)for(const key of Object.keys(item.fields||{}))if(/^[A-Za-z_][\w]*\.[A-Za-z_][\w]*$/.test(key))submittedKeys.add(key);}catch{}
 const feedbackKeys=new Set();for(const n of [...nodes.filter(n=>n.id===screen.id),...relationships.filter(e=>e.to===screen.id)])for(const e of n.evidence||[])if(e.parser==='SpringModelFeedback'&&['CONFIRMED','INFERRED'].includes(e.resolution))try{for(const key of Object.keys(JSON.parse(e.detail).values||{}))feedbackKeys.add(key);}catch{}
 return markupTokens(source).map(t=>{
  if(!t.name){
   const loop=stack.at(-1);
   return t.text.replace(/\$\{(?:(requestScope)\.)?([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?\}/g,(raw,scope,variable,field)=>{
    if(loop&&variable===loop.variable&&loop.binding.fields.includes(field))return `<span data-st-demo-text="${escape(raw)}">${raw}</span>`;
    if(!field&&feedbackKeys.has(variable))return `<span data-st-model-key="${escape(variable)}"></span>`;return raw;
   });
  }
  if(t.closing){const i=frames.findLastIndex(f=>f.name===t.name);if(i>=0){const removed=frames.splice(i);while(stack.length&&removed.includes(stack.at(-1).frame))stack.pop();}return t.text;}
  let text=stripMarkupAttributes(t.text,name=>name.startsWith('data-st-demo-')||['data-st-model-key','data-st-model-if','data-st-submitted-key','data-st-submitted-format'].includes(name));
  const a=markupAttributes(text),frame={name:t.name};
  let variable,model;
  if(t.name==='c:foreach'){variable=a.var;model=a.items?.match(/^\$\{([A-Za-z_][\w]*)}$/)?.[1];}
  const each=a['th:each']?.match(/^([A-Za-z_][\w]*)\s*:\s*\$\{([A-Za-z_][\w]*)}$/);
  if(each){variable=each[1];model=each[2];}
  const binding=bindings.find(b=>b.operation==='readAll'&&b.model===model);
  if(binding&&/^[A-Za-z_][\w]*$/.test(variable||''))stack.push({binding,variable,row:false,frame});
  const node=nodes.find(n=>(n.type==='COMPONENT'||n.type==='SOURCE_ARTIFACT'&&n.attributes?.kind==='STATIC_RESOURCE_REFERENCE'&&n.evidence?.some(e=>e.parser==='StaticResourceParser'&&['CONFIRMED','INFERRED'].includes(e.resolution)))&&n.source?.file===screen.attributes.view&&n.source?.line===t.line&&n.attributes?.tag===t.name&&['th:href','th:action','th:field'].every(key=>!a[key]||n.attributes[key]===a[key]));
  for(const key of ['href','action'])if(a['th:'+key]&&node?.attributes?.[key]){if(a[key])text=renameFallback(text,key);text=add(text,{[key]:node.attributes[key]});}
  if(a['th:field']){if(a.name)text=renameFallback(text,'name');if(node?.attributes?.name)text=add(text,{name:node.attributes.name});}
  const loop=stack.at(-1);
  if(loop&&!loop.row&&!t.name.includes(':')){text=add(text,{'data-st-demo-row':loop.binding.collection,'data-st-demo-variable':loop.variable});loop.row=true;}
  if(loop){
   const simple=value=>{const m=value?.match(/^\$\{([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)}$/);return m&&m[1]===loop.variable&&loop.binding.fields.includes(m[2]);};
   if(simple(a['th:text']))text=add(text,{'data-st-demo-text':a['th:text']});
   else{const parts=textParts(a['th:text'],loop);if(parts)text=add(text,{'data-st-demo-parts':JSON.stringify(parts)});}
   const attrs={};for(const [key,value] of Object.entries(a))if(['href','value','action'].includes(key)&&value.includes('${'+loop.variable+'.'))attrs[key]=value;
   if(simple(a['th:value']))attrs.value=a['th:value'];
   if(Object.keys(attrs).length)text=add(text,{'data-st-demo-attrs':JSON.stringify(attrs)});
  }
  const directSubmitted=a['th:text']?.match(/^\$\{([A-Za-z_][\w]*\.[A-Za-z_][\w]*)}$/),dateSubmitted=a['th:text']?.match(/^\$\{#temporals\.format\(([A-Za-z_][\w]*\.[A-Za-z_][\w]*),\s*'(dd-MM-yyyy|yyyy-MM-dd|dd\/MM\/yyyy)'\)}$/);
  const submittedKey=directSubmitted?.[1]||dateSubmitted?.[1];if(submittedKeys.has(submittedKey)){text=add(text,{'data-st-submitted-key':submittedKey,...(dateSubmitted?{'data-st-submitted-format':dateSubmitted[2]}:{})});}
  const modelCondition=a['th:if']?.match(/^\$\{([A-Za-z_][\w]*)}$/);if(modelCondition&&feedbackKeys.has(modelCondition[1])){text=add(text,{'data-st-model-if':modelCondition[1],hidden:''});if(a['th:text']==='${'+modelCondition[1]+'}')text=add(text,{'data-st-model-key':modelCondition[1]});}
  const empty=a['th:if']?.match(/^\$\{(!?)([A-Za-z_][\w]*)\.empty}$/),emptyBinding=empty&&bindings.find(b=>b.model===empty[2]);
  if(emptyBinding)text=add(text,{'data-st-demo-empty':emptyBinding.collection,'data-st-demo-empty-negated':empty[1]?'true':'false'});
  if(!t.selfClosing&&!['input','img','br','hr','meta','link','area','base','col','embed','param','source','track','wbr'].includes(t.name))frames.push(frame);
  return text;
 }).join('');
}

export const snapshotMotionCss='*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;animation-fill-mode:forwards!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';
/** Request bases require graph render chains or literal aliases to a public source page. */
export function requestDirectories(graph,screen){
 const handlers=new Set((graph.relationships||[]).filter(e=>e.type==='RENDERS'&&e.to===screen).map(e=>e.from));
 const ids=new Set((graph.relationships||[]).filter(e=>e.type==='HANDLED_BY'&&handlers.has(e.to)).map(e=>e.from));
 const routes=(graph.nodes||[]).filter(n=>ids.has(n.id)&&n.type==='ENDPOINT'&&['GET','ANY'].includes(n.attributes?.httpMethod));
 const node=(graph.nodes||[]).find(n=>n.id===screen&&n.type==='SCREEN'),view=node?.attributes?.view||'';
 const paths=routes.map(n=>n.attributes.path||'');
 if(!view.toLowerCase().includes('/web-inf/')&&!view.includes('/resources/templates/'))for(const alias of (node?.attributes?.routeAliases||'').split('\u001f')){
  const p=alias.split(/[?#]/,1)[0];if(p.startsWith('/')&&!p.startsWith('//')&&!p.includes('..')&&!/[{:]/.test(p)&&/\.(jsp|html)$/.test(p)&&view.endsWith(p))paths.push(p);
 }
 if(!paths.length)return [];
 const bases=paths.map(p=>{const base=p.slice(0,p.lastIndexOf('/')+1);return base.startsWith('/')&&!base.includes('{')?base:null;});
 return bases.includes(null)?[]:[...new Set(bases)].sort();
}

/** Settle local styles, images and fonts before collecting layout or pixels. */
export async function openStaticSnapshot(page,url){
 await page.goto(url,{waitUntil:'load',timeout:5000});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
 await settleSourceAutofocus(page);
}

/** A tool-owned glyph only for source icon controls that have no rendered glyph or width. */
export async function offlineIconAffordances(page){
 return page.evaluate(()=>{let count=0;for(const icon of document.querySelectorAll('a[data-st-component-id] i:empty,button[data-st-component-id] i:empty')){
  if(!/(^|\s)(?:fa[bsr]?|fa-[\w-]+)(?:\s|$)/.test(icon.className))continue;
  const style=getComputedStyle(icon),before=getComputedStyle(icon,'::before').content,after=getComputedStyle(icon,'::after').content;
  if(style.display==='none'||style.visibility==='hidden'||icon.getBoundingClientRect().width>0||![before,after].every(value=>['none','normal','""',"''"].includes(value)))continue;
  icon.textContent='◇';icon.setAttribute('data-st-offline-affordance','icon');icon.setAttribute('title','離線圖示替代符號');count++;
 }return count;});
}

/** Native source autofocus must settle before computed-style capture, not only before pixels. */
export async function settleSourceAutofocus(page){
 await page.evaluate(()=>{const candidates=[...document.querySelectorAll('[autofocus]')].filter(node=>node instanceof HTMLElement&&!node.matches(':disabled')&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');if(candidates.length===1)candidates[0].focus({preventScroll:true});});
}

/** Closed disclosure fallback requires an unguarded graph-proven toggle and source ARIA state. */
export async function offlineDisclosureState(page,graph,screenId){
 const owned=new Set([screenId,...(graph.relationships||[]).filter(e=>e.type==='CONTAINS'&&e.from===screenId).map(e=>e.to)]),actions=[];
 for(const b of graph.behaviors||[]){
  if(!owned.has(b.triggerId)||b.guard||b.parentId)continue;
  for(const e of b.evidence||[])if(e.parser==='AcornStaticAnalyzer'&&e.resolution==='CONFIRMED')try{
   const a=JSON.parse(e.detail);if(a.operation==='toggleDisclosure'&&typeof a.selector==='string'&&typeof a.inputSelector==='string'&&a.selector.length<512&&a.inputSelector.length<512)actions.push({selector:a.selector,inputSelector:a.inputSelector});
  }catch{}
 }
 return page.evaluate(actions=>{
  const explicitDisplay=(node,rules)=>[...rules].some(rule=>{if(rule.selectorText&&rule.style?.getPropertyValue('display'))try{if(node.matches(rule.selectorText))return true;}catch{}try{return rule.cssRules&&explicitDisplay(node,rule.cssRules);}catch{return false;}});
  let count=0;for(const a of actions)try{
   const buttons=document.querySelectorAll(a.inputSelector),menus=document.querySelectorAll(a.selector);if(buttons.length!==1||menus.length!==1)continue;
   const menu=menus[0];if(buttons[0].getAttribute('aria-expanded')!=='false'||menu.classList.contains('show')||menu.hidden||menu.style.display)continue;
   if([...document.styleSheets].some(sheet=>{try{return explicitDisplay(menu,sheet.cssRules);}catch{return false;}}))continue;
   menu.hidden=true;menu.setAttribute('data-st-offline-affordance','closed-disclosure');count++;
  }catch{}return count;
 },actions);
}
