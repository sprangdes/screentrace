import {Index,Relation} from './map';import {Payload,Behavior} from './contracts';import {element,text} from './text';import {rootTrigger} from './usage';
import {componentLabelsForScreen} from './labels';
import {partitionNavigation} from './overview';
export interface FocusRelation extends Relation {unresolved?:boolean}
export function relationTooltip(index:Index,payload:Payload,r:FocusRelation):HTMLElement{const tip=element('div',undefined,'relation-tooltip');tip.setAttribute('role','tooltip');const target=index.nodes.get(r.to),name=target?.name||text.unresolved;tip.append(element('strong',name));const routes=index.routes.get(r.to)||[];tip.append(element('p',routes.length?routes.join('\n'):r.unresolved?text.unresolved:text.noUrl));const thumb=payload.preview.screens?.find(s=>s.graphScreenId===r.to)?.thumbnail;if(thumb?.startsWith('data:image/')){const img=element('img');img.src=thumb;img.alt=name;tip.append(img);}else tip.append(element('p',text.noThumbnail));const labels=componentLabelsForScreen(index,r.from);for(const id of r.triggers)tip.append(element('div',labels.get(id)||'可操作項目（無文字）'));if(r.triggers.length>10)tip.append(element('p',`${text.remaining} ${r.triggers.length-10} ${text.items}`));return tip;}
export function focusedRelations(index:Index,id:string):FocusRelation[]{const known=index.relations.filter(r=>r.from===id);const unresolved:FocusRelation[]=[];for(const b of index.graph.behaviors||[]){if(!['NAVIGATE','SUBMIT_FORM'].includes(b.type)||b.targetId)continue;const trigger=rootTrigger(index,b);if(!trigger)continue;const sources=index.nodes.get(trigger)?.type==='SCREEN'?[trigger]:index.owners.get(trigger)||[];if(sources.includes(id))unresolved.push({from:id,to:`unresolved:${b.id}`,triggers:index.nodes.get(trigger)?.type==='SCREEN'?[]:[trigger],behaviorIds:[b.id],unresolved:true});}const merged:FocusRelation[]=unresolved.length?[{from:id,to:`unresolved:${id}`,triggers:[...new Set(unresolved.flatMap(r=>r.triggers))].sort(),behaviorIds:[...new Set(unresolved.flatMap(r=>r.behaviorIds))].sort(),unresolved:true}]:[];return [...known,...merged].sort((a,b)=>a.to<b.to?-1:a.to>b.to?1:0);}

/** Screens tied to this one only through shared navigation (header/footer links), which the overview does not draw. */
export interface SharedNavigation {into:string[];out:string[];intoLabels:string[];outLabels:string[]}
export function sharedNavigation(index:Index,id:string,withLabels=true):SharedNavigation{
 const {global,flows}=partitionNavigation(index);
 const flowSources=new Set(flows.filter(r=>r.to===id).map(r=>r.from)),flowTargets=new Set(flows.filter(r=>r.from===id).map(r=>r.to));
 const into=global.filter(r=>r.to===id&&r.from!==id&&!flowSources.has(r.from)),out=global.filter(r=>r.from===id&&r.to!==id&&!flowTargets.has(r.to));
 const unique=(values:string[])=>[...new Set(values)];
 const byName=(ids:string[])=>unique(ids).sort((a,b)=>(index.nodes.get(a)?.name||a).localeCompare(index.nodes.get(b)?.name||b,'zh-Hant'));
 const labelsOf=(relations:Relation[])=>withLabels?unique(relations.flatMap(r=>{const labels=componentLabelsForScreen(index,r.from);return r.triggers.map(t=>labels.get(t)||'');}).filter(Boolean)):[];
 return {into:byName(into.map(r=>r.from)),out:byName(out.map(r=>r.to)),intoLabels:labelsOf(into),outLabels:labelsOf(out)};
}
