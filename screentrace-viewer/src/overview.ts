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
/** Adjacent cards use their nearest ports; longer routes stay in row/column gutters.
 * Each path is simple (no retraced segment), including self loops. Reverse flows use
 * separate ports so their arrows remain independently readable. */
export function overviewRoute(positions:Map<string,Position>,r:Relation,ordinal:number):Position[]{
 const a=positions.get(r.from)!,b=positions.get(r.to)!,reverse=r.from>r.to,offset=reverse?12:0,lane=(ordinal%4)*12;
 if(r.from===r.to)return [{x:a.x+250,y:a.y+50},{x:a.x+280+lane,y:a.y+50},{x:a.x+280+lane,y:a.y+180+lane},{x:a.x+180,y:a.y+180+lane},{x:a.x+180,y:a.y+145}];
 if(a.y===b.y&&Math.abs(a.x-b.x)===340){const right=b.x>a.x;return [{x:a.x+(right?250:0),y:a.y+72+offset},{x:b.x+(right?0:250),y:b.y+72+offset}];}
 if(a.x===b.x&&Math.abs(a.y-b.y)===240){const down=b.y>a.y;return [{x:a.x+125+offset,y:a.y+(down?145:0)},{x:b.x+125+offset,y:b.y+(down?0:145)}];}
 const down=b.y>=a.y,exitY=a.y+(down?180+lane:-16-lane),entryY=b.y+(down?-16-lane:180+lane),rail=a.x+(reverse?-16-lane:270+lane),port=a.x+125+offset,targetPort=b.x+125+offset;
 const points=[{x:port,y:a.y+(down?145:0)},{x:port,y:exitY},{x:rail,y:exitY},{x:rail,y:entryY},{x:targetPort,y:entryY},{x:targetPort,y:b.y+(down?0:145)}];
 return points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
}
