import {Graph} from './contracts';
import {Index} from './map';

export type PersonaStatus='APPLIES'|'UNKNOWN'|'EXCLUDED';
export type Reach='REACHABLE'|'POSSIBLE'|'UNREACHED'|'EXCLUDED';
export interface PersonaFact {text:string;truth:boolean}
export interface PersonaStep {from:string;to:string;kind:string;behaviorId?:string|null;status:PersonaStatus}
export interface PersonaFlow {entryPoints:string[];reached:{screenId:string;reach:'REACHABLE'|'POSSIBLE';depth:number}[];unreached:string[];steps:PersonaStep[];unevaluatedNavigations:number}
export interface Persona {id:string;name:string;facts:PersonaFact[];startPaths:string[];screens:Record<string,PersonaStatus>;navigations:{behaviorId:string;status:PersonaStatus;targets:string[]}[];flow?:PersonaFlow}
export interface PersonaView {persona:Persona;reach:Map<string,Reach>;depth:Map<string,number>;lines:Map<string,'APPLIES'|'UNKNOWN'>;counts:Record<Reach,number>;unevaluated:number}
export interface FlowGroup {key:string;title:string;reach:Reach;screens:string[]}

export const REACH_ORDER:Reach[]=['REACHABLE','POSSIBLE','UNREACHED','EXCLUDED'];
export const reachLabel:Record<Reach,string>={REACHABLE:'確定可達',POSSIBLE:'可能可達',UNREACHED:'未到達',EXCLUDED:'不適用'};
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
 const reach=new Map<string,Reach>(),depth=new Map<string,number>(),lines=new Map<string,'APPLIES'|'UNKNOWN'>();
 const reached=new Map((persona.flow?.reached||[]).map(r=>[r.screenId,r]));
 for(const screen of index.screens){
  const found=reached.get(screen.id);
  if(found){reach.set(screen.id,found.reach==='REACHABLE'?'REACHABLE':'POSSIBLE');depth.set(screen.id,found.depth);}
  else reach.set(screen.id,persona.screens[screen.id]==='EXCLUDED'?'EXCLUDED':'UNREACHED');
 }
 const isScreen=(id:string)=>index.nodes.get(id)?.type==='SCREEN';
 for(const step of persona.flow?.steps||[]){
  if(!isScreen(step.from)||!isScreen(step.to))continue;
  const key=lineKey(step.from,step.to);
  if(lines.get(key)!=='APPLIES')lines.set(key,step.status==='APPLIES'?'APPLIES':'UNKNOWN');
 }
 const counts:Record<Reach,number>={REACHABLE:0,POSSIBLE:0,UNREACHED:0,EXCLUDED:0};
 for(const value of reach.values())counts[value]++;
 return {persona,reach,depth,lines,counts,unevaluated:persona.flow?.unevaluatedNavigations||0};
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
/** Where a screen sits in one persona's flow, for badges and the comparison table. */
export const reachText=(view:PersonaView,id:string)=>{const value=view.reach.get(id)!,step=view.depth.get(id);return step===undefined?reachLabel[value]:`${reachLabel[value]} · 第 ${step} 步`;};
