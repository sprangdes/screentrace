import {Graph} from './contracts';
import {indexGraph} from './map';
import {parse} from 'acorn';

export type ScreenEntryClass='AUTO_REDIRECT'|'NO_ENTRY'|'ROUTE_ONLY'|'INFERRED_ENTRY'|'HAS_ENTRY';
export type ScreenEntryBasis='STATIC_URL'|'TEMPLATE_INFERENCE';
export interface ScreenEntry {
 screenId:string;
 componentId?:string;
 confidence:'CONFIRMED'|'INFERRED';
 basis?:ScreenEntryBasis;
 evidence:unknown[];
}
export interface ScreenEntryResult {
 screenId:string;
 classification:ScreenEntryClass;
 routes:string[];
 entries:ScreenEntry[];
 autoRedirectEvidence:unknown[];
}

export type ApiSourceBasis='STATIC_URL'|'TEMPLATE_INFERENCE'|undefined;

const isStaticRequestExpression=(detail:string|undefined):boolean=>{
 if(!detail)return false;
 try{
  const evidence=JSON.parse(detail),expression=evidence?.expression;
  if(typeof expression!=='string')return false;
  const program=parse(expression,{ecmaVersion:'latest'}) as any;
  const requestMethods=new Set(['get','post','put','patch','delete','head','options','request','fetch','ajax']);
  const visit=(value:any):boolean=>{
   if(!value||typeof value!=='object')return false;
   if(value.type==='CallExpression'){
    const callee=value.callee,method=callee?.type==='MemberExpression'&&!callee.computed?callee.property?.name:callee?.type==='Identifier'?callee.name:undefined;
    const first=value.arguments?.[0];
    if(requestMethods.has(method)&&first&&(first.type==='Literal'&&typeof first.value==='string'||first.type==='TemplateLiteral'&&first.expressions.length===0))return true;
   }
   return Object.keys(value).some(key=>key!=='start'&&key!=='end'&&key!=='loc'&&key!=='range'&&visit(value[key]));
  };
  return visit(program);
 }catch{return false;}
};

/** Uses the same §9.2 evidence rules wherever API source basis is presented. */
export function apiSourceBasis(graph:Graph,endpointId:string):ApiSourceBasis{
 const sources=(graph.relationships||[]).filter(edge=>edge.to===endpointId&&['CALLS','TRIGGERS'].includes(edge.type));
 if(!sources.length)return undefined;
 const hasStaticBehavior=(graph.behaviors||[]).some((behavior:any)=>behavior.type==='CALL_API'&&behavior.targetId===endpointId&&isStaticRequestExpression(JSON.stringify({expression:behavior.expression})));
 if(hasStaticBehavior)return 'STATIC_URL';
 const parserNames=new Set(['RouteTemplateInference','RedirectInheritance','JavaScriptUrlTemplateInference']);
 const hasStaticSource=(edge:any)=>{
  const evidence=[...(edge.evidence||[])],node=graph.nodes.find(item=>item.id===edge.from),nodeEvidence=node?.evidence||[];
  const staticEvidence=evidence.some((item:any)=>item?.parser==='UrlResolution'&&item?.resolution==='CONFIRMED'&&!String(item?.source?.file||'').startsWith('workspace:'));
  const target=text(node?.attributes?.target),staticComponent=node?.type==='COMPONENT'&&node.attributes?.targetStatus==='CONFIRMED'&&!!target&&target!=='#'&&!target.includes('${')&&nodeEvidence.some((item:any)=>item?.parser==='JspUrlVariableResolver'&&item?.resolution==='CONFIRMED');
  const staticJavaScript=evidence.some((item:any)=>item?.parser==='AcornStaticAnalyzer'&&isStaticRequestExpression(item?.detail));
  return staticEvidence||staticComponent||staticJavaScript;
 };
 if(sources.some(hasStaticSource))return 'STATIC_URL';
 if(sources.every((edge:any)=>edge.confidence==='INFERRED'||[...(edge.evidence||[])].some((item:any)=>parserNames.has(item?.parser))||[...(edge.evidence||[])].some((item:any)=>item?.parser==='AcornStaticAnalyzer'&&!isStaticRequestExpression(item?.detail))))return 'TEMPLATE_INFERENCE';
 return undefined;
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
   const evidence=[...(edge.evidence||[])],parsers=new Set(evidence.map((item:any)=>item?.parser)),sourceEvidence=(source.evidence||[]) as any[];
   const staticComponentUrl=source.type==='COMPONENT'&&source.attributes?.targetStatus==='CONFIRMED'&&!!text(source.attributes?.target)&&sourceEvidence.some(item=>['UrlResolution','JspUrlVariableResolver'].includes(item?.parser)&&item?.resolution==='CONFIRMED');
   const basis:ScreenEntryBasis|undefined=staticComponentUrl||parsers.has('UrlResolution')?'STATIC_URL':parsers.has('RouteTemplateInference')||parsers.has('RedirectInheritance')||parsers.has('JavaScriptUrlTemplateInference')?'TEMPLATE_INFERENCE':undefined;
   for(const sourceScreen of external)entries.push({screenId:sourceScreen,...(source.type==='COMPONENT'?{componentId:source.id}:{}),confidence,...(basis?{basis}:{}),evidence});
  }
  entries.sort((a,b)=>stable(a.screenId,b.screenId)||stable(a.componentId||'',b.componentId||'')||stable(a.confidence,b.confidence));
  const autoRedirectEvidence:unknown[]=[];
  if(redirect){
   for(const node of graph.nodes)if(node.id===screen.id){autoRedirectEvidence.push(...(node.evidence||[]));break;}
  }
  const hasStaticUrl=entries.some(entry=>entry.basis==='STATIC_URL'),allTemplateInference=entries.length>0&&entries.every(entry=>entry.basis==='TEMPLATE_INFERENCE');
  const classification:ScreenEntryClass=redirect?'AUTO_REDIRECT':!routes.length&&!entries.length?'NO_ENTRY':routes.length&&!entries.length?'ROUTE_ONLY':hasStaticUrl?'HAS_ENTRY':allTemplateInference?'INFERRED_ENTRY':entries.length&&entries.every(entry=>entry.confidence==='INFERRED')?'INFERRED_ENTRY':'HAS_ENTRY';
  result.set(screen.id,{screenId:screen.id,classification,routes,entries,autoRedirectEvidence});
 }
 return result;
}

export function entryClassLabel(value:ScreenEntryClass):string{return({AUTO_REDIRECT:'系統自動導向',NO_ENTRY:'完全找不到入口',ROUTE_ONLY:'有網址，但沒有連結進入',INFERRED_ENTRY:'入口是推定的',HAS_ENTRY:'有入口的畫面'})[value];}

export function apiEntryWarningCount(graph:Graph):number{
 return (graph.diagnostics||[]).filter((diagnostic:any)=>diagnostic?.code==='CONTEXT_PATH_HINT').reduce((sum:number,diagnostic:any)=>sum+(Array.isArray(diagnostic?.evidence?.calls)?diagnostic.evidence.calls.length:Array.isArray(diagnostic?.calls)?diagnostic.calls.length:0),0);
}
