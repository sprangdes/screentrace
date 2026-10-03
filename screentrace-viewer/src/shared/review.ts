import {Graph,requireGraph} from '../contracts';
import {Library} from './library';
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
 manifest_sha256?:string;component_overrides?:Record<string,Record<string,string>>;orphan_component_overrides?:OverrideRecord[];
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
export function validateReview(value:unknown,graph:Graph,fingerprint:string,library?:Library):ReviewState {
 requireGraph(graph);if(!value||typeof value!=='object')throw Error('無效 review 資料');const data=value as Record<string,unknown>;
 if(data.schemaVersion!=='2.2')throw Error('Review 只接受 schema 2.2');
 if(data.format!=='screentrace-review'||data.version!==1||data.application!==graph.application.name||data.fingerprint!==fingerprint)throw Error('Review 版本／應用／分析指紋不符');
 let result=emptyReview(graph,fingerprint);const dictionary=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Review 決策必須為字典');return v as Record<string,unknown>;};
 for(const [id,decision]of Object.entries(dictionary(data.screenDecisions))){requireDecision(decision);result=setScreen(result,id,decision);}
 for(const [screen,components]of Object.entries(dictionary(data.componentDecisions)))for(const [component,decision]of Object.entries(dictionary(components))){requireDecision(decision);result=setComponent(result,screen,component,decision);}
 if(data.component_overrides!==undefined||data.orphan_component_overrides!==undefined||data.manifest_sha256!==undefined){result={...result,manifest_sha256:data.manifest_sha256 as string,component_overrides:data.component_overrides as Record<string,Record<string,string>>,orphan_component_overrides:data.orphan_component_overrides as OverrideRecord[]};result=partitionOverrides(result,graph,library);}
 return result;
}
export interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
const baseKey=(state:ReviewState)=>`screentrace:review:v1:${encodeURIComponent(state.application)}:${state.fingerprint}`;
export function storageKey(state:ReviewState):string{return baseKey(state)+(state.manifest_sha256?':'+state.manifest_sha256:'');}
export function loadReview(storage:StorageLike|undefined,graph:Graph,fingerprint:string,library?:Library):{state:ReviewState;warning?:string}{const empty=partitionOverrides(emptyReview(graph,fingerprint),graph,library);try{if(!storage)throw Error();const saved=storage.getItem(baseKey(empty)+':library-transfer')||storage.getItem(storageKey(empty));const state=saved?validateReview(JSON.parse(saved),graph,fingerprint,library):empty;return {state,...((state.orphan_component_overrides||[]).length?{warning:'覆寫的來源元件庫或圖 ID 與目前不同，未套用；已保留 orphan'}:{})};}catch{return {state:empty,warning:'暫存不可用或資料不符；仍可使用確認模式'};}}
export function saveReview(storage:StorageLike|undefined,state:ReviewState):string|undefined {try{if(!storage)throw Error();const encoded=JSON.stringify(state);storage.setItem(storageKey(state),encoded);if(state.manifest_sha256||state.orphan_component_overrides?.length)storage.setItem(baseKey(state)+':library-transfer',encoded);}catch{return '暫存失敗；目前決策仍保留在此頁面';}}
export interface OverrideRecord {screenId:string;componentId:string;libraryComponentId:string;manifest_sha256:string}
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const dict=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('覆寫必須為字典');return value as Record<string,unknown>;};
export function overrideRecords(state:ReviewState):OverrideRecord[]{
 const records:OverrideRecord[]=[];
 if(state.manifest_sha256!==undefined&&!hash(state.manifest_sha256))throw Error('manifest_sha256 格式錯誤');
 if(state.component_overrides!==undefined)for(const [screenId,components]of Object.entries(dict(state.component_overrides)))for(const [componentId,id]of Object.entries(dict(components))){if(typeof id!=='string'||!id||!hash(state.manifest_sha256))throw Error('覆寫 ID／manifest_sha256 格式錯誤');records.push({screenId,componentId,libraryComponentId:id,manifest_sha256:state.manifest_sha256});}
 if(state.orphan_component_overrides!==undefined){if(!Array.isArray(state.orphan_component_overrides))throw Error('orphan_component_overrides 必須為陣列');for(const record of state.orphan_component_overrides){if(!record||typeof record!=='object'||Object.keys(record).sort().join(',')!==['componentId','libraryComponentId','manifest_sha256','screenId'].join(',')||!hash(record.manifest_sha256)||[record.screenId,record.componentId,record.libraryComponentId].some(v=>typeof v!=='string'||!v))throw Error('orphan 覆寫欄位／manifest_sha256 格式錯誤');records.push({...record});}}
 const unique=new Map<string,OverrideRecord>();for(const record of records){const key=JSON.stringify([record.screenId,record.componentId,record.manifest_sha256]);const old=unique.get(key);if(old&&old.libraryComponentId!==record.libraryComponentId)throw Error('同來源覆寫衝突');unique.set(key,record);}
 return [...unique.values()].sort((a,b)=>{const x=JSON.stringify([a.screenId,a.componentId,a.manifest_sha256,a.libraryComponentId]),y=JSON.stringify([b.screenId,b.componentId,b.manifest_sha256,b.libraryComponentId]);return x<y?-1:x>y?1:0;});
}
/** One reversible partition boundary shared by localStorage and Markdown. */
export function partitionOverrides(state:ReviewState,graph:Graph,library?:Library):ReviewState {
 const records=overrideRecords(state),index=indexGraph(graph),ids=new Set(library?.manifest.components.map(c=>c.id)||[]),active:Record<string,Record<string,string>>=Object.create(null),orphans:OverrideRecord[]=[];
 if(library&&!hash(library.sha256))throw Error('manifest_sha256 格式錯誤');
 for(const record of records)if(record.manifest_sha256===library?.sha256&&ids.has(record.libraryComponentId)&&index.nodes.get(record.screenId)?.type==='SCREEN'&&index.owners.get(record.componentId)?.includes(record.screenId)){if(!own(active,record.screenId))active[record.screenId]=Object.create(null);active[record.screenId][record.componentId]=record.libraryComponentId;}else orphans.push(record);
 const {manifest_sha256,component_overrides,orphan_component_overrides,...base}=state;
 return {...base,...(library?{manifest_sha256:library.sha256}:{}),...(Object.keys(active).length?{component_overrides:active}:{}),...(orphans.length?{orphan_component_overrides:orphans}:{})};
}
export function setOverride(state:ReviewState,graph:Graph,library:Library,screenId:string,componentId:string,id:string):ReviewState {
 if(screenDecision(state,screenId)!=='KEEP')throw Error('只能覆寫 KEEP 畫面元件');
 const normalized=partitionOverrides(state,graph,library);if(!indexGraph(graph).owners.get(componentId)?.includes(screenId))throw Error('畫面元件 ID 無對應');if(id&&!library.manifest.components.some(c=>c.id===id))throw Error('元件庫 ID 無對應');
 const records=overrideRecords(normalized).filter(r=>!(r.screenId===screenId&&r.componentId===componentId&&r.manifest_sha256===library.sha256));if(id)records.push({screenId,componentId,libraryComponentId:id,manifest_sha256:library.sha256});return partitionOverrides({...normalized,component_overrides:undefined,orphan_component_overrides:records},graph,library);
}
export function effectiveOverride(state:ReviewState,screenId:string,componentId:string):string|undefined {const values=state.component_overrides;if(screenDecision(state,screenId)!=='KEEP'||!values||!own(values,screenId)||!own(values[screenId],componentId))return undefined;return values[screenId][componentId];}
