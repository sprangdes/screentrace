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
 return html;
}
export function elementPath(node:Element):string{const parts:string[]=[];for(let current:Element|null=node;current;current=current.parentElement){const tag=current.localName;let position=1;for(let previous=current.previousElementSibling;previous;previous=previous.previousElementSibling)if(previous.localName===tag&&previous.namespaceURI===current.namespaceURI)position++;parts.unshift(`${tag}:nth-of-type(${position})`);}return parts.join('>');}
export function previewElement(payload:Payload,id:string,node:Element):ElementRecord|undefined{return payload.preview.elements?.find(e=>e.graphScreenId===id&&e.path===elementPath(node));}
