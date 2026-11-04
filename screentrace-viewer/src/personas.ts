import {Graph} from './contracts';
import {Index,Position} from './map';
import {CARD,RoutedRelation} from './overview';
import {GroupedLayout,ScreenGroup} from './groups';

export type PersonaStatus='APPLIES'|'UNKNOWN'|'EXCLUDED';
export type Reach='REACHABLE'|'POSSIBLE'|'UNREACHED'|'EXCLUDED';
export interface PersonaFact {text:string;truth:boolean}
export interface PersonaStep {from:string;to:string;kind:string;behaviorId?:string|null;status:PersonaStatus}
export interface PersonaFlow {entryPoints:string[];reached:{screenId:string;reach:'REACHABLE'|'POSSIBLE';depth:number}[];unreached:string[];steps:PersonaStep[];unevaluatedNavigations:number}
export interface Persona {id:string;name:string;description?:string;facts:PersonaFact[];startPaths:string[];screens:Record<string,PersonaStatus>;navigations:{behaviorId:string;status:PersonaStatus;targets:string[]}[];flow?:PersonaFlow}
/**
 * depth: the step a reached screen is first seen at, counting screens only (passing through a URL redirect is not a step).
 * lines: screen-to-screen steps of the flow, as the overview draws them. hops: the same plus screen-to-screen moves
 * through URL entries, as the flow map draws them.
 */
export interface PersonaView {persona:Persona;reach:Map<string,Reach>;depth:Map<string,number>;lines:Map<string,'APPLIES'|'UNKNOWN'>;hops:Map<string,'APPLIES'|'UNKNOWN'>;counts:Record<Reach,number>;unevaluated:number}
export interface FlowGroup {key:string;title:string;reach:Reach;screens:string[]}

export const REACH_ORDER:Reach[]=['REACHABLE','POSSIBLE','UNREACHED','EXCLUDED'];
/** Plain words for where a screen sits in a persona's flow. */
export const reachLabel:Record<Reach,string>={REACHABLE:'會走到',POSSIBLE:'可能走到',UNREACHED:'走不到',EXCLUDED:'不適用'};
/** What each word means, for legends and tooltips. */
export const reachHelp:Record<Reach,string>={REACHABLE:'從起點一路的條件都成立',POSSIBLE:'途中有程式無法判定的條件',UNREACHED:'這個角色可以看，但從起點沒有路可到',EXCLUDED:'畫面的條件和這個角色矛盾'};
export const lineKey=(from:string,to:string)=>JSON.stringify([from,to]);
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Personas carried by a schema 2.4 graph; anything malformed is left out so the report still opens. */
export function graphPersonas(graph:Graph):Persona[]{
 const list=graph.schemaVersion==='2.4'?graph.application.personas:undefined;
 if(!Array.isArray(list))return [];
 return list.filter((p):p is Persona=>{const item=p as Partial<Persona>|null;return !!item&&typeof item.id==='string'&&typeof item.name==='string'&&Array.isArray(item.facts)&&!!item.screens&&typeof item.screens==='object';});
}

