import {Index} from './map';
import {navigationIdentity,partitionNavigation} from './overview';
import {componentLabel,isAction,kindName} from './labels';
import {Behavior,Node} from './contracts';
import {rootTrigger} from './usage';

export interface ButtonMember {screenId:string;componentId:string}
export interface ButtonRow {key:string;global:boolean;name:string;screenNames:string[];kind:string;action:string;resolution:string;members:ButtonMember[];screenId?:string;componentId?:string}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function actionText(index:Index,id:string):string{
 const node=index.nodes.get(id)!,values:string[]=[];
 const behaviors=(index.graph.behaviors||[]).filter(behavior=>rootTrigger(index,behavior)===id);
 for(const behavior of behaviors){const target=index.nodes.get(behavior.targetId||'');if(target?.type==='SCREEN')values.push(`前往「${target.name}」`);else if(target?.type==='ENDPOINT')values.push(`${behavior.type==='SUBMIT_FORM'?'送出到':'呼叫 API'} ${target.attributes.httpMethod||'ANY'} ${target.attributes.path||target.name}`);else if(behavior.type==='OPEN_DIALOG')values.push('開啟彈窗');else if(behavior.type==='SUBMIT_FORM')values.push('送出表單');else values.push('靜態分析無法確認');}
 for(const edge of (index.graph.relationships||[]).filter(edge=>edge.from===id&&['NAVIGATES_TO','TRIGGERS','CALLS'].includes(edge.type))){const target=index.nodes.get(edge.to);if(target?.type==='SCREEN')values.push(`前往「${target.name}」`);else if(target?.type==='ENDPOINT')values.push(`${edge.type==='CALLS'?'呼叫 API':'送出到'} ${target.attributes.httpMethod||'ANY'} ${target.attributes.path||target.name}`);}
 return [...new Set(values)].join('；')||'沒有已知行為';
}
function resolution(node:Node):string{const values=(node.evidence||[]).map((entry:any)=>entry.resolution);return values.includes('AMBIGUOUS')?'有多個候選':values.includes('UNRESOLVED')?'無法確認':values.includes('INFERRED')||node.confidence==='INFERRED'?'靜態推定':'已確認';}
export function buttonTableRows(index:Index):ButtonRow[]{
 const rows=new Map<string,ButtonRow>(),globalRelations=partitionNavigation(index).global;
 for(const [componentId,screenIds]of index.owners){const node=index.nodes.get(componentId);if(!node||!isAction(index,node))continue;const globalMembership=new Map<string,{target:string;identity:string}>();
  for(const relation of globalRelations)if(relation.triggers.includes(componentId)){const identity=navigationIdentity(index,node,relation.to);if(identity)globalMembership.set(relation.from, {target:relation.to,identity});}
  for(const screenId of screenIds){const membership=globalMembership.get(screenId),key=membership?`global:${membership.identity}`:`item:${JSON.stringify([screenId,componentId])}`,existing=rows.get(key),member={screenId,componentId};if(existing){if(!existing.members.some(item=>item.screenId===screenId&&item.componentId===componentId))existing.members.push(member);continue;}
   const target=membership?index.nodes.get(membership.target):undefined,label=componentLabel(node),name=membership?`（全站導覽）${label} → ${target?.name||'目的未解析'} ×${globalMembership.size} 個畫面`:label;
   rows.set(key,{key,global:!!membership,name,screenNames:[],kind:kindName(node),action:actionText(index,componentId),resolution:resolution(node),members:[member],screenId,componentId});
  }
 }
 return [...rows.values()].map(row=>{const members=row.members.sort((a,b)=>order(a.screenId,b.screenId)||order(a.componentId,b.componentId)),screenNames=[...new Set(members.map(member=>index.nodes.get(member.screenId)?.name||'畫面'))].sort(order);return {...row,members,screenNames,...(row.global?{name:row.name.replace(/ ×\d+ 個畫面$/,` ×${screenNames.length} 個畫面`)}:{})};}).sort((a,b)=>order(a.screenNames[0]||'',b.screenNames[0]||'')||order(a.name,b.name)||order(a.key,b.key));
}
