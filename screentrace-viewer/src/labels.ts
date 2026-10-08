import {Node} from './contracts';
import {Index} from './map';

export const kindNames:Record<string,string>={BUTTON:'按鈕',LINK:'連結',SUBMIT:'表單送出',FORM:'表單',SELECT:'下拉選單',MULTI_SELECT:'多選欄位',CHECKBOX:'核取方塊',RADIO:'單選欄位',DATE_PICKER:'日期欄位',TEXT_INPUT:'文字欄位',TEXTAREA:'文字區域',FILE_INPUT:'檔案欄位',TABLE:'資料表',MODAL:'彈窗',OTHER:'其他項目'};
export function kindName(node:Node):string{return kindNames[node.attributes.kind]||kindNames[node.attributes.tag?.toUpperCase()]||'其他項目';}

export interface LabelContext {
 visibleText?:string;ariaLabel?:string;title?:string;alt?:string;value?:string;
 ancestors?:Array<{tag:string;text?:string;staticText?:boolean}>;
 precedingHeading?:string;
 formHeading?:string;submitText?:string;knownDestination?:string;
 duplicateOrdinal?:number;duplicateCount?:number;dynamicContent?:boolean;globalNavigation?:boolean;
}
const normalize=(value:unknown)=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
const serialLabel=/^(?:按鈕|連結|下拉選單|表單|文字欄位)\s*\d+$/u;
const expression=/(?:\$\{|#\{|<%)/;
const technical=(value:string,node:Node)=>!value||value===node.id||expression.test(value)||/^(?:a|button|input|page|open|notempty|[a-z]|\d+)$/i.test(value)||serialLabel.test(value)||/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/iu.test(value);
function humanize(value:string):string{return value.replace(/([a-z0-9])([A-Z])/gu,'$1 $2').split(/[-_\s]+/u).filter(Boolean).map(part=>part[0].toLocaleUpperCase()+part.slice(1)).join(' ');}
function location(context:LabelContext):string|undefined{
 if(context.globalNavigation)return '導覽列';
 const ancestors=context.ancestors||[];
 for(const ancestor of ancestors){const text=ancestor.staticText?normalize(ancestor.text):'';switch(ancestor.tag.toLowerCase()){
  case'nav':return '導覽列';case'header':return '頁首';case'footer':return '頁尾';
  case'form':{const formName=context.formHeading||context.submitText||text;return formName?`${formName.replace(/\s*表單$/u,'')} 表單`:'表單';}
 }}
 const heading=ancestors.find(ancestor=>/^h[1-4]$/i.test(ancestor.tag)&&ancestor.staticText&&normalize(ancestor.text))?.text||context.precedingHeading;
 if(heading)return `${normalize(heading)} 區塊`;
 return undefined;
}
function positionPhrase(place:string):string{return `位於${['導覽列','頁首','頁尾','表單'].includes(place)?'':' '}${place}`;}
/** Name from graph/source evidence only. Preview-rendered sample text is never a name source. */
export function componentLabel(node:Node&{displayLabel?:string},context:LabelContext={}):string{
 const a=node.attributes,kind=kindName(node),tag=String(a.tag||'').toLowerCase();
 const sourceText=context.dynamicContent||String(a.kind||'').toUpperCase()==='FORM'?undefined:context.visibleText;
 const candidates=context.dynamicContent?[a['aria-label'],context.ariaLabel,a.title,context.title,a.alt,context.alt]:[sourceText,a.visibleText,a.text,a['aria-label'],a.label,context.ariaLabel,a.title,context.title,context.alt,a.alt];
 let label=candidates.map(normalize).find(value=>!technical(value,node));
 if(!label&&['button','input'].includes(tag)){const value=normalize(context.dynamicContent?undefined:context.value||a.value);if(!technical(value,node))label=value;}
 if(!label&&String(a.kind||'').toUpperCase()==='FORM'){
  const heading=normalize(context.formHeading)||normalize(context.submitText)||normalize(a.formHeading)||normalize(a.submitText);
  if(heading)label=`${heading} 表單`;
 }
 if(!label){const candidates=[normalize(a.name),normalize(a.id),...(context.dynamicContent?[]:[normalize(node.name)])],match=candidates.find(value=>value&&!expression.test(value)&&!serialLabel.test(value)&&!/^(?:a|button|input|page|open|notempty|[a-z]|\d+)$/i.test(value)&&!/^component:[0-9a-f-]+$/i.test(value));if(match){label=humanize(match);label+=` ${kind}`;}}
 let positionFallback=false;
 if(!label){const place=location(context);positionFallback=!!place;label=place?`${kind}（${positionPhrase(place)}）`:`${kind}（無文字）`;}
 if(positionFallback&&context.knownDestination)label+=`，前往 ${normalize(context.knownDestination)}`;
 if((context.duplicateCount||0)>1)label+=`（第 ${Math.max(1,context.duplicateOrdinal||1)} 個）`;
 return [...label].length>80?[...label].slice(0,79).join('')+'…':label;
}

export interface LabelPreviewRecord {graphScreenId:string;path:string;tag?:string;graphComponentId?:string}
interface LabelSource {documents:Map<string,Document>;dynamicScreens:Set<string>;previewElements:LabelPreviewRecord[];labels:Map<string,Map<string,string>>;targets:Map<string,Map<string,Set<string>>>;nodesByScreen:Map<string,Node[]>;contexts:Map<string,Map<string,LabelContext>>}
const labelCache=new WeakMap<Index,LabelSource>();
const destinationsFor=(index:Index)=>{const byScreen=new Map<string,Map<string,Set<string>>>();for(const relation of index.relations){const triggers=byScreen.get(relation.from)||new Map<string,Set<string>>();for(const id of relation.triggers){const targets=triggers.get(id)||new Set<string>();targets.add(relation.to);triggers.set(id,targets);}byScreen.set(relation.from,triggers);}return byScreen;};
function documentContexts(index:Index,screenId:string,document:Document|undefined,dynamicContent:boolean,targets:Map<string,Set<string>>):Map<string,LabelContext>{
 const result=new Map<string,LabelContext>();if(!document)return result;
 const textCache=new WeakMap<Element,string|undefined>();
 const safeText=(element:Element):string|undefined=>{
  if(element.matches('[data-st-dynamic-content],.st-dynamic-placeholder')||element.querySelector('[data-st-dynamic-content],.st-dynamic-placeholder'))return undefined;
  if(textCache.has(element))return textCache.get(element);const value=normalize(element.textContent);const safe=value&&!expression.test(value)?value:undefined;textCache.set(element,safe);return safe;
 };
 const stack:Array<{element:Element;ancestors:Element[]}>=[];
 let lastStaticHeading:string|undefined;
 for(let i=document.documentElement.children.length-1;i>=0;i--)stack.push({element:document.documentElement.children[i],ancestors:[]});
 while(stack.length){
  const {element,ancestors}=stack.pop()!;
  if(/^h[1-4]$/.test(element.localName)){const heading=safeText(element);if(heading)lastStaticHeading=heading;}
  const id=element.getAttribute('data-st-component-id');
  if(id){
   const meaningful=ancestors.filter(item=>['nav','header','footer','form'].includes(item.localName)||/^h[1-4]$/.test(item.localName));
   const hasHeadingAncestor=meaningful.some(item=>/^h[1-4]$/.test(item.localName)&&!!safeText(item));
   const target=index.nodes.get(id),markedDynamic=element.matches('[data-st-dynamic-content],.st-dynamic-placeholder')||!!element.querySelector('[data-st-dynamic-content],.st-dynamic-placeholder');
   const hasSourceLabel=target?.attributes.labelSource==='visibleText'&&!!normalize(target.attributes.visibleText)&&!expression.test(normalize(target.attributes.visibleText));
   const isDynamic=markedDynamic||dynamicContent&&!hasSourceLabel;
   const context:LabelContext={visibleText:isDynamic?undefined:safeText(element),ariaLabel:isDynamic?undefined:element.getAttribute('aria-label')||undefined,title:isDynamic?undefined:element.getAttribute('title')||undefined,alt:isDynamic?undefined:element.getAttribute('alt')||element.querySelector('img[alt]')?.getAttribute('alt')||undefined,value:isDynamic?undefined:element.getAttribute('value')||undefined,dynamicContent:isDynamic,ancestors:meaningful.map(item=>({tag:item.localName,text:safeText(item),staticText:!item.matches('[data-st-dynamic-content],.st-dynamic-placeholder')&&!item.querySelector('[data-st-dynamic-content],.st-dynamic-placeholder')})),precedingHeading:hasHeadingAncestor?undefined:lastStaticHeading};
   const form=element.localName==='form'?element:ancestors.find(item=>item.localName==='form');if(form){const componentId=form.getAttribute('data-st-component-id'),formNode=componentId?index.nodes.get(componentId):undefined;const formName=formNode?componentLabel(formNode,{dynamicContent}):undefined,heading=form.querySelector('legend,h1,h2,h3,h4');context.formHeading=dynamicContent?undefined:safeText(heading||form)||undefined;if(!context.formHeading&&formName&&!formName.includes('（無文字）'))context.formHeading=formName.replace(/\s*表單$/u,'');}
   const relation=targets.get(id);if(relation?.size===1)context.knownDestination=index.nodes.get([...relation][0])?.name;
   result.set(id,context);
  }
  for(let i=element.children.length-1;i>=0;i--)stack.push({element:element.children[i],ancestors:[element,...ancestors]});
 }
 return result;
}
function makeLabels(index:Index,screenId:string,nodes:Node[],contexts:Map<string,LabelContext>,targets:Map<string,Set<string>>):Map<string,string>{
 const forms=new Map<string,string>();for(const candidate of nodes){const id=candidate.attributes.formId,text=normalize(candidate.attributes.visibleText);if(id&&text&&!technical(text,candidate)&&!forms.has(id))forms.set(id,text);}
 const bases=nodes.map(node=>{const context={...(contexts.get(node.id)||{})},destination=targets.get(node.id);if(destination?.size===1)context.knownDestination=index.nodes.get([...destination][0])?.name;if(String(node.attributes.kind||'').toUpperCase()==='FORM')context.submitText=forms.get(String(node.attributes.name||node.attributes.id||node.name||''));return componentLabel(node,context);});
 const totals=new Map<string,number>();for(const base of bases)totals.set(base,(totals.get(base)||0)+1);const seen=new Map<string,number>(),labels=new Map<string,string>();nodes.forEach((node,i)=>{const base=bases[i],ordinal=(seen.get(base)||0)+1;seen.set(base,ordinal);labels.set(node.id,totals.get(base)!>1?`${base}（第 ${ordinal} 個）`:base);});return labels;
}
/** Build the per-screen names once, reusing the already parsed inert documents. */
function sourceFor(index:Index):LabelSource {let source=labelCache.get(index);if(source)return source;const nodesByScreen=new Map<string,Node[]>();for(const [id,screens]of index.owners){const node=index.nodes.get(id);if(!node)continue;for(const screen of screens){const values=nodesByScreen.get(screen)||[];values.push(node);nodesByScreen.set(screen,values);}}source={documents:new Map(),dynamicScreens:new Set(),previewElements:[],labels:new Map(),targets:destinationsFor(index),nodesByScreen,contexts:new Map()};labelCache.set(index,source);return source;}
export function initializeComponentLabels(index:Index,documents:Map<string,Document>,dynamicScreens:Set<string>,previewElements:LabelPreviewRecord[]=[]):void {const source=sourceFor(index);source.documents=documents;source.dynamicScreens=dynamicScreens;source.previewElements=previewElements;for(const record of previewElements){const document=documents.get(record.graphScreenId);if(!document)continue;const selector=record.path.split('>').map(part=>part.replace(/^([\w-]+)\[(\d+)\]$/,'$1:nth-of-type($2)')).join('>'),id=record.graphComponentId||previewRecordId(record);try{const element=document.querySelector(selector);if(element&&!element.hasAttribute('data-st-component-id'))element.setAttribute('data-st-component-id',id);}catch{}}}
function ensureScreenContexts(index:Index,screenId:string):Map<string,LabelContext>{const source=sourceFor(index);let contexts=source.contexts.get(screenId);if(!contexts){contexts=documentContexts(index,screenId,source.documents.get(screenId),source.dynamicScreens.has(screenId),source.targets.get(screenId)||new Map());source.contexts.set(screenId,contexts);}return contexts;}
function ensureScreenLabels(index:Index,screenId:string):Map<string,string>{const source=sourceFor(index),cached=source.labels.get(screenId);if(cached)return cached;const contexts=ensureScreenContexts(index,screenId),labels=makeLabels(index,screenId,source.nodesByScreen.get(screenId)||[],contexts,source.targets.get(screenId)||new Map());source.labels.set(screenId,labels);return labels;}

const previewRecordId=(record:LabelPreviewRecord)=>`preview-record:${record.graphScreenId}:${record.path}`;
export function previewRecordLabel(index:Index,screenId:string,record:LabelPreviewRecord):string {
 const source=sourceFor(index),contexts=ensureScreenContexts(index,screenId),id=previewRecordId(record),tag=record.tag||'div',kind=({a:'LINK',button:'BUTTON',form:'FORM',select:'SELECT',textarea:'TEXTAREA',input:'TEXT_INPUT'} as Record<string,string>)[tag]||'OTHER';
 return componentLabel({id,name:'',type:'COMPONENT',confidence:'UNRESOLVED',attributes:{kind,tag}},contexts.get(id)||{});
}
export function componentLabelsByScreen(index:Index):Map<string,Map<string,string>>{const source=sourceFor(index);for(const screen of source.nodesByScreen.keys())ensureScreenLabels(index,screen);return source.labels;}
export function componentLabelsForScreen(index:Index,screenId:string):Map<string,string>{return ensureScreenLabels(index,screenId);}
export function isAction(index:Index,node:Node):boolean{
 if(['TEXT_INPUT','TEXTAREA','CHECKBOX','RADIO','FILE_INPUT','TABLE','FORM'].includes(node.attributes.kind))return false;
 if(['BUTTON','LINK','SUBMIT','SELECT','MULTI_SELECT','DATE_PICKER','MODAL'].includes(node.attributes.kind))return true;
 return (index.graph.behaviors||[]).some(b=>b.triggerId===node.id&&['NAVIGATE','CALL_API','OPEN_DIALOG','SELECT_CHANGE','SUBMIT_FORM'].includes(b.type));
}
