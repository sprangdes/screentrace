import {Index} from './map';
import {humanizeName} from './names';

export type FeatureGroupingStrategy='url'|'controller'|'jsp-directory';
export interface FeatureRegion {key:string;name:string;basis:string;strategy:FeatureGroupingStrategy;screenIds:string[]}
export const FEATURE_GROUPING_LABELS:Record<FeatureGroupingStrategy,string>={url:'依網址前段',controller:'依控制器類別','jsp-directory':'依 JSP 目錄'};
export const FEATURE_GROUPING_ORDER:FeatureGroupingStrategy[]=['url','controller','jsp-directory'];
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function firstSegment(route:string|undefined):string|undefined{return route?.split(/[?#]/)[0].split('/').filter(Boolean)[0];}
function controllerKey(index:Index,screenId:string):string|undefined {
 const names=new Set<string>();
 for(const edge of index.graph.relationships||[])if(['RENDERS','FORWARDS_TO'].includes(edge.type)&&edge.to===screenId){
  const handler=index.nodes.get(edge.from);if(!handler)continue;
  const className=handler.source?.className||handler.attributes.controllerClass||handler.attributes.className||handler.attributes.handlerClass||handler.attributes.class;
  if(className)names.add(className);
  else if(handler.type==='ACTION'){
   const actionName=handler.attributes.actionClass||handler.attributes.type||handler.name;
   if(actionName)names.add(actionName);
  }
 }
 return names.size===1?[...names][0]:undefined;
}
function jspDirectory(index:Index,screenId:string):string|undefined {
 const screen=index.nodes.get(screenId);if(!screen)return undefined;
 const path=[screen.source?.file,screen.attributes.view].map(value=>String(value||'').replaceAll('\\','/')).find(value=>/\.jspx?$/i.test(value));if(!path)return undefined;
 const parts=path.split('/').filter(Boolean);parts.pop();if(!parts.length)return undefined;
 const last=parts.at(-1)!;
 if(last.toLowerCase()==='jsp')return undefined;
 if(last.toLowerCase()==='views'&&parts.at(-2)?.toLowerCase()==='web-inf')return undefined;
 return last;
}
function rawKey(index:Index,screenId:string,strategy:FeatureGroupingStrategy):string|undefined {
 if(strategy==='url')return firstSegment(index.routes.get(screenId)?.[0]);
 if(strategy==='controller')return controllerKey(index,screenId);
 return jspDirectory(index,screenId);
}
function regionsForStrategy(index:Index,strategy:FeatureGroupingStrategy):FeatureRegion[]{
 const groups=new Map<string,FeatureRegion>();
 for(const screen of index.screens){
  const key=rawKey(index,screen.id,strategy)||'首頁與其他',group=groups.get(key)||{key,name:'',basis:FEATURE_GROUPING_LABELS[strategy],strategy,screenIds:[]};
  group.screenIds.push(screen.id);groups.set(key,group);
 }
 return [...groups.values()].map(region=>{
  let display=region.key;
  if(strategy==='controller')display=display.split('.').at(-1)!.replace(/:/g,' ');
  else if(strategy==='jsp-directory')display=display.replace(/^WEB-INF\/(?:views?|jsp)\/?/i,'');
  display=humanizeName(display).replace(/\s+(?:View\s+Controller|Controller|Action)$/i,'').trim();
  if(!display||display==='未命名畫面')display='首頁與其他';
  return {...region,name:display,screenIds:region.screenIds.sort(order)};
 }).sort((a,b)=>order(a.name,b.name)||order(a.key,b.key));
}
/** Selects a single project-wide evidence basis by minimizing one-screen areas. */
export function chooseFeatureGroupingBasis(index:Index):FeatureGroupingStrategy {
 return FEATURE_GROUPING_ORDER.map((strategy,rank)=>({strategy,rank,singletons:regionsForStrategy(index,strategy).filter(region=>region.screenIds.length===1).length})).sort((a,b)=>a.singletons-b.singletons||a.rank-b.rank)[0].strategy;
}
/** Every region in the result uses the same project-wide grouping strategy. */
export function groupFeatureRegions(index:Index,strategy:FeatureGroupingStrategy=chooseFeatureGroupingBasis(index)):FeatureRegion[]{return regionsForStrategy(index,strategy);}
