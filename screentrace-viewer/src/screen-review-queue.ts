import {Graph} from './contracts';
import {FeatureRegion} from './feature-regions';
import {ScreenEntryClass,classifyScreenEntry,entryClassLabel} from './inventory';
import {Decision,ReviewState,screenDecision} from './shared/review';

export interface ScreenReviewQueueItem {
 screenId:string;name:string;classification:ScreenEntryClass;entryCount:number;decision:Decision;regionKey:string;regionName:string;
}
export interface ScreenReviewQueueGroup {key:string;classification:ScreenEntryClass;label:string;regionKey?:string;regionName?:string;screens:ScreenReviewQueueItem[]}
export interface ScreenReviewQueueOptions {groupByRegion:boolean;onlyUndecided:boolean}
const stable=(a:string,b:string)=>a<b?-1:a>b?1:0;
const priority:ScreenEntryClass[]=['NO_ENTRY','ROUTE_ONLY','INFERRED_ENTRY','AUTO_REDIRECT','HAS_ENTRY'];

/** Builds a deterministic screen-only review queue from proven entry evidence. */
export function screenReviewQueue(graph:Graph,regions:FeatureRegion[],state:ReviewState,options:ScreenReviewQueueOptions):ScreenReviewQueueGroup[]{
 const classified=classifyScreenEntry(graph),nodes=new Map(graph.nodes.map(node=>[node.id,node])),regionByScreen=new Map<string,FeatureRegion>();
 for(const region of regions)for(const screenId of region.screenIds)regionByScreen.set(screenId,region);
 const items=[...classified.values()].map(entry=>{const screen=nodes.get(entry.screenId)!,region=regionByScreen.get(entry.screenId);return{screenId:entry.screenId,name:screen.name,classification:entry.classification,entryCount:entry.entries.length,decision:screenDecision(state,entry.screenId),regionKey:region?.key||'other',regionName:region?.name||'首頁與其他'} satisfies ScreenReviewQueueItem;})
  .filter(item=>!options.onlyUndecided||item.decision==='UNDECIDED');
 const compare=(a:ScreenReviewQueueItem,b:ScreenReviewQueueItem)=>a.entryCount-b.entryCount||stable(a.name,b.name)||stable(a.screenId,b.screenId);
 const result:ScreenReviewQueueGroup[]=[];
 for(const classification of priority){const matching=items.filter(item=>item.classification===classification);if(!matching.length)continue;
  if(!options.groupByRegion){matching.sort(compare);result.push({key:classification,classification,label:entryClassLabel(classification),screens:matching});continue;}
  const byRegion=new Map<string,ScreenReviewQueueItem[]>();for(const item of matching){const list=byRegion.get(item.regionKey)||[];list.push(item);byRegion.set(item.regionKey,list);}
  for(const [regionKey,screens]of [...byRegion].sort(([a],[b])=>stable(a,b))){screens.sort(compare);result.push({key:`${classification}:${regionKey}`,classification,label:entryClassLabel(classification),regionKey,regionName:screens[0].regionName,screens});}
 }
 return result;
}
