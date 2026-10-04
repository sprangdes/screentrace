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
export function gridLayout(index:Index):Map<string,Position>{
 const columns=Math.max(1,index.screens.length<=12?Math.min(3,Math.ceil(Math.sqrt(index.screens.length))):Math.ceil(Math.sqrt(index.screens.length))),positions=new Map<string,Position>();
 index.screens.forEach((screen,i)=>positions.set(screen.id,{x:60+(i%columns)*340,y:60+Math.floor(i/columns)*315}));return positions;
}
export interface FlowLayout {positions:Map<string,Position>;dag:Relation[];back:Relation[];isolated:string[];fallback:boolean}
/** Sorted DFS removes only ancestor edges; longest DAG paths determine left-to-right layers.
 * Four alternating barycenter sweeps order each layer, with IDs breaking every tie. */
export function flowLayout(index:Index):FlowLayout {
 if(index.screens.length>150||index.relations.length>600)return {positions:gridLayout(index),dag:[],back:[],isolated:[],fallback:true};
 const ids=index.screens.map(s=>s.id).sort(order),edges=partitionNavigation(index).flows.filter(r=>r.from!==r.to).sort((a,b)=>order(a.from,b.from)||order(a.to,b.to));
 const incoming=new Map(ids.map(id=>[id,edges.filter(r=>r.to===id)])),outgoing=new Map(ids.map(id=>[id,edges.filter(r=>r.from===id)]));
 const isolated=ids.filter(id=>!incoming.get(id)!.length&&!outgoing.get(id)!.length),active=ids.filter(id=>!isolated.includes(id)),state=new Map<string,number>(),dag:Relation[]=[],back:Relation[]=[];
 const primary=(id:string)=>index.routes.get(id)?.[0];
 const rootOrder=(a:string,b:string)=>Number(primary(b)==='/')-Number(primary(a)==='/')||(primary(a)?.length??Infinity)-(primary(b)?.length??Infinity)||order(a,b);
 const visit=(id:string)=>{state.set(id,1);for(const r of outgoing.get(id)!){if(state.get(r.to)===1)back.push(r);else{dag.push(r);if(!state.has(r.to))visit(r.to);}}state.set(id,2);};
 for(const id of active.filter(id=>!incoming.get(id)!.length).sort(order))if(!state.has(id))visit(id);
 for(const id of [...active].sort(rootOrder))if(!state.has(id))visit(id);
 const indegree=new Map(active.map(id=>[id,dag.filter(r=>r.to===id).length])),rank=new Map(active.map(id=>[id,0])),queue=active.filter(id=>!indegree.get(id));
 while(queue.length){queue.sort(order);const id=queue.shift()!;for(const r of dag.filter(r=>r.from===id)){rank.set(r.to,Math.max(rank.get(r.to)!,rank.get(id)!+1));indegree.set(r.to,indegree.get(r.to)!-1);if(!indegree.get(r.to))queue.push(r.to);}}
 const layers:string[][]=[];for(const id of active){const n=rank.get(id)!;(layers[n]??=[]).push(id);}
 const rows=new Map<string,number>();const updateRows=()=>layers.forEach(layer=>layer.forEach((id,i)=>rows.set(id,i)));updateRows();
 for(let sweep=0;sweep<4;sweep++){const forward=sweep%2===0;for(const n of layers.map((_,i)=>i).sort((a,b)=>forward?a-b:b-a)){const center=(id:string)=>{const neighbors=dag.filter(r=>forward?r.to===id:r.from===id).map(r=>rows.get(forward?r.from:r.to)!);return neighbors.length?neighbors.reduce((a,b)=>a+b,0)/neighbors.length:rows.get(id)!;};const centers=new Map(layers[n].map(id=>[id,center(id)]));layers[n].sort((a,b)=>centers.get(a)!-centers.get(b)!||order(a,b));updateRows();}}
 const positions=new Map<string,Position>();layers.forEach((layer,n)=>layer.forEach((id,i)=>positions.set(id,{x:60+n*340,y:60+i*315})));isolated.forEach((id,i)=>positions.set(id,{x:60+layers.length*340,y:60+i*315}));
 return {positions:new Map(ids.map(id=>[id,positions.get(id)!])),dag,back,isolated,fallback:false};
}
export function overviewLayout(index:Index):Map<string,Position>{return flowLayout(index).positions;}
/** Adjacent cards use their nearest ports; longer routes stay in row/column gutters.
 * Each path is simple (no retraced segment), including self loops. Reverse flows use
 * separate ports so their arrows remain independently readable. */
export function overviewRoute(positions:Map<string,Position>,r:Relation,ordinal:number):Position[]{
 const a=positions.get(r.from)!,b=positions.get(r.to)!,reverse=r.from>r.to,offset=reverse?12:0,lane=(ordinal%4)*12;
 if(r.from===r.to)return [{x:a.x+250,y:a.y+50},{x:a.x+280+lane,y:a.y+50},{x:a.x+280+lane,y:a.y+255+lane},{x:a.x+180,y:a.y+255+lane},{x:a.x+180,y:a.y+220}];
 if(a.y===b.y&&Math.abs(a.x-b.x)===340){const right=b.x>a.x;return [{x:a.x+(right?250:0),y:a.y+110+offset},{x:b.x+(right?0:250),y:b.y+110+offset}];}
 if(a.x===b.x&&Math.abs(a.y-b.y)===315){const down=b.y>a.y;return [{x:a.x+125+offset,y:a.y+(down?220:0)},{x:b.x+125+offset,y:b.y+(down?0:220)}];}
 const down=b.y>=a.y,exitY=a.y+(down?255+lane:-16-lane),entryY=b.y+(down?-16-lane:255+lane),rail=a.x+(reverse?-16-lane:270+lane),port=a.x+125+offset,targetPort=b.x+125+offset;
 const points=[{x:port,y:a.y+(down?220:0)},{x:port,y:exitY},{x:rail,y:exitY},{x:rail,y:entryY},{x:targetPort,y:entryY},{x:targetPort,y:b.y+(down?0:220)}];
 return points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
}
