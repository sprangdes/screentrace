import {Index} from './map';
import {focusedRelations} from './relations';
import {partitionNavigation} from './overview';
import {componentLabelsForScreen} from './labels';
import {element} from './text';

export interface FlowOutlineNode {id:string;label:string;triggers:string[];children:FlowOutlineNode[];alreadyExpanded:boolean;unresolved:boolean;canNavigate:boolean;more:number;overflow:FlowOutlineNode[]}
export interface FlowOutline {root:string;rootLabel:string;depth:number;nodes:FlowOutlineNode[];more:number;overflow:FlowOutlineNode[]}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
const internalName=(value:string|undefined,id:string)=>!value||value===id||/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+(?:\.[a-z0-9]+)?$/.test(value)||/^(?:表單|連結|按鈕|下拉選單|核取方塊|單選欄位|文字欄位|文字區域)\s*\d+$/.test(value);
export const publicTriggerName=(value:string)=>{if(!internalName(value,''))return value;const type=/^(表單|連結|按鈕|下拉選單|核取方塊|單選欄位|文字欄位|文字區域)\s*\d+$/.exec(value);return type?`${type[1]}（所在畫面）`:'可操作項目（所在畫面）';};


/** Stable, bounded tree of evidence-backed non-global navigation. Each destination is expanded once. */
export function buildFlowOutline(index:Index,root:string,maxDepth=4,maxWidth=8):FlowOutline {
 const flows=partitionNavigation(index).flows,capDepth=Math.max(0,Math.min(4,Math.floor(maxDepth))),capWidth=Math.max(1,Math.min(8,Math.floor(maxWidth)));
 const screenLabel=(id:string)=>index.nodes.get(id)?.name||'無法確認的目的';
 const nameTriggers=(ids:string[],screenId:string)=>{const labels=componentLabelsForScreen(index,screenId);return [...new Set(ids)].map(id=>labels.get(id)||'可操作項目（無文字）').sort(order);};
 const expanded=new Set<string>([root]);
 const make=(screenId:string,depth:number):{nodes:FlowOutlineNode[];more:number;overflow:FlowOutlineNode[]}=>{
  if(depth>=capDepth)return {nodes:[],more:0,overflow:[]};
  const known=flows.filter(relation=>relation.from===screenId).map(relation=>({id:relation.to,label:screenLabel(relation.to),triggers:nameTriggers(relation.triggers,screenId),unresolved:false}));
  const unknown=focusedRelations(index,screenId).filter(relation=>relation.unresolved);
  const rows=[...known];if(unknown.length)rows.push({id:`unresolved:${screenId}`,label:'無法確認的目的',triggers:nameTriggers(unknown.flatMap(relation=>relation.triggers),screenId),unresolved:true});
  rows.sort((a,b)=>order(a.label,b.label)||order(a.id,b.id)||order(a.triggers.join('\0'),b.triggers.join('\0')));
  const build=(row:typeof rows[number]):FlowOutlineNode=>{
   if(row.unresolved)return {id:row.id,label:row.label,triggers:row.triggers,children:[],alreadyExpanded:false,unresolved:true,canNavigate:false,more:0,overflow:[]};
   const alreadyExpanded=expanded.has(row.id);if(!alreadyExpanded)expanded.add(row.id);
   const nested=!alreadyExpanded?make(row.id,depth+1):{nodes:[],more:0,overflow:[]};
   return {id:row.id,label:alreadyExpanded?`${row.label}（已在上面展開）`:row.label,triggers:row.triggers,children:nested.nodes,alreadyExpanded,unresolved:false,canNavigate:true,more:nested.more,overflow:nested.overflow};
  };
  const all=rows.map(build);return {nodes:all.slice(0,capWidth),more:Math.max(0,rows.length-capWidth),overflow:all.slice(capWidth)};
 };
 const result=make(root,0);return {root,rootLabel:screenLabel(root),depth:capDepth,nodes:result.nodes,more:result.more,overflow:result.overflow};
}

export function flowOutlineView(index:Index,root:string,onNavigate:(screenId:string)=>void):HTMLElement {
 const section=element('details',undefined,'flow-outline');section.dataset.flowOutline='true';const summary=element('summary','從這裡出發');section.append(summary);let built=false;
 section.addEventListener('toggle',()=>{if(!section.open||built)return;built=true;const outline=buildFlowOutline(index,root),tree=element('ol',undefined,'flow-outline-tree'),rootNode=element('li',undefined,'flow-outline-root');rootNode.dataset.flowRoot=outline.root;rootNode.append(element('strong',outline.rootLabel));const children=element('ol',undefined,'flow-outline-list');
  const append=(parent:HTMLOListElement,node:FlowOutlineNode)=>{const row=element('li',undefined,'flow-outline-node');row.dataset.flowNode=node.id;if(node.unresolved)row.dataset.unresolved='true';if(node.alreadyExpanded)row.dataset.alreadyExpanded='true';const action=element('button',node.label,'flow-outline-link');action.disabled=!node.canNavigate;if(node.canNavigate)action.onclick=()=>onNavigate(node.id);row.append(action);if(node.triggers.length)row.append(element('span',`由「${node.triggers.map(publicTriggerName).join('、')}」前往`,'flow-outline-triggers'));if(node.children.length){const nested=element('ol');for(const child of node.children)append(nested,child);row.append(nested);}if(node.more){const more=element('details',undefined,'flow-outline-more');more.append(element('summary',`還有 ${node.more} 個`));const rest=element('ol');for(const child of node.overflow)append(rest,child);more.append(rest);row.append(more);}parent.append(row);};
  for(const node of outline.nodes)append(children,node);if(outline.more){const more=element('details',undefined,'flow-outline-more');more.append(element('summary',`還有 ${outline.more} 個`));const rest=element('ol');for(const node of outline.overflow)append(rest,node);more.append(rest);children.append(more);}if(!outline.nodes.length)children.append(element('li','沒有已知流程'));rootNode.append(children);tree.append(rootNode);section.append(tree);
 });return section;
}
