import {Graph,Node,Evidence,requireGraph} from '../contracts';
export interface LibraryInput {name:string;type:string;required:boolean;default?:unknown;description?:string;mapsFromAttribute?:string}
export interface LibraryComponent {id:string;name:string;selector?:string;category:string;description?:string;status:'stable'|'deprecated';inputs:LibraryInput[];outputs:{name:string;description?:string;mapsFromEvent?:string}[];slots:{name:string;description?:string}[];usage?:string;docsUrl?:string;matches:{kind?:string;tag?:string;attributes?:Record<string,string>;priority:number}[]}
export interface Library {manifest:{schemaVersion:'1';library:{name:string;version:string;homepage?:string};components:LibraryComponent[]};sha256:string}
export interface LibraryMatch {status:'MATCH'|'NONE'|'AMBIGUOUS';candidates:LibraryComponent[]}
export interface LibraryResult {matches:Record<string,LibraryMatch>;coverage:{kind:string;matched:number;unmatched:number;ambiguous:number}[]}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
const owns=(obj:object,key:string)=>Object.prototype.hasOwnProperty.call(obj,key);
function field(node:Node,key:string):string[]{
 if(key==='框架來源標籤'){const values=new Set<string>();for(const e of (node.evidence||[])as Evidence[])if(e.detail){try{const detail=JSON.parse(e.detail);if(detail&&typeof detail['框架來源標籤']==='string')values.add(detail['框架來源標籤']);}catch{}}return [...values].sort(order);}
 return owns(node.attributes,key)?[node.attributes[key]]:[];
}
/** Exact predicates only. Unavailable facts are errors, never invented defaults. */
export function matchLibrary(graph:Graph,library:Library):LibraryResult {
 requireGraph(graph);for(const c of library.manifest.components)for(const rule of c.matches)if(!Number.isSafeInteger(rule.priority))throw Error('matches.priority 必須為安全整數');const matches:Record<string,LibraryMatch>=Object.create(null),counts=new Map<string,{kind:string;matched:number;unmatched:number;ambiguous:number}>();
 for(const node of [...graph.nodes].filter(n=>n.type==='COMPONENT').sort((a,b)=>order(a.id,b.id))){
  const kind=node.attributes.kind;if(!kind)throw Error(`圖缺少 kind；元件 ${node.id}，須確認 manifest matches 所需資訊`);
  const candidates:{component:LibraryComponent;priority:number;specificity:number}[]=[];
  for(const component of library.manifest.components)for(const rule of component.matches){
   if(rule.kind!==undefined&&rule.kind!==kind)continue;
   const raw:[string,string][]=[...Object.entries(rule.attributes||{}),...(rule.tag===undefined?[]:[["tag",rule.tag]as [string,string]]),...(rule.kind===undefined?[]:[["kind",rule.kind]as [string,string]])];const predicates=[...new Map(raw.map(pair=>[JSON.stringify(pair),pair])).values()];let success=true;
   for(const [key,expected]of predicates.sort(([a],[b])=>order(a,b))){const values=field(node,key);if(!values.length)throw Error(`圖缺少 ${key}；元件 ${node.id}，須確認 manifest matches 所需資訊`);if(!values.includes(expected))success=false;}
   if(success)candidates.push({component,priority:rule.priority,specificity:predicates.length});
  }
  candidates.sort((a,b)=>b.priority-a.priority||b.specificity-a.specificity||order(a.component.id,b.component.id));
  const best=candidates[0],top=best?candidates.filter(c=>c.priority===best.priority&&c.specificity===best.specificity):[],unique=new Map(top.map(c=>[c.component.id,c.component]));
  const result:LibraryMatch={status:unique.size>1?'AMBIGUOUS':unique.size?'MATCH':'NONE',candidates:[...unique.values()].sort((a,b)=>order(a.id,b.id))};matches[node.id]=result;
  const row=counts.get(kind)||{kind,matched:0,unmatched:0,ambiguous:0};row[result.status==='MATCH'?'matched':result.status==='NONE'?'unmatched':'ambiguous']++;counts.set(kind,row);
 }
 return {matches,coverage:[...counts.values()].sort((a,b)=>order(a.kind,b.kind))};
}
export const libraryLabel=(library:Library)=>`${library.manifest.library.name}@${library.manifest.library.version}`;