/** How one persona sees every screen of the map and which overview lines its flow takes. */
export function personaView(index:Index,persona:Persona):PersonaView{
 const reach=new Map<string,Reach>(),depth=new Map<string,number>(),lines=new Map<string,'APPLIES'|'UNKNOWN'>(),hops=new Map<string,'APPLIES'|'UNKNOWN'>();
 const reached=new Map((persona.flow?.reached||[]).map(r=>[r.screenId,r]));
 for(const screen of index.screens){
  const found=reached.get(screen.id);
  if(found)reach.set(screen.id,found.reach==='REACHABLE'?'REACHABLE':'POSSIBLE');
  else reach.set(screen.id,persona.screens[screen.id]==='EXCLUDED'?'EXCLUDED':'UNREACHED');
 }
 const isScreen=(id:string)=>index.nodes.get(id)?.type==='SCREEN';
 const merge=(map:Map<string,'APPLIES'|'UNKNOWN'>,key:string,certain:boolean)=>{if(map.get(key)!=='APPLIES')map.set(key,certain?'APPLIES':'UNKNOWN');};
 const out=new Map<string,PersonaStep[]>();
 for(const step of persona.flow?.steps||[]){
  out.set(step.from,[...(out.get(step.from)||[]),step]);
  if(isScreen(step.from)&&isScreen(step.to))merge(lines,lineKey(step.from,step.to),step.status==='APPLIES');
 }
 // From each screen, follow steps through URL entries (no screen in between) to the next screens.
 const next=(from:string)=>{
  const found=new Map<string,boolean>(),seen=new Set<string>([from]);
  const walk=(id:string,certain:boolean)=>{for(const step of out.get(id)||[]){const ok=certain&&step.status==='APPLIES';if(isScreen(step.to)){if(!found.get(step.to))found.set(step.to,ok);}else if(!seen.has(step.to)){seen.add(step.to);walk(step.to,ok);}}};
  walk(from,true);return found;
 };
 for(const id of reached.keys())for(const [to,certain] of next(id))merge(hops,lineKey(id,to),certain);
 // Steps count screens: breadth first from the start entries over screen-to-screen moves.
 let frontier=[...new Set((persona.flow?.entryPoints||[]).flatMap(entry=>[...next(entry).keys()]))].filter(id=>reached.has(id));
 for(let step=1;frontier.length;step++){
  for(const id of frontier)depth.set(id,step);
  frontier=[...new Set(frontier.flatMap(id=>[...next(id).keys()]))].filter(id=>reached.has(id)&&!depth.has(id));
 }
 // A reached screen the walk cannot place (malformed steps) keeps the depth the analysis gave it.
 for(const [id,found] of reached)if(reach.has(id)&&!depth.has(id))depth.set(id,found.depth);
 const counts:Record<Reach,number>={REACHABLE:0,POSSIBLE:0,UNREACHED:0,EXCLUDED:0};
 for(const value of reach.values())counts[value]++;
 return {persona,reach,depth,lines,hops,counts,unevaluated:persona.flow?.unevaluatedNavigations||0};
}

/** The persona's flow as the list shows it: reached screens by step, then unreached, then excluded. */
export function flowGroups(index:Index,view:PersonaView):FlowGroup[]{
 const name=(id:string)=>index.nodes.get(id)?.name||id;
 const sorted=(ids:string[])=>ids.sort((a,b)=>REACH_ORDER.indexOf(view.reach.get(a)!)-REACH_ORDER.indexOf(view.reach.get(b)!)||name(a).localeCompare(name(b),'zh-Hant')||order(a,b));
 const steps=new Map<number,string[]>();
 for(const [id,value] of view.depth){const list=steps.get(value)||[];list.push(id);steps.set(value,list);}
 const groups:FlowGroup[]=[...steps.keys()].sort((a,b)=>a-b).map(step=>({key:`step-${step}`,title:`第 ${step} 步`,reach:'REACHABLE',screens:sorted(steps.get(step)!)}));
 for(const reach of ['UNREACHED','EXCLUDED'] as const){const ids=index.screens.filter(s=>view.reach.get(s.id)===reach).map(s=>s.id);if(ids.length)groups.push({key:reach.toLowerCase(),title:reachLabel[reach],reach,screens:sorted(ids)});}
 return groups;
}

/** One line per fact, the way the analyst set it, e.g. `me.business：否`. */
export const factLabel=(fact:PersonaFact)=>`${fact.text}：${fact.truth?'是':'否'}`;
/** Who the persona is, in the analyst's words when given; otherwise how many conditions decide it. */
export const personaDescription=(persona:Persona)=>persona.description||`依 ${persona.facts.length} 個條件判定`;
/** The persona's screens at a glance: only the counts that say where it goes. */
export const reachSummary=(view:PersonaView)=>`${reachLabel.REACHABLE} ${view.counts.REACHABLE} · ${reachLabel.POSSIBLE} ${view.counts.POSSIBLE}`;
/** Where a screen sits in one persona's flow, for badges and the comparison table. */
export const reachText=(view:PersonaView,id:string)=>{const value=view.reach.get(id)!,step=view.depth.get(id);return step===undefined?reachLabel[value]:`${reachLabel[value]} · 第 ${step} 步`;};

const FLOW={origin:60,title:64,pad:24,rowGap:40,columnGap:140,track:8};
/**
 * The persona's flow drawn left to right: one column per step from the start URL, then a column for screens it
 * never reaches and one for screens that do not apply to it. Only lines from one step to the next are drawn;
 * within a column, screens follow the rows of the screens leading to them so the lines stay short.
 */
