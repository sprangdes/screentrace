import {Index} from './map';
import {navigationIdentity,partitionNavigation} from './overview';
import {componentLabel,componentLabelsByScreen,isAction,kindName} from './labels';
import {confidenceLabel} from './terms';
import {Node} from './contracts';
import {rootTrigger} from './usage';

export interface ButtonMember {screenId:string;componentId:string}
export interface ActionSummary {primaryAction:string;possibleResults:string;technicalDetails:string[];multiple:boolean}
export interface ButtonRow {key:string;global:boolean;name:string;screenNames:string[];kind:string;primaryAction:string;possibleResults:string;technicalDetails:string[];multiple:boolean;resolution:string;members:ButtonMember[];screenId?:string;componentId?:string}
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
export function buttonTableRows(index:Index):ButtonRow[]{
 const rows=new Map<string,ButtonRow>(),globalRelations=partitionNavigation(index).global,labels=componentLabelsByScreen(index);
 for(const [componentId,screenIds]of index.owners){const node=index.nodes.get(componentId);if(!node||!isAction(index,node))continue;const globalMembership=new Map<string,{target:string;identity:string}>();
  for(const relation of globalRelations)if(relation.triggers.includes(componentId)){const identity=navigationIdentity(index,node,relation.to);if(identity)globalMembership.set(relation.from, {target:relation.to,identity});}
  for(const screenId of screenIds){const membership=globalMembership.get(screenId),key=membership?`global:${membership.identity}`:`item:${JSON.stringify([screenId,componentId])}`,existing=rows.get(key),member={screenId,componentId};if(existing){if(!existing.members.some(item=>item.screenId===screenId&&item.componentId===componentId))existing.members.push(member);continue;}
   const target=membership?index.nodes.get(membership.target):undefined,displayLabel=labels.get(screenId)?.get(componentId)||'可操作項目（無文字）',label=membership&&displayLabel.startsWith(kindName(node)+'（')?componentLabel(node,{dynamicContent:true,globalNavigation:true}):displayLabel,name=membership?`（全站導覽）${label} → ${target?.name||'目的未解析'} ×${globalMembership.size} 個畫面`:label,summary=actionSummary(index,componentId);
   rows.set(key,{key,global:!!membership,name,screenNames:[],kind:kindName(node),...summary,resolution:resolution(node),members:[member],screenId,componentId});
  }
 }
 return [...rows.values()].map(row=>{const members=row.members.sort((a,b)=>order(a.screenId,b.screenId)||order(a.componentId,b.componentId)),screenNames=[...new Set(members.map(member=>index.nodes.get(member.screenId)?.name||'畫面'))].sort(candidateOrder);return {...row,members,screenNames,...(row.global?{name:row.name.replace(/ ×\d+ 個畫面$/,` ×${screenNames.length} 個畫面`)}:{})};}).sort((a,b)=>candidateOrder(a.screenNames[0]||'',b.screenNames[0]||'')||(kindOrder.get(a.kind)??99)-(kindOrder.get(b.kind)??99)||candidateOrder(a.name,b.name)||order(a.key,b.key));
}
