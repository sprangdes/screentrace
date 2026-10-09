import {Graph,Behavior} from './contracts';import {Index,indexGraph} from './map';
export interface Caller {screenId:string;componentId?:string;behaviorId?:string}
export function rootTrigger(index:Index,b:Behavior):string|undefined{let parent=b;const seen=new Set<string>(),behaviors=index.behaviors;while(!parent.triggerId&&parent.parentId&&!seen.has(parent.id)&&behaviors.has(parent.parentId)){seen.add(parent.id);parent=behaviors.get(parent.parentId)!;}return parent.triggerId;}
export function callSources(graph:Graph):Map<string,Caller[]>{
 const index=indexGraph(graph),edges=graph.relationships||[],result=new Map<string,Caller[]>(graph.nodes.filter(n=>n.type==='ENDPOINT').map(n=>[n.id,[]]));
 const add=(target:string,trigger:string,behaviorId?:string)=>{const node=index.nodes.get(trigger);if(node?.type==='SCREEN')result.get(target)?.push({screenId:trigger,behaviorId});if(node?.type==='COMPONENT')for(const screenId of index.owners.get(trigger)||[])result.get(target)?.push({screenId,componentId:trigger,behaviorId});};
 for(const e of edges)if(result.has(e.to)&&['CALLS','TRIGGERS'].includes(e.type)&&!(graph.behaviors||[]).some(b=>b.type==='CALL_API'&&b.triggerId===e.from&&b.targetId===e.to))add(e.to,e.from);
 for(const b of graph.behaviors||[])if(b.type==='CALL_API'&&b.targetId&&result.has(b.targetId)){const trigger=rootTrigger(index,b);if(trigger)add(b.targetId,trigger,b.id);}
 const redirects=new Map<string,Set<string>>();
 for(const edge of edges)if(edge.type==='CALLS'&&edge.confidence==='INFERRED'&&edge.evidence?.some(item=>item.parser==='RedirectInheritance')&&result.has(edge.to)&&index.nodes.get(edge.from)?.type==='HANDLER')
  for(const handled of edges)if(handled.type==='HANDLED_BY'&&handled.to===edge.from&&result.has(handled.from)){const targets=redirects.get(handled.from)||new Set<string>();targets.add(edge.to);redirects.set(handled.from,targets);}
 type Hop={endpoint:string;caller:Caller;depth:number;visited:Set<string>};const queue:Hop[]=[];
 for(const [endpoint,list]of result)for(const caller of [...list])queue.push({endpoint,caller,depth:0,visited:new Set([endpoint])});
 while(queue.length){const hop=queue.shift()!;if(hop.depth>=5)continue;for(const destination of redirects.get(hop.endpoint)||[])if(!hop.visited.has(destination)){result.get(destination)?.push(hop.caller);const visited=new Set(hop.visited);visited.add(destination);queue.push({endpoint:destination,caller:hop.caller,depth:hop.depth+1,visited});}}
 for(const [id,list]of result){const unique=new Map(list.map(c=>[JSON.stringify([c.screenId,c.componentId||'',c.behaviorId||'']),c]));result.set(id,[...unique.values()].sort((a,b)=>a.screenId.localeCompare(b.screenId,'en')||(a.componentId||'').localeCompare(b.componentId||'','en')||(a.behaviorId||'').localeCompare(b.behaviorId||'','en')));}
 return result;
}
export function screenBehaviors(index:Index,id:string):Behavior[]{return (index.graph.behaviors||[]).filter(b=>{const trigger=rootTrigger(index,b);return trigger===id||!!trigger&&!!index.owners.get(trigger)?.includes(id);});}

export function callerKind(index:Index,caller:Caller):'load'|'component'|'unresolved' {
 if(caller.componentId)return 'component';let b=index.behaviors.get(caller.behaviorId||'');if(!b)return 'load';const seen=new Set<string>();while(!b.triggerId&&b.parentId&&!seen.has(b.id)&&index.behaviors.has(b.parentId)){seen.add(b.id);b=index.behaviors.get(b.parentId)!;}return b.event&&!['load','onload','ready','domcontentloaded'].includes(b.event.toLowerCase())||!b.event&&b.evidence?.some(e=>e.resolution==='UNRESOLVED')?'unresolved':'load';
}
