import {Graph} from './contracts';
import {FeatureRegion} from './feature-regions';
import {buttonComponents,ReviewState,screenDecision,componentDecision} from './shared/review';

export interface ReviewTarget {kind:'screen'|'component';region:string;screenId:string;componentId?:string}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Stable dashboard/navigation order: region, screen, then that screen's components. */
export function orderedReviewTargets(graph:Graph,regions:FeatureRegion[]):ReviewTarget[]{
 const screens=new Map(graph.nodes.filter(node=>node.type==='SCREEN').map(node=>[node.id,node]));
 const keys=buttonComponents(graph),seen=new Set<string>(),result:ReviewTarget[]=[];
 for(const region of [...regions].sort((a,b)=>order(a.name,b.name)||order(a.key,b.key))){
  for(const screenId of [...region.screenIds].sort(order)){if(!screens.has(screenId))continue;seen.add(screenId);result.push({kind:'screen',region:region.key,screenId});
   for(const key of keys.filter(value=>value.screenId===screenId).sort((a,b)=>order(a.componentId,b.componentId)))result.push({kind:'component',region:region.key,screenId,componentId:key.componentId});
  }
 }
 for(const screenId of [...screens.keys()].filter(id=>!seen.has(id)).sort(order)){result.push({kind:'screen',region:'other',screenId});for(const key of keys.filter(value=>value.screenId===screenId).sort((a,b)=>order(a.componentId,b.componentId)))result.push({kind:'component',region:'other',screenId,componentId:key.componentId});}
 return result;
}
export function targetKey(target:ReviewTarget):string{return `${target.screenId}:${target.componentId||''}`;}
export function targetDecision(state:ReviewState,target:ReviewTarget){return target.kind==='screen'?screenDecision(state,target.screenId):componentDecision(state,target.screenId,target.componentId!);}
export function nextUndecidedTarget(targets:ReviewTarget[],state:ReviewState,current?:ReviewTarget):ReviewTarget|undefined{
 if(!targets.length)return undefined;const start=current?targets.findIndex(target=>targetKey(target)===targetKey(current)):-1;
 for(let offset=1;offset<=targets.length;offset++){const target=targets[(start+offset+targets.length)%targets.length];if(targetDecision(state,target)==='UNDECIDED')return target;}return undefined;
}
