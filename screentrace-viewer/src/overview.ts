import {Index,Relation,Position} from './map';
import {Node} from './contracts';
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Only visible/semantic link identity belongs in grouping; expansion anchors and other provenance vary per source occurrence. */
const NAVIGATION_SEMANTIC_ATTRIBUTES=['kind','tag','componentType','href','target','httpMethod'] as const;
export function navigationIdentity(index:Index,node:Node|undefined,to:string):string|undefined {
 if(!node)return;
 if(node.attributes.kind!=='LINK'&&node.attributes.tag!=='a'&&node.attributes.componentType!=='NAVIGATION')return;
 const attributes=NAVIGATION_SEMANTIC_ATTRIBUTES.filter(name=>node.attributes[name]!==undefined).map(name=>[name,node.attributes[name]]);
 return JSON.stringify([to,node.name,attributes]);
}
/** Presentation classification only: at least two owners, same target and semantic link identity, >=50% of screens. */
const partitions=new WeakMap<Index,{global:Relation[];flows:Relation[]}>();
export function partitionNavigation(index:Index):{global:Relation[];flows:Relation[]}{
 const cached=partitions.get(index);if(cached)return cached;
 const owners=new Map<string,Set<string>>();
 for(const r of index.relations)for(const trigger of r.triggers){const key=navigationIdentity(index,index.nodes.get(trigger),r.to);if(key){const set=owners.get(key)||new Set<string>();set.add(r.from);owners.set(key,set);}}
 const global:Relation[]=[],flows:Relation[]=[];
 for(const r of index.relations){const common=r.triggers.filter(id=>{const key=navigationIdentity(index,index.nodes.get(id),r.to),count=key?owners.get(key)?.size||0:0;return count>=2&&count*2>=index.screens.length;}),specific=r.triggers.filter(id=>!common.includes(id));
 if(common.length)global.push({...r,triggers:common});if(specific.length||!r.triggers.length)flows.push({...r,triggers:specific});}
 const result={global,flows};partitions.set(index,result);return result;
}
// With few screens every line stays readable; beyond this, destinations most screens reach are not drawn on the overview.
export const COMMON_DESTINATION_MIN_SCREENS=12;
/**
 * Destinations reached from at least half of all screens (sign-in, the home page): drawing a line from every
 * screen to them buries the flows that tell screens apart. The overview shows them as a badge on the target
 * instead; zooming into a screen still draws them. Only a few such destinations (at most 3, or a fifth of
 * the screens) are singled out.
 */
export function commonDestinations(index:Index):Map<string,string[]>{
 const result=new Map<string,string[]>();
 if(index.screens.length<=COMMON_DESTINATION_MIN_SCREENS)return result;
 const sources=new Map<string,Set<string>>();
 for(const r of partitionNavigation(index).flows)if(r.from!==r.to){const set=sources.get(r.to)||new Set<string>();set.add(r.from);sources.set(r.to,set);}
 for(const [to,set]of sources)if(set.size*2>=index.screens.length)result.set(to,[...set].sort());
 // They must stand out: when many screens qualify the application is uniformly dense and every line matters.
 if(result.size>Math.max(3,Math.floor(index.screens.length/5)))return new Map();
 return result;
}
/** The flows the overview draws and lays out: page-specific flows other than those into common destinations. */
export function overviewFlows(index:Index):Relation[]{const common=commonDestinations(index);return partitionNavigation(index).flows.filter(r=>r.from===r.to||!common.has(r.to));}
/** Grid cell of a card: flow layers are columns, ordered slots are rows. */
export interface Cell {col:number;row:number}
export interface RoutedRelation {relation:Relation;points:Position[]}
export interface FlowLayout {positions:Map<string,Position>;routes:RoutedRelation[];width:number;height:number;dag:Relation[];back:Relation[];isolated:string[];fallback:boolean}
export const CARD={width:250,height:220};
const ORIGIN=60,MIN_CHANNEL=90,MIN_GUTTER=95,MAX_GAP=260,TRACK=10,PAD=18;

