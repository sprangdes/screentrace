import {Payload,ElementRecord,requireGraph} from './contracts';
const assetCache=new WeakMap<Payload,Map<string,string>>();
export function previewDocument(payload:Payload,id:string):string {
 requireGraph(payload.graph);let html=payload.documents[id]||'<html><body></body></html>';
 let assets=assetCache.get(payload);
 if(!assets){assets=new Map<string,string>();const data=payload.manifest.assets;
  if(data&&typeof data==='object')for(const [hash,value]of Object.entries(data))if(/^[a-f0-9]{64}$/.test(hash)&&typeof value==='string'&&/^data:(?:image\/[\w+.-]+|font\/[\w+.-]+|text\/css);base64,[A-Za-z0-9+/=]*$/.test(value))assets.set(hash,value);
  const original=new Map(assets),resolve=(hash:string,seen=new Set<string>()):string=>{
   const value=original.get(hash)||'data:,';if(!value.startsWith('data:text/css;base64,'))return value;if(seen.has(hash))throw Error('CSS 資源循環');const next=new Set(seen);next.add(hash);
   let css=new TextDecoder().decode(Uint8Array.from(atob(value.slice(value.indexOf(',')+1)),c=>c.charCodeAt(0)));
   css=css.replace(/st-asset-sha256:([a-f0-9]{64})/g,(_all,nested:string)=>resolve(nested,next));
   const bytes=new TextEncoder().encode(css);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:text/css;base64,'+btoa(binary);
  };
  for(const hash of original.keys())assets.set(hash,resolve(hash));
  assetCache.set(payload,assets);
 }
 for(const [hash,value]of assets)html=html.replaceAll(`st-asset-sha256:${hash}`,value);
 if(typeof DOMParser==='undefined')return html;
 const document=new DOMParser().parseFromString(html,'text/html'),pattern=/\$\{[^{}]*\}|#\{[^{}]*\}|<%[\s\S]*?%>/g,walker=document.createTreeWalker(document,NodeFilter.SHOW_TEXT),textNodes:Text[]=[];let current:Node|null;while((current=walker.nextNode()))textNodes.push(current as Text);for(const textNode of textNodes){if(!pattern.test(textNode.data)){pattern.lastIndex=0;continue;}pattern.lastIndex=0;const fragment=document.createDocumentFragment();let cursor=0;for(const match of textNode.data.matchAll(pattern)){const offset=match.index||0;if(offset>cursor)fragment.append(document.createTextNode(textNode.data.slice(cursor,offset)));const badge=document.createElement('span');badge.className='st-dynamic-placeholder';badge.textContent='動態內容';badge.setAttribute('style','color:#64748b;background:#eef2f7;border:1px solid #cbd5e1;border-radius:4px;padding:0 4px;font-size:.9em');fragment.append(badge);cursor=offset+match[0].length;}if(cursor<textNode.data.length)fragment.append(document.createTextNode(textNode.data.slice(cursor)));textNode.replaceWith(fragment);}for(const element of Array.from(document.querySelectorAll('*')))for(const attribute of Array.from(element.attributes))if(pattern.test(attribute.value)){pattern.lastIndex=0;element.setAttribute(attribute.name,attribute.value.replace(pattern,'動態內容'));}else pattern.lastIndex=0;
 return document.documentElement.outerHTML;
}
export function elementPath(node:Element):string{const parts:string[]=[];for(let current:Element|null=node;current;current=current.parentElement){const tag=current.localName;let position=1;for(let previous=current.previousElementSibling;previous;previous=previous.previousElementSibling)if(previous.localName===tag&&previous.namespaceURI===current.namespaceURI)position++;parts.unshift(`${tag}:nth-of-type(${position})`);}return parts.join('>');}
export function previewElement(payload:Payload,id:string,node:Element):ElementRecord|undefined{return payload.preview.elements?.find(e=>e.graphScreenId===id&&e.path===elementPath(node));}
