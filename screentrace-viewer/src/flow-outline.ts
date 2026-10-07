import {Index} from './map';
import {focusedRelations} from './relations';
import {partitionNavigation} from './overview';
import {element} from './text';

export interface FlowOutlineNode {id:string;label:string;triggers:string[];children:FlowOutlineNode[];cycle:boolean;unresolved:boolean;more:number;overflow:FlowOutlineNode[]}
export interface FlowOutline {root:string;depth:number;nodes:FlowOutlineNode[];more:number;overflow:FlowOutlineNode[]}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Stable, bounded tree of evidence-backed non-global navigation from a screen. */
export function buildFlowOutline(index:Index,root:string,maxDepth=4,maxWidth=8):FlowOutline {
 const flows=partitionNavigation(index).flows,capDepth=Math.max(0,Math.min(4,Math.floor(maxDepth))),capWidth=Math.max(1,Math.min(8,Math.floor(maxWidth)));
 const label=(id:string)=>index.nodes.get(id)?.name||'無法確認的目的';
 const make=(screenId:string,depth:number,path:Set<string>):{nodes:FlowOutlineNode[];more:number;overflow:FlowOutlineNode[]}=>{
  if(depth>=capDepth)return {nodes:[],more:0,overflow:[]};
  const known=flows.filter(relation=>relation.from===screenId).sort((a,b)=>order(label(a.to),label(b.to))||order(a.to,b.to));
  const unknown=focusedRelations(index,screenId).filter(relation=>relation.unresolved);
  const rows=[...known.map(relation=>({id:relation.to,label:label(relation.to),triggers:relation.triggers.map(label).sort(order),unresolved:false})),...unknown.map(relation=>({id:relation.to,label:'無法確認的目的',triggers:relation.triggers.map(label).sort(order),unresolved:true}))].sort((a,b)=>order(a.label,b.label)||order(a.id,b.id)||order(a.triggers.join('\0'),b.triggers.join('\0')));
  const build=(row:typeof rows[number]):FlowOutlineNode=>{const cycle=!row.unresolved&&path.has(row.id),childPath=new Set(path);childPath.add(row.id);const nested=!row.unresolved&&!cycle?make(row.id,depth+1,childPath):{nodes:[],more:0,overflow:[]};return {id:row.id,label:cycle?`${row.label}（回到已出現的畫面）`:row.label,triggers:row.triggers,children:nested.nodes,cycle,unresolved:row.unresolved,more:nested.more,overflow:nested.overflow};};
  const all=rows.map(build);return {nodes:all.slice(0,capWidth),more:Math.max(0,rows.length-capWidth),overflow:all.slice(capWidth)};
 };
 const result=make(root,0,new Set([root]));return {root,depth:capDepth,nodes:result.nodes,more:result.more,overflow:result.overflow};
}

export function flowOutlineView(index:Index,root:string,onNavigate:(screenId:string)=>void):HTMLElement {
 const outline=buildFlowOutline(index,root),section=element('details',undefined,'flow-outline');section.dataset.flowOutline='true';const summary=element('summary','從這裡出發');section.append(summary);
 const list=element('ol',undefined,'flow-outline-list');
 const append=(parent:HTMLOListElement,node:FlowOutlineNode)=>{const row=element('li',undefined,'flow-outline-node');row.dataset.flowNode=node.id;const action=element('button',node.label,'flow-outline-link');action.disabled=node.unresolved||node.cycle;if(!action.disabled)action.onclick=()=>onNavigate(node.id);row.append(action);if(node.triggers.length)row.append(element('span',`—[${node.triggers.join('、')}]→`,'flow-outline-triggers'));if(node.children.length){const children=element('ol');for(const child of node.children)append(children,child);row.append(children);}if(node.more){const more=element('details',undefined,'flow-outline-more');more.append(element('summary',`還有 ${node.more} 個`));const rest=element('ol');for(const child of node.overflow)append(rest,child);more.append(rest);row.append(more);}parent.append(row);};
 for(const node of outline.nodes)append(list,node);if(outline.more){const more=element('details',undefined,'flow-outline-more');more.append(element('summary',`還有 ${outline.more} 個`));const rest=element('ol');for(const node of outline.overflow)append(rest,node);more.append(rest);list.append(more);}if(!outline.nodes.length)list.append(element('li','沒有已知流程'));section.append(list);return section;
}
