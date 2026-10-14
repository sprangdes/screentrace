import {Index,Relation,Position} from './map';
import {CARD,COMMON_DESTINATION_MIN_SCREENS,flowLayout,overviewFlows,RoutedRelation} from './overview';

const TRACK=10;

/** One area of the overview: the screens whose primary URL starts with the same path segment. */
export interface ScreenGroup {key:string;label:string;members:string[];box:{x:number;y:number;width:number;height:number}}
/** All flows between two areas, drawn as one line with their count. */
export interface GroupLink {from:string;to:string;relations:Relation[];points:Position[]}
export interface GroupedLayout {positions:Map<string,Position>;routes:RoutedRelation[];width:number;height:number;groups:ScreenGroup[];links:GroupLink[];cross:Relation[]}

export const OTHER_GROUP='其他';
const TITLE=64,GAP=170,ORIGIN=60;
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;

const segments=(route:string)=>route.split(/[?#]/)[0].split('/').filter(Boolean).map(part=>part.replace(/\.[a-z0-9]+$/i,''));
const dynamic=(part:string)=>part.startsWith(':')||part.startsWith('{')||part.includes('*')||part.includes('$');

/**
 * Areas by the first URL path segment that tells screens apart (a segment every screen shares, such as a context
 * path, is skipped). Areas of one screen are pooled into 其他. No areas when that leaves fewer than two real ones.
 */
export function screenGroups(index:Index):Map<string,string>|undefined{
 if(index.screens.length<=COMMON_DESTINATION_MIN_SCREENS)return undefined;
 const routes=new Map(index.screens.map(s=>[s.id,segments(index.routes.get(s.id)?.[0]||'')]));
 let depth=0;
 for(;depth<4;depth++){const first=new Set([...routes.values()].map(parts=>parts[depth]));if(first.size!==1||first.has(undefined as unknown as string))break;}
 const keyOf=(parts:string[])=>{const part=parts[depth];return part&&!dynamic(part)?'/'+parts.slice(0,depth+1).join('/'):'/';};
 const byKey=new Map<string,string[]>();
 for(const [id,parts] of routes){const key=keyOf(parts);byKey.set(key,[...(byKey.get(key)||[]),id]);}
 const result=new Map<string,string>();
 for(const [key,ids] of byKey)for(const id of ids)result.set(id,ids.length>1?key:OTHER_GROUP);
 const real=new Set([...result.values()].filter(key=>key!==OTHER_GROUP));
 return real.size>=2?result:undefined;
}

/** The overview laid out as areas: each area keeps the flow layout of its own screens; flows between areas are bundled. */
export function groupedLayout(index:Index):GroupedLayout|undefined{
 if(index.screens.length>150||index.relations.length>600)return undefined;
 const membership=screenGroups(index);if(!membership)return undefined;
 const keys=[...new Set(membership.values())].sort((a,b)=>Number(a===OTHER_GROUP)-Number(b===OTHER_GROUP)||order(a,b));
 const inner=keys.map(key=>{const members=new Set([...membership].filter(([,k])=>k===key).map(([id])=>id));return {key,members,layout:flowLayout(index,members)};})
  .sort((a,b)=>Number(a.key===OTHER_GROUP)-Number(b.key===OTHER_GROUP)||b.members.size-a.members.size||order(a.key,b.key));
 // Shelf packing: rows of areas, the row width chosen so the whole map is roughly 16:10.
 const area=inner.reduce((sum,g)=>sum+(g.layout.width)*(g.layout.height+TITLE),0),target=Math.max(...inner.map(g=>g.layout.width),Math.sqrt(area*1.6));
 // Lines that cross more than one row run down a spine left of every area; it widens with the links it carries.
 const spine=ORIGIN+TRACK*(Math.min(30,keys.length*keys.length)+2);
 const placed:{group:typeof inner[number];x:number;y:number;row:number}[]=[],rows:{top:number;bottom:number}[]=[];let x=spine,y=ORIGIN,rowHeight=0;
 for(const group of inner){const w=group.layout.width,h=group.layout.height+TITLE;if(x>spine&&x+w>spine+target){rows.push({top:y,bottom:y+rowHeight});x=spine;y+=rowHeight+GAP;rowHeight=0;}placed.push({group,x,y,row:rows.length});x+=w+GAP;rowHeight=Math.max(rowHeight,h);}
 rows.push({top:y,bottom:y+rowHeight});
 const positions=new Map<string,Position>(),routes:RoutedRelation[]=[],groups:ScreenGroup[]=[];
 for(const {group,x,y} of placed){
  const dx=x,dy=y+TITLE;
  for(const [id,p] of group.layout.positions)positions.set(id,{x:p.x+dx,y:p.y+dy});
  for(const route of group.layout.routes)routes.push({relation:route.relation,points:route.points.map(p=>({x:p.x+dx,y:p.y+dy}))});
  const count=group.members.size;
  groups.push({key:group.key,label:`${group.key===OTHER_GROUP?OTHER_GROUP:group.key==='/'?'/（首頁）':group.key} · ${count} 個畫面`,members:[...group.members].sort(order),box:{x,y,width:group.layout.width,height:group.layout.height+TITLE}});
 }
 const cross=overviewFlows(index).filter(r=>r.from!==r.to&&membership.get(r.from)!==membership.get(r.to));
 const pairs=new Map<string,Relation[]>();
 for(const r of cross){const key=`${membership.get(r.from)}\u0000${membership.get(r.to)}`;pairs.set(key,[...(pairs.get(key)||[]),r]);}
 const rowOf=new Map(placed.map(p=>[p.group.key,p.row])),boxes=new Map(groups.map(g=>[g.key,g.box]));
 const links=routeLinks([...pairs].sort(([a],[b])=>order(a,b)).map(([key,relations])=>{const [from,to]=key.split('\u0000');return {from,to,relations};}),boxes,rowOf,rows,spine);
 const width=Math.max(...groups.map(g=>g.box.x+g.box.width))+ORIGIN,height=Math.max(...groups.map(g=>g.box.y+g.box.height))+ORIGIN;
 return {positions,routes,width,height,groups,links,cross};
}

type Box={x:number;y:number;width:number;height:number};
type Corridor={id:string;tracks:number};
/**
 * Orthogonal routes through the space between areas, never across one: a link leaves its area's bottom (or top)
 * into the corridor between rows, runs along it and enters the target; links spanning several rows go down a
 * spine left of all areas. Every link has its own track in each corridor and its own port on each area edge.
 */
function routeLinks(pairs:{from:string;to:string;relations:Relation[]}[],boxes:Map<string,Box>,rowOf:Map<string,number>,rows:{top:number;bottom:number}[],spine:number):GroupLink[]{
 const below=(r:number)=>rows[r].bottom+GAP/2,corridor=new Map<string,Corridor>(),track=(id:string)=>{const c=corridor.get(id)??corridor.set(id,{id,tracks:0}).get(id)!;return c.tracks++;};
 const ports=new Map<string,number>(),port=(key:string,edge:'top'|'bottom')=>{const id=key+edge,n=ports.get(id)||0;ports.set(id,n+1);return n;};
 const plans=pairs.map(pair=>{
  const ra=rowOf.get(pair.from)!,rb=rowOf.get(pair.to)!,up=rb<ra;
  const exit=up?'top':'bottom',entry=rb>ra?'top':'bottom';
  const lane=up?ra-1:ra,targetLane=rb>ra?rb-1:rb,crossing=Math.abs(rb-ra)>1;
  return {...pair,exit,entry,lane,targetLane,crossing,out:port(pair.from,exit),into:port(pair.to,entry),t1:track(`row${lane}`),t2:crossing?track(`row${targetLane}`):0,ts:crossing?track('spine'):0} as const;
 });
 const spread=(box:Box,index:number,count:number)=>box.x+box.width/2+(index-(count-1)/2)*Math.min(24,(box.width-80)/Math.max(1,count));
 const laneY=(lane:number,t:number)=>{const n=corridor.get(`row${lane}`)?.tracks||1;return below(lane)+(t-(n-1)/2)*Math.min(TRACK,(GAP-40)/Math.max(1,n));};
 return plans.map(plan=>{
  const a=boxes.get(plan.from)!,b=boxes.get(plan.to)!;
  const ax=spread(a,plan.out,ports.get(plan.from+plan.exit)!),bx=spread(b,plan.into,ports.get(plan.to+plan.entry)!);
  const ay=plan.exit==='top'?a.y:a.y+a.height,by=plan.entry==='top'?b.y:b.y+b.height,y1=laneY(plan.lane,plan.t1);
  let points:Position[];
  if(!plan.crossing)points=[{x:ax,y:ay},{x:ax,y:y1},{x:bx,y:y1},{x:bx,y:by}];
  else{const sx=spine-ORIGIN/2-plan.ts*TRACK,y2=laneY(plan.targetLane,plan.t2);points=[{x:ax,y:ay},{x:ax,y:y1},{x:sx,y:y1},{x:sx,y:y2},{x:bx,y:y2},{x:bx,y:by}];}
  return {from:plan.from,to:plan.to,relations:plan.relations,points:points.map(p=>({x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10}))};
 });
}
/** Straight segment between two boxes' borders along the line joining their centers, shifted sideways by offset. */
function connect(a:Box,b:Box,offset:number):Position[]{
 const ca={x:a.x+a.width/2,y:a.y+a.height/2},cb={x:b.x+b.width/2,y:b.y+b.height/2},dx=cb.x-ca.x,dy=cb.y-ca.y,length=Math.hypot(dx,dy)||1;
 const nx=-dy/length*offset,ny=dx/length*offset;
 const clip=(box:Box,center:Position,ux:number,uy:number)=>{const t=Math.min(ux?box.width/2/Math.abs(ux):Infinity,uy?box.height/2/Math.abs(uy):Infinity);return {x:Math.round((center.x+ux*t+nx)*10)/10,y:Math.round((center.y+uy*t+ny)*10)/10};};
 return [clip(a,ca,dx/length,dy/length),clip(b,cb,-dx/length,-dy/length)];
}

/** A straight line between two cards for a flow between areas, shown only while one of its ends is pointed at. */
export function crossPoints(positions:Map<string,Position>,r:Relation):Position[]{
 const a=positions.get(r.from)!,b=positions.get(r.to)!;
 return connect({x:a.x,y:a.y,width:CARD.width,height:CARD.height},{x:b.x,y:b.y,width:CARD.width,height:CARD.height},0);
}
