import {Payload,ElementRecord,Behavior,Evidence,Rule} from './contracts';
export interface Intent {tag:string;href?:string;valid?:boolean;dialogIds?:string[];componentId?:string}
export type SimulationReason='NO_GRAPH_COMPONENT'|'AMBIGUOUS_CANDIDATES'|'ANCHOR_MISSING'|'DYNAMIC_OR_UNRESOLVED_SOURCE'|'OTHER'|'NO_KNOWN_BEHAVIOR'|'BEHAVIOR_AMBIGUOUS'|'DESTINATION_UNRESOLVED'|'UNSUPPORTED_SIMULATION';
export interface Effect {kind:'navigate'|'form'|'dialog'|'api'|'choices'|'unknown'|'external'|'invalid';targetId?:string;label?:string;expression?:string;message?:string;method?:string;path?:string;resolution?:string;evidence?:Evidence[];choices?:Effect[];rules?:Rule[];componentId?:string;simulatable?:boolean;reason?:SimulationReason}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const unknown=(expression?:string,message='靜態分析無法確認這個操作'):Effect=>({kind:'unknown',expression,message});
/** Read only the candidate list emitted by our graph producers, never arbitrary
 * mentions of IDs, URL similarity, selector text or DOM order. */
function candidates(b:Behavior):string[]{const ids=new Set<string>();for(const e of b.evidence||[])for(const match of (e.detail||'').matchAll(/(?:全部)?候選[：=]\[([^\]]*)\]/g))for(const id of match[1].split(',').map(s=>s.trim()).filter(Boolean))ids.add(id);return [...ids].sort();}
function state(b:Behavior):string {const url=(b.evidence||[]).filter(e=>e.parser==='UrlResolution'&&e.detail?.startsWith('原始 URL='));const records=url.length?url:(b.evidence||[]).filter(e=>!(e.parser==='UrlResolution'&&e.detail?.startsWith('來源=')));const states=records.map(e=>e.resolution);return states.includes('AMBIGUOUS')?'AMBIGUOUS':b.targetId&&states.includes('CONFIRMED')?'CONFIRMED':b.targetId&&states.includes('INFERRED')?'INFERRED':'UNRESOLVED';}
function screens(payload:Payload,targetId:string):Effect[]{const nodes=new Map(payload.graph.nodes.map(n=>[n.id,n])),edges=payload.graph.relationships||[],result=new Map<string,Effect>();const visit=(id:string,proof:Evidence[],resolution:string,seen:Set<string>,depth:number)=>{if(seen.has(id))return;const node=nodes.get(id);if(!node){result.set(id,{...unknown(),targetId:id,label:id,resolution:'UNRESOLVED',evidence:proof});return;}if(depth>10||!['CONFIRMED','INFERRED','AMBIGUOUS'].includes(node.confidence)){result.set(id,{...unknown(),targetId:id,label:node.name,resolution:'UNRESOLVED',evidence:proof});return;}if(node.type==='SCREEN'){const key=JSON.stringify([id,resolution,proof]);result.set(key,{kind:'navigate',targetId:id,label:node.name,resolution,evidence:proof});return;}const next=new Set(seen);next.add(id);for(const edge of edges.filter(e=>e.from===id&&['HANDLED_BY','RENDERS','FORWARDS_TO','NAVIGATES_TO'].includes(e.type))){const evidence=(edge as any).evidence||[];if(!['CONFIRMED','INFERRED','AMBIGUOUS'].includes(edge.confidence)){const target=nodes.get(edge.to);result.set(edge.id,{...unknown(),targetId:edge.to,label:target?.name||edge.to,resolution:'UNRESOLVED',evidence:[...proof,...evidence]});continue;}visit(edge.to,[...proof,...evidence],edge.confidence==='AMBIGUOUS'?'AMBIGUOUS':resolution==='AMBIGUOUS'?resolution:edge.confidence==='INFERRED'?'INFERRED':resolution,next,depth+1);}};visit(targetId,[],nodes.get(targetId)?.confidence||'CONFIRMED',new Set(),0);return [...result.values()].sort((a,b)=>compare(a.targetId||'',b.targetId||'')||compare(JSON.stringify(a),JSON.stringify(b)));}
function serverRules(payload:Payload,endpoint:string):Rule[]{return(payload.graph.validationRules||[]).filter(r=>{if(r.layer!=='SERVER')return false;try{const ids=JSON.parse(r.parameters?.endpointIds||'[]');return Array.isArray(ids)&&ids.includes(endpoint);}catch{return false;}});}
function effect(payload:Payload,b:Behavior,targetId:string,intent:Intent,resolution:string):Effect {
 const node=payload.graph.nodes.find(n=>n.id===targetId);if(!node||!['CONFIRMED','INFERRED','AMBIGUOUS'].includes(node.confidence))return {...unknown(b.expression,b.type==='OPEN_DIALOG'?'彈窗內容無法從靜態分析重建':undefined),targetId,label:node?.name||targetId,evidence:b.evidence,resolution:'UNRESOLVED',reason:'DESTINATION_UNRESOLVED'};
 if(b.type==='CALL_API')return node.type==='ENDPOINT'?{kind:'api',targetId,label:node.name,method:node.attributes.httpMethod||'ANY',path:node.attributes.path||node.attributes.route||node.name,resolution,evidence:b.evidence}:unknown(b.expression);
 if(b.type==='OPEN_DIALOG')return node.type==='COMPONENT'&&node.attributes.kind==='MODAL'&&intent.dialogIds?.includes(targetId)?{kind:'dialog',targetId,label:node.name,resolution,evidence:b.evidence}:unknown(b.expression,'彈窗內容無法從靜態分析重建');
 if(!['NAVIGATE','SUBMIT_FORM'].includes(b.type))return unknown(b.expression,'這個操作的結果取決於頁面腳本，靜態分析無法確認');
 const outcomes=screens(payload,targetId);if(!outcomes.length)return {...unknown(b.expression),targetId,label:node.name,evidence:b.evidence,resolution,reason:'DESTINATION_UNRESOLVED'};for(const item of outcomes){item.resolution=item.resolution==='CONFIRMED'?resolution:item.resolution;item.evidence=[...(b.evidence||[]),...(item.evidence||[])];}
 if(b.type==='SUBMIT_FORM')return{kind:'form',targetId,label:node.name,method:node.attributes.httpMethod||'ANY',path:node.attributes.path||node.attributes.route||node.name,resolution,evidence:b.evidence,choices:outcomes,rules:serverRules(payload,targetId)};
 return outcomes.length===1&&(outcomes[0].resolution!=='AMBIGUOUS'||resolution==='AMBIGUOUS'&&node.type==='SCREEN')?outcomes[0]:{kind:'choices',choices:outcomes,expression:b.expression,message:'有多個可能目的，請選擇；系統不會替你決定'};
}
/** Same bounded callback-root and event selection used by simulation and explanation. */
function componentBehaviors(payload:Payload,component:string):Behavior[]{
 const byId=new Map((payload.graph.behaviors||[]).map(b=>[b.id,b]));const root=(b:Behavior)=>{let cursor=b;const seen=new Set<string>();for(let depth=0;!cursor.triggerId&&cursor.parentId&&depth<10;depth++){if(seen.has(cursor.id))return undefined;seen.add(cursor.id);const parent=byId.get(cursor.parentId);if(!parent)return undefined;cursor=parent;}return cursor.triggerId;};

 return (payload.graph.behaviors||[]).filter(b=>root(b)===component);
}
function applicable(b:Behavior,intent:Intent):boolean{return !b.event||!!b.parentId||(intent.tag==='form'?b.event==='submit'||b.type==='SUBMIT_FORM'&&b.event==='click':['click','change'].includes(b.event));}
function simulateRaw(payload:Payload,screenId:string,record:Partial<ElementRecord>|undefined,intent:Intent):Effect {
 if(intent.tag==='a'&&/^(https?:)?\/\//i.test((intent.href||'').trim()))return{kind:'external',message:'外部連結（不會開啟）'};
 if(intent.tag==='a'&&/^javascript:/i.test((intent.href||'').replace(/[\u0000-\u0020]/g,'')))return unknown(intent.href);
 if(intent.tag==='form'&&intent.valid===false)return{kind:'invalid',message:'原生檢核未通過，請完成必填欄位與格式'};
 if(!record||record.componentResolution==='UNRESOLVED')return {...unknown(),reason:record?.unmappedReason||(record?.componentResolution==='UNRESOLVED'?'DYNAMIC_OR_UNRESOLVED_SOURCE':'NO_GRAPH_COMPONENT')};
 if(record.componentResolution==='AMBIGUOUS'&&!intent.componentId){const choices=(record.graphComponentCandidates||[]).map(componentId=>{const resolved=simulateRaw(payload,screenId,record,{...intent,componentId});resolved.componentId=componentId;return resolved;});return{kind:'choices',message:'元素有多個圖元件候選，請選擇；靜態分析無法確認唯一對應',reason:'AMBIGUOUS_CANDIDATES',choices};}
 const component=intent.componentId||record.graphComponentId;if(!component||intent.componentId&&!record.graphComponentCandidates?.includes(component))return {...unknown(),reason:'NO_GRAPH_COMPONENT'};
 if(!(payload.graph.relationships||[]).some(e=>e.type==='CONTAINS'&&e.from===screenId&&e.to===component))return {...unknown(),reason:'NO_GRAPH_COMPONENT'};
 const all=componentBehaviors(payload,component),behaviors=all.filter(b=>applicable(b,intent));const effects:Effect[]=[];
 for(const b of behaviors){const resolution=state(b);if(resolution==='AMBIGUOUS'){const ids=candidates(b);effects.push({kind:'choices',message:'有多個候選，請選擇；系統不會替你決定',expression:b.expression,evidence:b.evidence,reason:'BEHAVIOR_AMBIGUOUS',choices:ids.map(id=>effect(payload,b,id,intent,'AMBIGUOUS'))});}else if(['CONFIRMED','INFERRED'].includes(resolution)&&b.targetId){const resolved=effect(payload,b,b.targetId,intent,resolution);effects.push(b.guard||b.condition?{kind:'choices',message:`條件尚未求值，請選擇可能結果：${b.guard||b.condition}`,expression:b.expression,choices:[resolved],evidence:b.evidence}:resolved);}else effects.push({...unknown(b.expression,b.type==='OPEN_DIALOG'?'彈窗內容無法從靜態分析重建':undefined),reason:'DESTINATION_UNRESOLVED'});}
 if(!effects.length)return {...unknown(),reason:all.some(b=>state(b)==='AMBIGUOUS')?'BEHAVIOR_AMBIGUOUS':all.length?'UNSUPPORTED_SIMULATION':'NO_KNOWN_BEHAVIOR'};return effects.length===1?effects[0]:{kind:'choices',message:'此元素有多個靜態行為，請選擇要檢視的操作',choices:effects};
}
function finalize(effect:Effect):Effect{if(effect.choices)effect.choices=effect.choices.map(finalize);effect.simulatable=['navigate','dialog','api'].includes(effect.kind)||['form','choices'].includes(effect.kind)&&!!effect.choices?.some(choice=>choice.simulatable);if(!effect.simulatable&&!effect.reason)effect.reason=effect.choices?.find(choice=>choice.reason)?.reason;return effect;}
/** The sole simulation entry point returns the action and its coverage result together. */
export function simulate(payload:Payload,screenId:string,record:Partial<ElementRecord>|undefined,intent:Intent):Effect{return finalize(simulateRaw(payload,screenId,record,intent));}
/** Compatibility view of the outcome produced by simulate; contains no separate policy. */
export function canSimulate(effect:Effect):boolean{return effect.simulatable===true;}

export type UnmappedReason='NO_GRAPH_COMPONENT'|'AMBIGUOUS_CANDIDATES'|'ANCHOR_MISSING'|'DYNAMIC_OR_UNRESOLVED_SOURCE'|'OTHER';
export const simulationReasons:SimulationReason[]=['NO_GRAPH_COMPONENT','AMBIGUOUS_CANDIDATES','ANCHOR_MISSING','DYNAMIC_OR_UNRESOLVED_SOURCE','OTHER','NO_KNOWN_BEHAVIOR','BEHAVIOR_AMBIGUOUS','DESTINATION_UNRESOLVED','UNSUPPORTED_SIMULATION'];
export function simulationReasonText(reason:SimulationReason):string{return {
 NO_GRAPH_COMPONENT:'分析器未建立元件：這個元素沒有可對應的圖元件',
 AMBIGUOUS_CANDIDATES:'元件有多個候選：靜態分析無法確認唯一對應',
 ANCHOR_MISSING:'展開位置不完整：預覽與分析器的標記位置無法對照',
 DYNAMIC_OR_UNRESOLVED_SOURCE:'來源無法靜態確認：這個元素的來源尚未解析',
 OTHER:'配對原因尚未確認：需要分析人員協助',
 NO_KNOWN_BEHAVIOR:'沒有已知的行為：這個元素沒有被分析到會觸發的動作（可能由頁面腳本控制）',
 BEHAVIOR_AMBIGUOUS:'已記錄行為但無法確認結果：行為有歧義，無法證明此元素可模擬的結果',
 DESTINATION_UNRESOLVED:'已記錄行為但無法確認結果：行為目的未解析，沒有可證明的目的畫面或操作結果',
 UNSUPPORTED_SIMULATION:'已記錄行為但無法確認結果：行為類型或觸發事件不支援模擬'
 }[reason];}
/** Classification is a projection of the result returned by the single simulation entry point. */
export function assessSimulation(payload:Payload,screenId:string,record:Partial<ElementRecord>|undefined,intent:Intent):{effect:Effect;possible:boolean;reason?:SimulationReason}{
 const result=simulate(payload,screenId,record,intent);return{effect:result,possible:result.simulatable===true,reason:result.simulatable?undefined:result.reason||'UNSUPPORTED_SIMULATION'};
}
