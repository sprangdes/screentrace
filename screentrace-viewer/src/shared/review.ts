import {Graph,requireGraph} from '../contracts';
import {indexGraph} from '../map';
import {callSources,Caller,rootTrigger} from '../usage';
export const decisions=['UNDECIDED','KEEP','REMOVE'] as const;
export type Decision=typeof decisions[number];
export type EffectiveDecision=Decision|'INHERITED_REMOVE';
/** WP8 reuses this versioned, framework-neutral browser/Node contract. */
export interface ReviewState {
 format:'screentrace-review';version:1;schemaVersion:'2.2';application:string;fingerprint:string;
 screenDecisions:Record<string,Decision>;
 componentDecisions:Record<string,Record<string,Decision>>;
}
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
export function emptyReview(graph:Graph,fingerprint:string):ReviewState {
 requireGraph(graph);return {format:'screentrace-review',version:1,schemaVersion:'2.2',application:graph.application.name,fingerprint,screenDecisions:{},componentDecisions:{}};
}
export function screenDecision(state:ReviewState,id:string):Decision {return own(state.screenDecisions,id)?state.screenDecisions[id]:'UNDECIDED';}
export function componentDecision(state:ReviewState,screen:string,component:string):Decision {const values=own(state.componentDecisions,screen)?state.componentDecisions[screen]:{};return own(values,component)?values[component]:'UNDECIDED';}
function requireDecision(value:unknown):asserts value is Decision {if(!decisions.includes(value as Decision))throw Error('無效確認狀態');}
export function setScreen(state:ReviewState,id:string,decision:Decision):ReviewState {requireDecision(decision);return {...state,screenDecisions:{...state.screenDecisions,[id]:decision}};}
export function setComponent(state:ReviewState,screen:string,component:string,decision:Decision):ReviewState {requireDecision(decision);const current=own(state.componentDecisions,screen)?state.componentDecisions[screen]:{};return {...state,componentDecisions:{...state.componentDecisions,[screen]:{...current,[component]:decision}}};}
export function effectiveComponent(state:ReviewState,screen:string,component:string):EffectiveDecision {return screenDecision(state,screen)==='REMOVE'?'INHERITED_REMOVE':componentDecision(state,screen,component);}
export function markableComponents(graph:Graph):{screenId:string;componentId:string}[] {
 const index=indexGraph(graph),triggers=new Set((graph.behaviors||[]).map(b=>rootTrigger(index,b)).filter(Boolean));
 for(const edge of graph.relationships||[])if(['CALLS','TRIGGERS','NAVIGATES_TO'].includes(edge.type))triggers.add(edge.from);
 const result:{screenId:string;componentId:string}[]=[];
 for(const [componentId,owners]of index.owners)if(['BUTTON','LINK','SUBMIT'].includes(index.nodes.get(componentId)?.attributes.kind||'')||triggers.has(componentId))for(const screenId of owners)result.push({screenId,componentId});
 return result.sort((a,b)=>a.screenId<b.screenId?-1:a.screenId>b.screenId?1:a.componentId<b.componentId?-1:a.componentId>b.componentId?1:0);
}
export function statistics(graph:Graph,state:ReviewState){const screens={UNDECIDED:0,KEEP:0,REMOVE:0},components={UNDECIDED:0,KEEP:0,REMOVE:0};let inherited=0;for(const n of requireGraph(graph).nodes)if(n.type==='SCREEN')screens[screenDecision(state,n.id)]++;for(const key of markableComponents(graph)){components[componentDecision(state,key.screenId,key.componentId)]++;if(screenDecision(state,key.screenId)==='REMOVE')inherited++;}return {screens,components,inherited};}
export function conflicts(graph:Graph,state:ReviewState):{screenId:string;componentId:string;targetScreenId:string}[]{const index=indexGraph(graph),result:{screenId:string;componentId:string;targetScreenId:string}[]=[];for(const r of index.relations)if(screenDecision(state,r.to)==='REMOVE')for(const component of r.triggers)if(componentDecision(state,r.from,component)==='KEEP')result.push({screenId:r.from,componentId:component,targetScreenId:r.to});return result;}
export interface Usage {status:'IN_USE'|'REMOVABLE'|'UNREFERENCED';callers:Caller[]}
export function deriveApiUsage(graph:Graph,state:ReviewState):Map<string,Usage>{const result=new Map<string,Usage>();for(const [id,callers]of callSources(graph)){const removed=callers.length>0&&callers.every(c=>screenDecision(state,c.screenId)==='REMOVE'||!!c.componentId&&componentDecision(state,c.screenId,c.componentId)==='REMOVE');result.set(id,{status:!callers.length?'UNREFERENCED':removed?'REMOVABLE':'IN_USE',callers});}return result;}
export function validateReview(value:unknown,graph:Graph,fingerprint:string):ReviewState {
 requireGraph(graph);if(!value||typeof value!=='object')throw Error('無效 review 資料');const data=value as Record<string,unknown>;
 if(data.schemaVersion!=='2.2')throw Error('Review 只接受 schema 2.2');
 if(data.format!=='screentrace-review'||data.version!==1||data.application!==graph.application.name||data.fingerprint!==fingerprint)throw Error('Review 版本／應用／分析指紋不符');
 let result=emptyReview(graph,fingerprint);const dictionary=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Review 決策必須為字典');return v as Record<string,unknown>;};
 for(const [id,decision]of Object.entries(dictionary(data.screenDecisions))){requireDecision(decision);result=setScreen(result,id,decision);}
 for(const [screen,components]of Object.entries(dictionary(data.componentDecisions)))for(const [component,decision]of Object.entries(dictionary(components))){requireDecision(decision);result=setComponent(result,screen,component,decision);}
 return result;
}
export interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
export function storageKey(state:ReviewState):string{return `screentrace:review:v1:${encodeURIComponent(state.application)}:${state.fingerprint}`;}
export function loadReview(storage:StorageLike|undefined,graph:Graph,fingerprint:string):{state:ReviewState;warning?:string}{const empty=emptyReview(graph,fingerprint);try{if(!storage)throw Error();const saved=storage.getItem(storageKey(empty));return {state:saved?validateReview(JSON.parse(saved),graph,fingerprint):empty};}catch{return {state:empty,warning:'暫存不可用或資料不符；仍可使用確認模式'};}}
export function saveReview(storage:StorageLike|undefined,state:ReviewState):string|undefined {try{if(!storage)throw Error();storage.setItem(storageKey(state),JSON.stringify(state));}catch{return '暫存失敗；目前決策仍保留在此頁面';}}
