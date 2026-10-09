import {Graph} from './contracts';
import {indexGraph} from './map';

export type ScreenEntryClass='AUTO_REDIRECT'|'NO_ENTRY'|'ROUTE_ONLY'|'INFERRED_ENTRY'|'HAS_ENTRY';
export interface ScreenEntry {
 screenId:string;
 componentId?:string;
 confidence:'CONFIRMED'|'INFERRED';
 evidence:unknown[];
}
export interface ScreenEntryResult {
 screenId:string;
 classification:ScreenEntryClass;
 routes:string[];
 entries:ScreenEntry[];
 autoRedirectEvidence:unknown[];
}

const text=(value:unknown):string=>typeof value==='string'?value.trim():'';
const stable=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Classifies each screen from explicit route, redirect and cross-screen entry evidence only. */
export function classifyScreenEntry(graph:Graph):Map<string,ScreenEntryResult>{
 const nodes=new Map(graph.nodes.map(node=>[node.id,node])),index=indexGraph(graph);
 const screens=graph.nodes.filter(node=>node.type==='SCREEN').sort((a,b)=>stable(a.id,b.id));
 const owners=new Map<string,string[]>();
 for(const edge of graph.relationships||[])if(edge.type==='CONTAINS'&&nodes.get(edge.from)?.type==='SCREEN'&&nodes.get(edge.to)?.type==='COMPONENT'){
  const list=owners.get(edge.to)||[];list.push(edge.from);owners.set(edge.to,list);
 }
 for(const [id,list]of owners)owners.set(id,[...new Set(list)].sort(stable));
 const result=new Map<string,ScreenEntryResult>();
 for(const screen of screens){
  const attrs=screen.attributes||{},redirect=text(attrs.autoRedirect),routeValues=index.routes.get(screen.id)||[];
  const routes=[...new Set(routeValues.map(text).filter(Boolean))].sort(stable),entries:ScreenEntry[]=[];
  for(const edge of graph.relationships||[]){
   if(!['NAVIGATES_TO','FORWARDS_TO'].includes(edge.type)||edge.to!==screen.id)continue;
   const source=nodes.get(edge.from);if(!source)continue;
   const confidence=edge.confidence==='INFERRED'?'INFERRED':edge.confidence==='CONFIRMED'?'CONFIRMED':undefined;
   if(!confidence)continue;
   const sourceScreens=source.type==='SCREEN'?[source.id]:source.type==='COMPONENT'?(owners.get(source.id)||[]):[];
   const external=sourceScreens.filter(id=>id!==screen.id);
   if(!external.length)continue;
   for(const sourceScreen of external)entries.push({screenId:sourceScreen,...(source.type==='COMPONENT'?{componentId:source.id}:{}),confidence,evidence:[...(edge.evidence||[])]});
  }
  entries.sort((a,b)=>stable(a.screenId,b.screenId)||stable(a.componentId||'',b.componentId||'')||stable(a.confidence,b.confidence));
  const autoRedirectEvidence:unknown[]=[];
  if(redirect){
   for(const node of graph.nodes)if(node.id===screen.id){autoRedirectEvidence.push(...(node.evidence||[]));break;}
  }
  const classification:ScreenEntryClass=redirect?'AUTO_REDIRECT':!routes.length&&!entries.length?'NO_ENTRY':routes.length&&!entries.length?'ROUTE_ONLY':entries.length&&entries.every(entry=>entry.confidence==='INFERRED')?'INFERRED_ENTRY':'HAS_ENTRY';
  result.set(screen.id,{screenId:screen.id,classification,routes,entries,autoRedirectEvidence});
 }
 return result;
}

export function entryClassLabel(value:ScreenEntryClass):string{return({AUTO_REDIRECT:'系統自動導向',NO_ENTRY:'完全找不到入口',ROUTE_ONLY:'有網址，但沒有連結進入',INFERRED_ENTRY:'入口是推定的',HAS_ENTRY:'有確定入口'})[value];}

export function apiEntryWarningCount(graph:Graph):number{
 return (graph.diagnostics||[]).filter((diagnostic:any)=>diagnostic?.code==='CONTEXT_PATH_HINT').reduce((sum:number,diagnostic:any)=>sum+(Array.isArray(diagnostic?.evidence?.calls)?diagnostic.evidence.calls.length:Array.isArray(diagnostic?.calls)?diagnostic.calls.length:0),0);
}
