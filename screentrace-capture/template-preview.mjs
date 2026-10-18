import {markupTokens,markupAttributes} from './preview-markup.mjs';
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
/** Graph-derived template projections only; target expressions are never evaluated. */
export function templatePreview(source,screen,nodes){
 let bindings=[];try{bindings=JSON.parse(screen.attributes?.simulationBindings||'[]');}catch{}
 const stack=[];
 return markupTokens(source).map(t=>{
  if(!t.name){
   const loop=stack.at(-1);if(!loop||!t.text.includes('${'+loop.variable+'.'))return t.text;
   return t.text.replace(/\$\{([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\}/g,(raw,variable,field)=>variable===loop.variable&&loop.binding.fields.includes(field)?`<span data-st-demo-text="${escape(raw)}">${raw}</span>`:raw);
  }
  if(t.name==='c:foreach'){
   if(t.closing){stack.pop();return t.text;}
   const a=markupAttributes(t.text),binding=bindings.find(b=>b.operation==='readAll'&&a.items==='${'+b.model+'}');
   stack.push(binding&&/^[A-Za-z_][\w]*$/.test(a.var||'')?{binding,variable:a.var,row:false}:null);return t.text;
  }
  if(t.closing)return t.text;
  let text=t.text.replace(/\s+data-st-demo-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*')/gi,'');
  const a=markupAttributes(text),node=nodes.find(n=>n.type==='COMPONENT'&&n.source?.file===screen.attributes.view&&n.source?.line===t.line&&n.attributes?.tag===t.name&&['th:href','th:action'].every(key=>!a[key]||n.attributes[key]===a[key]));
  for(const key of ['href','action'])if(a['th:'+key]&&node?.attributes?.[key]){if(a[key])text=renameFallback(text,key);text=add(text,{[key]:node.attributes[key]});}
  const loop=stack.at(-1);
  if(loop&&!loop.row&&!t.name.includes(':')){text=add(text,{'data-st-demo-row':loop.binding.collection,'data-st-demo-variable':loop.variable});loop.row=true;}
  if(loop){const attrs={};for(const [key,value] of Object.entries(a))if(['href','value','action'].includes(key)&&value.includes('${'+loop.variable+'.'))attrs[key]=value;if(Object.keys(attrs).length)text=add(text,{'data-st-demo-attrs':JSON.stringify(attrs)});}
  return text;
 }).join('');
}

export const snapshotMotionCss='*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;animation-fill-mode:forwards!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';
