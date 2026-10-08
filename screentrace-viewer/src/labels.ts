import {Node} from './contracts';import {Index} from './map';
export const kindNames:Record<string,string>={BUTTON:'按鈕',LINK:'連結',SUBMIT:'表單送出',FORM:'表單',SELECT:'下拉選單',MULTI_SELECT:'多選欄位',CHECKBOX:'核取方塊',RADIO:'單選欄位',DATE_PICKER:'日期欄位',TEXT_INPUT:'文字欄位',TEXTAREA:'文字區域',FILE_INPUT:'檔案欄位',TABLE:'資料表',MODAL:'彈窗',OTHER:'其他項目'};
export function kindName(node:Node):string{return kindNames[node.attributes.kind]||kindNames[node.attributes.tag?.toUpperCase()]||'其他項目';}
export interface LabelContext {visibleText?:string;ariaLabel?:string;title?:string;alt?:string;value?:string;ancestors?:Array<{tag:string;text?:string}>;formHeading?:string;submitText?:string;knownDestination?:string;duplicateOrdinal?:number;duplicateCount?:number}
const normalize=(value:unknown)=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
const technical=(value:string,node:Node)=>!value||value===node.id||/\$\{|#\{|<%/.test(value)||/^(?:a|button|input|page|open|notempty|\d+)$/i.test(value)||/^(?:按鈕|連結|下拉選單|表單|文字欄位)\s*\d+$/u.test(value)||/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/iu.test(value);
function humanize(value:string):string{return value.replace(/([a-z0-9])([A-Z])/gu,'$1 $2').split(/[-_\s]+/u).filter(Boolean).map(part=>part[0].toLocaleUpperCase()+part.slice(1)).join(' ');}
function location(context:LabelContext):string|undefined{
 for(const ancestor of context.ancestors||[]){const text=normalize(ancestor.text);switch(ancestor.tag.toLowerCase()){
  case'nav':return '導覽列';case'header':return '頁首';case'footer':return '頁尾';case'form':return context.formHeading||context.submitText?`${context.formHeading||context.submitText} 表單`:text?`${text} 表單`:'表單';case'screen':return text?`${text} 畫面`:'畫面';
  default:if(/^h[1-4]$/i.test(ancestor.tag)&&text)return `${text} 區塊`;
 }}
 return undefined;
}
/** Deterministic presentation name. It uses only source-visible text and explicitly supplied static DOM context. */
export function componentLabel(node:Node&{displayLabel?:string},context:LabelContext={}):string{
 const a=node.attributes,kind=kindName(node),tag=String(a.tag||'').toLowerCase(),candidates=[context.visibleText,a.visibleText,a.text,node.displayLabel,a.label,context.ariaLabel,a['aria-label'],context.title,a.title,context.alt,a.alt];
 let label=candidates.map(normalize).find(value=>!technical(value,node));
 if(!label&&(tag==='img'||a.imageAlt)&&!technical(normalize(a.alt||a.imageAlt),node))label=normalize(a.alt||a.imageAlt);
 if(!label&&['button','input'].includes(tag)&&!technical(normalize(context.value||a.value),node))label=normalize(context.value||a.value);
 if(!label&&String(a.kind||'').toUpperCase()==='FORM'){
  const heading=normalize(context.formHeading)||normalize(context.submitText);
  if(heading)label=`${heading} 表單`;
 }
 if(!label){const identity=normalize(a.name)||normalize(a.id)||normalize(node.name);if(identity&&!(identity===node.id&&/^[a-z]\d*$/iu.test(identity))&&!/\$\{|#\{|<%/.test(identity)&&!/^(?:按鈕|連結|下拉選單|表單|文字欄位)\s*\d+$/u.test(identity)){label=humanize(identity);label+=` ${kind}`;}}
 if(!label){const place=location(context);label=place?`${kind}（位於 ${place}）`:`${kind}（無文字）`;}
 if(context.knownDestination)label+=`，前往 ${normalize(context.knownDestination)}`;
 if((context.duplicateCount||0)>1)label+=`（第 ${Math.max(1,context.duplicateOrdinal||1)} 個）`;
 return [...label].length>80?[...label].slice(0,79).join('')+'…':label;
}
export function labelContextFromElement(target:Element|undefined,knownDestination?:string):LabelContext{
 if(!target)return knownDestination?{knownDestination}:{};
 const textOf=(element:Element|undefined)=>{if(!element)return undefined;const clone=element.cloneNode(true) as Element;clone.querySelectorAll('script,style,noscript,template').forEach(node=>node.remove());const text=normalize(clone.textContent);return text&&!/\$\{|#\{|<%/.test(text)?text:undefined;};
 const ancestors:Array<{tag:string;text?:string}>=[];let current:Element|null=target;while(current){ancestors.push({tag:current.localName,text:textOf(current)});current=current.parentElement;}
 const form=target.matches('form')?target:target.closest('form'),heading=form?.querySelector('legend,h1,h2,h3,h4'),submit=form?.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
 return {visibleText:target.localName==='form'?undefined:textOf(target),ariaLabel:target.getAttribute('aria-label')||undefined,title:target.getAttribute('title')||undefined,alt:target.getAttribute('alt')||target.querySelector('img[alt]')?.getAttribute('alt')||undefined,value:(target as HTMLInputElement).value||target.getAttribute('value')||undefined,ancestors,formHeading:textOf(heading||undefined),submitText:textOf(submit||undefined),knownDestination};
}
export function screenLabelContext(index:Index,screenId:string,nodeId:string):LabelContext{
 const owner=index.nodes.get(screenId),component=index.nodes.get(nodeId);if(!owner||!component)return {};
 const a=component.attributes,identity=String(a.name||a.id||component.name||'');
 const targets=new Set<string>();for(const relation of index.relations)if(relation.from===screenId&&relation.triggers.includes(nodeId))targets.add(relation.to);
 const context:LabelContext={ancestors:[{tag:'screen',text:owner.name}]};
 if(targets.size===1)context.knownDestination=index.nodes.get([...targets][0])?.name;
 if(String(a.kind||'').toUpperCase()==='FORM'){
  for(const id of index.owners.keys()){const candidate=index.nodes.get(id);if(candidate?.attributes.formId===identity&&candidate.attributes.visibleText){context.submitText=normalize(candidate.attributes.visibleText);break;}}
 }
 return context;
}
export function componentLabelsForScreen(index:Index,screenId:string,contextFor?:(node:Node)=>LabelContext):Map<string,string>{
 const nodes=[...index.owners].filter(([,screens])=>screens.includes(screenId)).map(([id])=>index.nodes.get(id)).filter((node):node is Node=>!!node);
 let contexts:LabelContext[];
 if(!contextFor){
  const owner=index.nodes.get(screenId),targets=new Map<string,Set<string>>(),submitTexts=new Map<string,string>();
  for(const relation of index.relations)if(relation.from===screenId)for(const trigger of relation.triggers){const values=targets.get(trigger)||new Set<string>();values.add(relation.to);targets.set(trigger,values);}
  for(const id of index.owners.keys()){const candidate=index.nodes.get(id),formId=candidate?.attributes.formId,text=normalize(candidate?.attributes.visibleText);if(formId&&text&&!submitTexts.has(formId))submitTexts.set(formId,text);}
  contexts=nodes.map(node=>{const a=node.attributes,identity=String(a.name||a.id||node.name||''),context:LabelContext={ancestors:[{tag:'screen',text:owner?.name}]},destinations=targets.get(node.id);if(destinations?.size===1)context.knownDestination=index.nodes.get([...destinations][0])?.name;if(String(a.kind||'').toUpperCase()==='FORM')context.submitText=submitTexts.get(identity);return context;});
 }else contexts=nodes.map(contextFor);
 const bases=nodes.map((node,i)=>componentLabel(node,contexts[i])),totals=new Map<string,number>();for(const base of bases)totals.set(base,(totals.get(base)||0)+1);const seen=new Map<string,number>(),labels=new Map<string,string>();nodes.forEach((node,i)=>{const base=bases[i],ordinal=(seen.get(base)||0)+1;seen.set(base,ordinal);labels.set(node.id,totals.get(base)!>1?`${base}（第 ${ordinal} 個）`:base);});return labels;
}
export function componentLabelsByScreen(index:Index):Map<string,Map<string,string>>{
 const nodesByScreen=new Map<string,Node[]>();for(const [id,screens]of index.owners){const node=index.nodes.get(id);if(!node)continue;for(const screen of screens){const nodes=nodesByScreen.get(screen)||[];nodes.push(node);nodesByScreen.set(screen,nodes);}}
 const targetsByScreen=new Map<string,Map<string,Set<string>>>();for(const relation of index.relations){const byTrigger=targetsByScreen.get(relation.from)||new Map<string,Set<string>>();for(const trigger of relation.triggers){const targets=byTrigger.get(trigger)||new Set<string>();targets.add(relation.to);byTrigger.set(trigger,targets);}targetsByScreen.set(relation.from,byTrigger);}
 const formSubmitsByScreen=new Map<string,Map<string,string>>();for(const [screen,nodes]of nodesByScreen){const forms=new Map<string,string>();for(const node of nodes){const formId=node.attributes.formId,text=normalize(node.attributes.visibleText);if(formId&&text&&!forms.has(formId))forms.set(formId,text);}formSubmitsByScreen.set(screen,forms);}
 const result=new Map<string,Map<string,string>>();for(const [screen,nodes]of nodesByScreen){const owner=index.nodes.get(screen),targets=targetsByScreen.get(screen)||new Map(),forms=formSubmitsByScreen.get(screen)||new Map(),contexts=nodes.map(node=>{const attributes=node.attributes,identity=String(attributes.name||attributes.id||node.name||''),context:LabelContext={ancestors:[{tag:'screen',text:owner?.name}]},destinations=targets.get(node.id);if(destinations?.size===1)context.knownDestination=index.nodes.get([...destinations][0])?.name;if(String(attributes.kind||'').toUpperCase()==='FORM')context.submitText=forms.get(identity);return context;});const bases=nodes.map((node,i)=>componentLabel(node,contexts[i])),totals=new Map<string,number>();for(const base of bases)totals.set(base,(totals.get(base)||0)+1);const seen=new Map<string,number>(),labels=new Map<string,string>();nodes.forEach((node,i)=>{const base=bases[i],ordinal=(seen.get(base)||0)+1;seen.set(base,ordinal);labels.set(node.id,totals.get(base)!>1?`${base}（第 ${ordinal} 個）`:base);});result.set(screen,labels);}return result;
}
export function isAction(index:Index,node:Node):boolean{
 if(['TEXT_INPUT','TEXTAREA','CHECKBOX','RADIO','FILE_INPUT','TABLE','FORM'].includes(node.attributes.kind))return false;
 if(['BUTTON','LINK','SUBMIT','SELECT','MULTI_SELECT','DATE_PICKER','MODAL'].includes(node.attributes.kind))return true;
 return (index.graph.behaviors||[]).some(b=>b.triggerId===node.id&&['NAVIGATE','CALL_API','OPEN_DIALOG','SELECT_CHANGE','SUBMIT_FORM'].includes(b.type));
}