/** Stable grid keeps cyclic applications spread across both axes. */
export function gridCells(index:Index):Map<string,Cell>{
 const columns=Math.max(1,index.screens.length<=12?Math.min(3,Math.ceil(Math.sqrt(index.screens.length))):Math.ceil(Math.sqrt(index.screens.length)));
 return new Map(index.screens.map((screen,i)=>[screen.id,{col:i%columns,row:Math.floor(i/columns)}]));
}
export function gridLayout(index:Index):Map<string,Position>{return routeDiagram(gridCells(index),overviewFlows(index)).positions;}

/** Sorted DFS removes only ancestor edges; longest DAG paths determine left-to-right layers.
 * Four alternating barycenter sweeps order each layer, with IDs breaking every tie; each card then
 * takes the median row of its predecessors when free, so chains run straight. */
export function flowLayout(index:Index):FlowLayout {
 const drawn=overviewFlows(index);
 if(index.screens.length>150||index.relations.length>600)return {...routeDiagram(gridCells(index),drawn),dag:[],back:[],isolated:[],fallback:true};
 const ids=index.screens.map(s=>s.id).sort(order),edges=drawn.filter(r=>r.from!==r.to).sort((a,b)=>order(a.from,b.from)||order(a.to,b.to));
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
 const cells=new Map<string,Cell>();
 layers.forEach((layer,col)=>{let next=0;for(const id of layer){
  const preds=dag.filter(r=>r.to===id).map(r=>cells.get(r.from)?.row).filter((row):row is number=>row!==undefined).sort((a,b)=>a-b);
  const row=Math.max(next,preds.length?preds[Math.floor((preds.length-1)/2)]:next);cells.set(id,{col,row});next=row+1;
 }});
 isolated.forEach((id,row)=>cells.set(id,{col:layers.length,row}));
 const diagram=routeDiagram(new Map(ids.map(id=>[id,cells.get(id)!])),drawn);
 return {...diagram,dag,back,isolated,fallback:false};
}
export function overviewLayout(index:Index):Map<string,Position>{return flowLayout(index).positions;}

type Side='R'|'L'|'B'|'T';
type XRef={k:'card';col:number;dx:number}|{k:'chan';c:number;t?:number};
type YRef={k:'card';row:number;dy:number}|{k:'gut';g:number;t?:number};
interface Port {cell:Cell;side:Side;key:number;offset?:number;shared?:Port[]}
const ax=(x:XRef)=>x.k==='card'?x.col*1000+x.dx:x.c*1000+600,ay=(y:YRef)=>y.k==='card'?y.row*1000+y.dy:y.g*1000+600;

/** Orthogonal routes on the card grid.
 * Forward flows leave a card's right side and enter the target's left side, straight when the row between them is
 * free; flows back to an earlier or the same column leave below (or above) and loop through the row gutters.
 * Every vertical run sits on its own track in a column channel and every horizontal run on its own track in a row
 * gutter, so lines never overlap; channels and gutters widen with the number of tracks they carry. */
