import {Index,Relation,Position} from './map';
import {Node} from './contracts';
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function navigationKey(index:Index,node:Node|undefined,to:string):string|undefined {
 if(!node)return;
 if(node.attributes.kind!=='LINK'&&node.attributes.tag!=='a'&&node.attributes.componentType!=='NAVIGATION')return;
 const attributes=Object.entries(node.attributes).sort(([a],[b])=>order(a,b));
 return JSON.stringify([to,node.name,attributes]);
}
/** Presentation classification only: at least two owners, same target and attributes, >=50% of screens. */
export function partitionNavigation(index:Index):{global:Relation[];flows:Relation[]}{
 const owners=new Map<string,Set<string>>();
 for(const r of index.relations)for(const trigger of r.triggers){const key=navigationKey(index,index.nodes.get(trigger),r.to);if(key){const set=owners.get(key)||new Set<string>();set.add(r.from);owners.set(key,set);}}
 const global:Relation[]=[],flows:Relation[]=[];
 for(const r of index.relations){const common=r.triggers.filter(id=>{const key=navigationKey(index,index.nodes.get(id),r.to),count=key?owners.get(key)?.size||0:0;return count>=2&&count*2>=index.screens.length;}),specific=r.triggers.filter(id=>!common.includes(id));
 if(common.length)global.push({...r,triggers:common});if(specific.length||!r.triggers.length)flows.push({...r,triggers:specific});}
 return {global,flows};
}
/** Stable grid keeps cyclic applications spread across both axes. */
export function overviewLayout(index:Index):Map<string,Position>{
 const columns=Math.max(1,index.screens.length<=12?Math.min(3,Math.ceil(Math.sqrt(index.screens.length))):Math.ceil(Math.sqrt(index.screens.length))),positions=new Map<string,Position>();
 index.screens.forEach((screen,i)=>positions.set(screen.id,{x:60+(i%columns)*340,y:60+Math.floor(i/columns)*240}));return positions;
}
/** Orthogonal routes only use row/column gutters; arrow stops at the destination's left edge. */
export function overviewRoute(positions:Map<string,Position>,r:Relation,ordinal:number):Position[]{
 const a=positions.get(r.from)!,b=positions.get(r.to)!,lane=(ordinal%8)*2,x=a.x+280+lane,y=a.y+216+lane,entry=b.x-30-lane;
 return [{x:a.x+250,y:a.y+72},{x,y:a.y+72},{x,y},{x:entry,y},{x:entry,y:b.y+72},{x:b.x,y:b.y+72}];
}