export function personaLayout(index:Index,view:PersonaView):GroupedLayout{
 const name=(id:string)=>index.nodes.get(id)?.name||id;
 const forward=[...view.hops].map(([key,status])=>{const [from,to]=JSON.parse(key) as [string,string];return {from,to,status};})
  .filter(line=>view.depth.has(line.from)&&view.depth.get(line.to)===view.depth.get(line.from)!+1)
  .sort((a,b)=>order(a.from,b.from)||order(a.to,b.to));
 const steps=[...new Set(view.depth.values())].sort((a,b)=>a-b);
 const columns:{key:string;label:string;members:string[]}[]=[];
 const row=new Map<string,number>();
 for(const step of steps){
  const ids=[...view.depth].filter(([,d])=>d===step).map(([id])=>id);
  const parents=(id:string)=>forward.filter(line=>line.to===id&&row.has(line.from)).map(line=>row.get(line.from)!);
  const center=(id:string)=>{const rows=parents(id);return rows.length?rows.reduce((sum,r)=>sum+r,0)/rows.length:Infinity;};
  ids.sort((a,b)=>center(a)-center(b)||REACH_ORDER.indexOf(view.reach.get(a)!)-REACH_ORDER.indexOf(view.reach.get(b)!)||name(a).localeCompare(name(b),'zh-Hant')||order(a,b));
  ids.forEach((id,i)=>row.set(id,i));
  columns.push({key:`step-${step}`,label:`第 ${step} 步 · ${ids.length} 個畫面`,members:ids});
 }
 for(const reach of ['UNREACHED','EXCLUDED'] as const){
  const ids=index.screens.filter(s=>view.reach.get(s.id)===reach).map(s=>s.id).sort((a,b)=>name(a).localeCompare(name(b),'zh-Hant')||order(a,b));
  if(ids.length)columns.push({key:reach.toLowerCase(),label:`${reachLabel[reach]} · ${ids.length} 個畫面`,members:ids});
 }
 const positions=new Map<string,Position>(),groups:ScreenGroup[]=[];
 const columnWidth=CARD.width+2*FLOW.pad;
 columns.forEach((column,i)=>{
  const x=FLOW.origin+i*(columnWidth+FLOW.columnGap),y=FLOW.origin;
  column.members.forEach((id,r)=>positions.set(id,{x:x+FLOW.pad,y:y+FLOW.title+r*(CARD.height+FLOW.rowGap)}));
  groups.push({key:column.key,label:column.label,members:column.members,box:{x,y,width:columnWidth,height:FLOW.title+column.members.length*(CARD.height+FLOW.rowGap)}});
 });
 // Each line gets its own vertical track in the gap after its source column, so lines never run on top of each other.
 const routes:RoutedRelation[]=[],perGap=new Map<number,typeof forward>();
 for(const line of forward){const step=view.depth.get(line.from)!;perGap.set(step,[...(perGap.get(step)||[]),line]);}
 for(const [step,lines] of perGap){
  lines.sort((a,b)=>positions.get(a.from)!.y-positions.get(b.from)!.y||positions.get(a.to)!.y-positions.get(b.to)!.y||order(a.from,b.from)||order(a.to,b.to));
  const room=FLOW.columnGap+2*FLOW.pad-32,track=Math.min(FLOW.track,room/Math.max(1,lines.length));
  lines.forEach((line,k)=>{
   const a=positions.get(line.from)!,b=positions.get(line.to)!,ax=a.x+CARD.width,ay=a.y+CARD.height/2,bx=b.x,by=b.y+CARD.height/2;
   const gapStart=FLOW.origin+steps.indexOf(step)*(columnWidth+FLOW.columnGap)+columnWidth-FLOW.pad,mx=Math.round((gapStart+16+k*track+(room-lines.length*track)/2)*10)/10;
   const relation=index.relations.find(r=>r.from===line.from&&r.to===line.to)||{from:line.from,to:line.to,triggers:[],behaviorIds:[]};
   routes.push({relation,points:ay===by?[{x:ax,y:ay},{x:bx,y:by}]:[{x:ax,y:ay},{x:mx,y:ay},{x:mx,y:by},{x:bx,y:by}]});
  });
 }
 const width=Math.max(...groups.map(g=>g.box.x+g.box.width),0)+FLOW.origin,height=Math.max(...groups.map(g=>g.box.y+g.box.height),0)+FLOW.origin;
 return {positions,routes,width,height,groups,links:[],cross:[]};
}