export function routeDiagram(cells:Map<string,Cell>,flows:Relation[]):{positions:Map<string,Position>;routes:RoutedRelation[];width:number;height:number}{
 const taken=new Set([...cells.values()].map(c=>`${c.col},${c.row}`));
 const clear=(row:number,from:number,to:number)=>{for(let col=from+1;col<to;col++)if(taken.has(`${col},${row}`))return false;return true;};
 const ports=new Map<string,Port[]>(),port=(cell:Cell,side:Side,key:number):Port=>{const id=`${cell.col},${cell.row},${side}`,list=ports.get(id)??ports.set(id,[]).get(id)!,p:Port={cell,side,key,shared:list};list.push(p);return p;};
 type Plan={relation:Relation;from:Port;to:Port;straight?:boolean;build:(a:{x:XRef;y:YRef},b:{x:XRef;y:YRef})=>{x:XRef;y:YRef}[]};
 const plans:Plan[]=[];
 for(const relation of flows){
  const a=cells.get(relation.from),b=cells.get(relation.to);if(!a||!b)continue;
  const chan=(c:number):XRef=>({k:'chan',c}),gut=(g:number):{k:'gut';g:number;t?:number}=>({k:'gut',g});
  if(relation.from===relation.to){
   const v=chan(a.col),g=gut(a.row);
   plans.push({relation,from:port(a,'R',1e9),to:port(a,'B',1e9),build:(s,e)=>[s,{x:v,y:s.y},{x:v,y:g},{x:e.x,y:g},e]});continue;
  }
  if(b.col>a.col){
   const from=port(a,'R',b.row*1000+b.col),to=port(b,'L',a.row*1000+a.col);
   const jog=(c:number)=>{const v=chan(c);return (s:{x:XRef;y:YRef},e:{x:XRef;y:YRef})=>[s,{x:v,y:s.y},{x:v,y:e.y},e];};
   if(a.row===b.row&&clear(a.row,a.col,b.col))plans.push({relation,from,to,straight:true,build:(s,e)=>(s.y as {dy:number}).dy===(e.y as {dy:number}).dy?[s,e]:jog(b.col-1)(s,e)});
   else if(b.col===a.col+1||clear(b.row,a.col,b.col))plans.push({relation,from,to,build:jog(a.col)});
   else if(clear(a.row,a.col,b.col))plans.push({relation,from,to,build:jog(b.col-1)});
   else{const g=gut(b.row>a.row?b.row-1:b.row<a.row?b.row:a.row),v1=chan(a.col),v2=chan(b.col-1);plans.push({relation,from,to,build:(s,e)=>[s,{x:v1,y:s.y},{x:v1,y:g},{x:v2,y:g},{x:v2,y:e.y},e]});}
   continue;
  }
  // Back to an earlier column, or within the same one.
  const key=(other:Cell)=>other.col*1000+other.row;
  if(a.row===b.row){const g=gut(a.row);plans.push({relation,from:port(a,'B',key(b)),to:port(b,'B',key(a)),build:(s,e)=>[s,{x:s.x,y:g},{x:e.x,y:g},e]});continue;}
  const down=b.row>a.row,from=port(a,down?'B':'T',key(b)),to=port(b,down?'T':'B',key(a));
  const g1=gut(down?a.row:a.row-1),g2=gut(down?b.row-1:b.row),v=chan(b.col===a.col?a.col:b.col);
  if(g1.g===g2.g)plans.push({relation,from,to,build:(s,e)=>[s,{x:s.x,y:g1},{x:e.x,y:g1},e]});
  else plans.push({relation,from,to,build:(s,e)=>[s,{x:s.x,y:g1},{x:v,y:g1},{x:v,y:g2},{x:e.x,y:g2},e]});
 }
 // Ports spread along each side, ordered by where their other end lies so lines leave without crossing.
 for(const list of ports.values()){
  list.sort((p,q)=>p.key-q.key);const side=list[0].side,vertical=side==='R'||side==='L',center=vertical?CARD.height/2:CARD.width/2,step=Math.min(vertical?18:20,(vertical?180:230)/list.length);
  list.forEach((p,i)=>{p.offset=Math.round(center+(i-(list.length-1)/2)*step);});
 }
 // A straight flow whose end has that side to itself lines up with the other end, so it needs no jog.
 for(const plan of plans)if(plan.straight){if(plan.to.shared!.length===1)plan.to.offset=plan.from.offset;else if(plan.from.shared!.length===1)plan.from.offset=plan.to.offset;}
 const end=(p:Port):{x:XRef;y:YRef}=>({x:{k:'card',col:p.cell.col,dx:p.side==='R'?CARD.width:p.side==='L'?0:p.offset!},y:{k:'card',row:p.cell.row,dy:p.side==='B'?CARD.height:p.side==='T'?0:p.offset!}});
 const symbolic=plans.map(plan=>plan.build(end(plan.from),end(plan.to)));
 // Tracks: interval colouring of the runs sharing a channel or a gutter.
 const runs=new Map<string,{ref:{t?:number};lo:number;hi:number}[]>();
 for(const points of symbolic)for(let i=1;i<points.length;i++){
  const p=points[i-1],q=points[i];
  if(p.x===q.x&&p.x.k==='chan'){const id=`c${p.x.c}`,lo=Math.min(ay(p.y),ay(q.y)),hi=Math.max(ay(p.y),ay(q.y));(runs.get(id)??runs.set(id,[]).get(id)!).push({ref:p.x,lo,hi});}
  if(p.y===q.y&&p.y.k==='gut'){const id=`g${p.y.g}`,lo=Math.min(ax(p.x),ax(q.x)),hi=Math.max(ax(p.x),ax(q.x));(runs.get(id)??runs.set(id,[]).get(id)!).push({ref:p.y,lo,hi});}
 }
 const tracks=new Map<string,number>();
 for(const [id,list] of runs){
  list.sort((p,q)=>p.lo-q.lo||p.hi-q.hi);const ends:number[]=[];
  for(const run of list){let t=ends.findIndex(e=>e<run.lo);if(t<0){t=ends.length;ends.push(run.hi);}else ends[t]=run.hi;run.ref.t=t;}
  tracks.set(id,ends.length);
 }
 const gap=(count:number,min:number)=>Math.min(MAX_GAP,Math.max(min,(count+1)*TRACK+2*PAD));
 const spacing=(count:number,size:number)=>count>1?Math.min(TRACK,(size-2*PAD)/(count-1)):0;
 const cols=Math.max(0,...[...cells.values()].map(c=>c.col))+1,rowCount=Math.max(0,...[...cells.values()].map(c=>c.row))+1;
 const channel=Array.from({length:cols},(_,c)=>gap(tracks.get(`c${c}`)||0,MIN_CHANNEL)),gutter=Array.from({length:rowCount},(_,r)=>gap(tracks.get(`g${r}`)||0,MIN_GUTTER));
 const left:number[]=[],top:number[]=[];
 for(let c=0;c<cols;c++)left[c]=c?left[c-1]+CARD.width+channel[c-1]:ORIGIN;
 for(let r=0;r<rowCount;r++)top[r]=r?top[r-1]+CARD.height+gutter[r-1]:ORIGIN;
 const x=(ref:XRef)=>{if(ref.k==='card')return left[ref.col]+ref.dx;const n=tracks.get(`c${ref.c}`)||1;return left[ref.c]+CARD.width+channel[ref.c]/2+((ref.t??0)-(n-1)/2)*spacing(n,channel[ref.c]);};
 const y=(ref:YRef)=>{if(ref.k==='card')return top[ref.row]+ref.dy;const n=tracks.get(`g${ref.g}`)||1;return top[ref.g]+CARD.height+gutter[ref.g]/2+((ref.t??0)-(n-1)/2)*spacing(n,gutter[ref.g]);};
 const routes=plans.map((plan,i)=>{
  const raw=symbolic[i].map(p=>({x:Math.round(x(p.x)*10)/10,y:Math.round(y(p.y)*10)/10}));
  const points=raw.filter((p,j)=>!j||p.x!==raw[j-1].x||p.y!==raw[j-1].y).filter((p,j,all)=>j===0||j===all.length-1||!((all[j-1].x===p.x&&p.x===all[j+1].x)||(all[j-1].y===p.y&&p.y===all[j+1].y)));
  return {relation:plan.relation,points};
 });
 const positions=new Map([...cells].map(([id,c])=>[id,{x:left[c.col],y:top[c.row]}]));
 return {positions,routes,width:left[cols-1]+CARD.width+channel[cols-1]+ORIGIN,height:top[rowCount-1]+CARD.height+gutter[rowCount-1]+ORIGIN};
}
/** SVG path for an orthogonal route with rounded corners. */
export function roundedPath(points:Position[],radius=6):string{
 if(!points.length)return '';
 let d=`M${points[0].x},${points[0].y}`;
 for(let i=1;i<points.length-1;i++){
  const p=points[i-1],c=points[i],n=points[i+1],r=Math.min(radius,Math.hypot(c.x-p.x,c.y-p.y)/2,Math.hypot(n.x-c.x,n.y-c.y)/2);
  const ux=Math.sign(c.x-p.x),uy=Math.sign(c.y-p.y),vx=Math.sign(n.x-c.x),vy=Math.sign(n.y-c.y);
  d+=` L${c.x-ux*r},${c.y-uy*r} Q${c.x},${c.y} ${c.x+vx*r},${c.y+vy*r}`;
 }
 const last=points.at(-1)!;return `${d} L${last.x},${last.y}`;
}
