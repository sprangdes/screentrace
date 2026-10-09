import {Index} from './map';
import {navigationIdentity,partitionNavigation} from './overview';
import {componentLabel,componentLabelsByScreen,isAction,kindName} from './labels';
import {confidenceLabel} from './terms';
import {Node} from './contracts';
import {rootTrigger} from './usage';

export interface ButtonMember {screenId:string;componentId:string}
export interface ActionSummary {primaryAction:string;possibleResults:string;technicalDetails:string[];multiple:boolean}
export interface ButtonRow {key:string;global:boolean;name:string;screenNames:string[];kind:string;primaryAction:string;possibleResults:string;technicalDetails:string[];multiple:boolean;resolution:string;members:ButtonMember[];behaviorDifferent:boolean;markable:boolean;variants?:ButtonRow[];screenId?:string;componentId?:string}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
const candidateOrder=(a:string,b:string)=>order(a.toLowerCase(),b.toLowerCase())||order(a,b);
function submitLike(node:Node):boolean{return ['SUBMIT','FORM_SUBMIT'].includes(String(node.attributes.kind||'').toUpperCase())||/表單送出/.test(kindName(node));}
export function actionSummary(index:Index,id:string):ActionSummary {
 const node=index.nodes.get(id)!,screens=new Set<string>(),routes=new Set<string>(),otherActions=new Set<string>(),behaviors=(index.graph.behaviors||[]).filter(behavior=>rootTrigger(index,behavior)===id);
 const record=(targetId?:string,type?:string)=>{const target=targetId?index.nodes.get(targetId):undefined;if(target?.type==='SCREEN')screens.add(target.name);else if(target?.type==='ENDPOINT')routes.add(`${target.attributes.httpMethod||'ANY'} ${target.attributes.path||target.name}`);else if(type==='OPEN_DIALOG')otherActions.add('開啟彈窗');else if(type==='UI_STATE_CHANGE')otherActions.add('變更畫面狀態');};
 for(const behavior of behaviors)record(behavior.targetId,behavior.type);
 for(const edge of (index.graph.relationships||[]).filter(edge=>edge.from===id&&['NAVIGATES_TO','TRIGGERS','CALLS'].includes(edge.type)))record(edge.to,edge.type);
 const targets=[...screens].sort(candidateOrder),sortedRoutes=[...routes].sort(candidateOrder),isLink=String(node.attributes.kind||'').toUpperCase()==='LINK'||String(node.attributes.tag||'').toLowerCase()==='a';
 let primaryAction='靜態分析無法確認';
 if(isLink){primaryAction=targets.length===1?`前往「${targets[0]}」`:targets.length>1?'前往「候選畫面」':'前往「目的未解析」';}
 else if(submitLike(node))primaryAction='送出表單';
 else if(otherActions.size)primaryAction=[...otherActions].sort(candidateOrder)[0];
 else if(targets.length===1)primaryAction=`前往「${targets[0]}」`;
 else if(targets.length>1)primaryAction='前往「候選畫面」';
 else if(routes.size)primaryAction='已記錄服務';
 const multiple=targets.length>1||(!targets.length&&sortedRoutes.length>1)||otherActions.size>1;
 const possibleResults=targets.length?`可能前往：${targets.join('、')}${multiple?'；有多個可能結果':''}`:sortedRoutes.length?`可能前往：靜態分析無法確認${multiple?'；有多個可能結果':''}`:otherActions.size?[...otherActions].sort(candidateOrder).join('、'):'沒有已知行為';
 return {primaryAction,possibleResults,technicalDetails:sortedRoutes.map(route=>`伺服端路由：${route}`),multiple};
}
function resolution(node:Node):string{const values=(node.evidence||[]).map((entry:any)=>entry.resolution);return confidenceLabel(values.includes('AMBIGUOUS')?'AMBIGUOUS':values.includes('UNRESOLVED')?'UNRESOLVED':values.includes('INFERRED')||node.confidence==='INFERRED'?'INFERRED':'CONFIRMED');}
const kindOrder=new Map(['表單送出','按鈕','連結','下拉選單','多選欄位','日期欄位','彈窗'].map((kind,index)=>[kind,index]));
function actionSignature(index:Index,componentId:string):string {
 const node=index.nodes.get(componentId)!;const screens=new Set<string>(),endpoints=new Set<string>(),unresolved=new Set<string>();
 const record=(targetId?:string)=>{const target=targetId?index.nodes.get(targetId):undefined;if(target?.type==='SCREEN')screens.add(target.id);else if(target?.type==='ENDPOINT')endpoints.add(target.id);};
 for(const behavior of index.graph.behaviors||[])if(rootTrigger(index,behavior)===componentId){if(behavior.targetId)record(behavior.targetId);else if(behavior.expression)unresolved.add(String(behavior.expression).trim().replace(/\$\{([^}]+)\}/g,'{$1}'));}
 for(const edge of (index.graph.relationships||[]).filter(edge=>edge.from===componentId&&['NAVIGATES_TO','TRIGGERS','CALLS'].includes(edge.type)))record(edge.to);
 const raw=String(node.attributes.target||node.attributes.href||node.attributes.originalExpression||'').trim();if(!screens.size&&!endpoints.size&&!unresolved.size&&raw)unresolved.add(raw.replace(/\$\{([^}]+)\}/g,'{$1}').replace(/[ \t]+/g,''));
 const destinations=[...screens].sort(order).map(id=>`screen:${id}`).concat([...endpoints].sort(order).map(id=>`endpoint:${id}`),[...unresolved].sort(order).map(value=>`template:${value}`));
 return JSON.stringify([String(node.attributes.kind||node.attributes.componentType||node.attributes.tag||'OTHER').toUpperCase(),destinations.length?destinations:['no-action']]);
}
export function buttonTableRows(index:Index,merge=true):ButtonRow[]{
 const labels=componentLabelsByScreen(index),byName=new Map<string,ButtonRow[]>();
 for(const [componentId,screenIds]of index.owners){const node=index.nodes.get(componentId);if(!node||!isAction(index,node))continue;for(const screenId of screenIds){const name=labels.get(screenId)?.get(componentId)||'可操作項目（無文字）',summary=actionSummary(index,componentId),member={screenId,componentId},row:ButtonRow={key:`item:${JSON.stringify([screenId,componentId])}`,global:false,name,screenNames:[index.nodes.get(screenId)?.name||'畫面'],kind:kindName(node),...summary,resolution:resolution(node),members:[member],behaviorDifferent:false,markable:true,screenId,componentId};const rows=byName.get(name)||[];rows.push(row);byName.set(name,rows);}}
 if(!merge)return [...byName.values()].flat().sort((a,b)=>candidateOrder(a.screenNames[0]||'',b.screenNames[0]||'')||(kindOrder.get(a.kind)??99)-(kindOrder.get(b.kind)??99)||candidateOrder(a.name,b.name)||order(a.key,b.key));
 const result:ButtonRow[]=[];
 for(const [name,rows]of byName){const variants=new Map<string,ButtonRow[]>();for(const row of rows){const signature=actionSignature(index,row.members[0].componentId),items=variants.get(signature)||[];items.push(row);variants.set(signature,items);}if(variants.size>1){const members=rows.flatMap(row=>row.members).sort((a,b)=>order(a.screenId,b.screenId)||order(a.componentId,b.componentId)),screens=[...new Set(members.map(member=>index.nodes.get(member.screenId)?.name||'畫面'))].sort(candidateOrder),allKinds=[...new Set(rows.map(row=>row.kind))].sort(candidateOrder);result.push({key:`global-different:${name}`,global:true,name:`${name} · ${screens.length} 個畫面 · 行為不同`,screenNames:screens,kind:allKinds.length===1?allKinds[0]:'多種類型',primaryAction:'行為不同',possibleResults:'展開後逐一確認各畫面的可能結果',technicalDetails:[],multiple:true,resolution:'多種',members,behaviorDifferent:true,markable:false,variants:[...variants.values()].map(group=>mergeIdentical(group,name))});}else result.push(mergeIdentical(rows,name));}
 return result.sort((a,b)=>candidateOrder(a.screenNames[0]||'',b.screenNames[0]||'')||(kindOrder.get(a.kind)??99)-(kindOrder.get(b.kind)??99)||candidateOrder(a.name,b.name)||order(a.key,b.key));
}
function mergeIdentical(rows:ButtonRow[],label:string):ButtonRow {const ordered=rows.sort((a,b)=>order(a.members[0].screenId,b.members[0].screenId)||order(a.members[0].componentId,b.members[0].componentId)),members=ordered.flatMap(row=>row.members),screenNames=[...new Set(ordered.flatMap(row=>row.screenNames))].sort(candidateOrder),base=ordered[0];return {...base,key:`${members.length>1?'global':'item'}:${JSON.stringify([label,ordered.map(row=>row.key).sort(order)])}`,global:members.length>1,name:members.length>1?`${label} · 出現在 ${screenNames.length} 個畫面`:label,screenNames,members,behaviorDifferent:false,markable:true};}
