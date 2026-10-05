import {Index} from './map';
import {humanizeName} from './names';

export interface FeatureRegion {key:string;name:string;basis:'依控制器'|'依網址前段'|'首頁與其他';screenIds:string[]}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function handlerRegion(index:Index,screenId:string):{key:string;basis:'依控制器'|'依網址前段'}|undefined {
 const edges=index.graph.relationships||[],names=new Set<string>(),actions=new Set<string>();
 for(const edge of edges)if(['RENDERS','FORWARDS_TO'].includes(edge.type)&&edge.to===screenId){
  const handler=index.nodes.get(edge.from);if(!handler)continue;
  const className=handler.source?.className||handler.attributes.controllerClass||handler.attributes.className||handler.attributes.handlerClass||handler.attributes.class;
  if(className)names.add(className);
  const actionPath=handler.attributes.actionPath||handler.attributes.path;
  if(actionPath&&(handler.type==='ACTION'||/STRUTS/i.test(handler.attributes.framework||handler.attributes.actionType||'')))actions.add(actionPath.replace(/^\/+|\/+$/g,'').split('/')[0]);
 }
 if(names.size===1)return {key:[...names][0],basis:'依控制器'};
 if(!names.size&&actions.size===1)return {key:[...actions][0],basis:'依網址前段'};
}
function firstSegment(route:string|undefined):string|undefined{return route?.split(/[?#]/)[0].split('/').filter(Boolean)[0];}
/** Groups by one proven controller, then a primary URL's first path segment. */
export function groupFeatureRegions(index:Index):FeatureRegion[]{
 const groups=new Map<string,FeatureRegion>();
 for(const screen of index.screens){
  const handler=handlerRegion(index,screen.id),route=index.routes.get(screen.id)?.[0],segment=firstSegment(route);
  const key=handler?.key||segment||'首頁與其他',basis=handler?.basis||(segment?'依網址前段':'首頁與其他'),groupKey=`${basis}\u0000${key}`;
  const displayKey=basis==='依控制器'?key.split('.').at(-1)!.replace(/:/g,' '):key;
  const group=groups.get(groupKey)||{key,name:basis==='首頁與其他'?key:humanizeName(displayKey),basis,screenIds:[]};group.screenIds.push(screen.id);groups.set(groupKey,group);
 }
 return [...groups.values()].map(region=>({...region,screenIds:region.screenIds.sort(order)})).sort((a,b)=>order(a.name,b.name)||order(a.key,b.key));
}
