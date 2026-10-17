import {endpointGroup} from './endpoint-presentation';
import {deriveApiUsage,screenDecision,componentDecision,ReviewState} from './shared/review';
import {componentLabelsForScreen} from './labels';
import {callerKind,Caller} from './usage';
import {Index} from './map';
import {Node} from './contracts';
import {element} from './text';

/** The three statuses shown to people: inferred usage and system entry points both count as in use. */
export type ApiStatus='IN_USE'|'UNREFERENCED'|'REMOVABLE';
export const apiStatusLabels:Record<ApiStatus,string>={IN_USE:'使用中',UNREFERENCED:'未被使用',REMOVABLE:'可移除'};
const systemEntry=(node:Node,index:Index):string|undefined=>{
 const path=node.attributes.path||node.attributes.route||node.name;
 if(node.attributes.inheritedTemplate==='true')return '被繼承的設定樣板';
 if(String(node.attributes.entrySource||'').includes('welcome-file'))return '系統預設首頁';
 if(index.screens.some(screen=>!!screen.attributes.autoRedirect&&(index.routes.get(screen.id)||[]).includes(path)))return '系統自動導向';
 return undefined;
};

/** Endpoints listed on the API page: backend APIs, not screen URLs and not unmatched frontend request descriptions. */
export function apiEndpoints(index:Index):Node[]{
 return index.graph.nodes.filter(n=>n.type==='ENDPOINT'&&n.attributes.origin!=='javascript-request'&&endpointGroup(n,index)!=='SCREEN');
}

export function apiStatuses(index:Index,state:ReviewState):Map<string,ApiStatus>{
 const usage=deriveApiUsage(index.graph,state),result=new Map<string,ApiStatus>();
 for(const node of apiEndpoints(index)){const status=usage.get(node.id)!.status;result.set(node.id,systemEntry(node,index)&&status==='UNREFERENCED'?'IN_USE':status);}
 return result;
}

export interface ApiPageOptions {selected?:string;onSelect?:(id:string)=>void;onCaller:(screenId:string,componentId?:string)=>void}
type Filter='ALL'|'ATTENTION'|'IN_USE';
type Grouping='controller'|'url';
interface ApiRecord {node:Node;method:string;path:string;handlers:Node[];callers:Caller[];screens:number;status:ApiStatus;note?:string;searchable:string;controller:string;prefix:string}

/** A component calling from this many screens is a shared one (a header, a layout), listed once instead of per screen. */
const SHARED_SCREENS=3;
const NO_HANDLER='找不到處理程式';
/** What the page keeps while the report is open: leaving for a screen and coming back finds the list as it was. */
const memory={filter:'ALL' as Filter,grouping:'controller' as Grouping,query:'',collapsed:new Set<string>()};

const controllerOf=(handlers:Node[])=>{const handler=handlers.map(h=>h.attributes.class||h.name.split('.')[0]).filter(Boolean).sort()[0];return handler||NO_HANDLER;};
/** The URL area: `/api/v1/auth/login` → `/api/v1/auth`; a bare `api` or version segment is not an area of its own. */
export function urlPrefix(path:string):string{
 const parts=path.split('/').filter(Boolean),kept:string[]=[];
 for(const part of parts){kept.push(part);if(part!=='api'&&!/^v\d+$/.test(part))break;}
 return '/'+kept.join('/');
}
const methodBadge=(method:string)=>{const badge=element('span',method==='ANY'?'任何':method,'method-badge');badge.dataset.method=method;return badge;};
const statusTag=(status:ApiStatus)=>{const tag=element('span',apiStatusLabels[status],'api-status');tag.dataset.apiStatus=status;return tag;};

export function apiPage(index:Index,state:ReviewState,options:ApiPageOptions):HTMLElement{
 const usage=deriveApiUsage(index.graph,state),statuses=apiStatuses(index,state),edges=index.graph.relationships||[];
 const records:ApiRecord[]=apiEndpoints(index).map(node=>{
  const method=node.attributes.httpMethod||node.attributes.method||'ANY',path=node.attributes.path||node.attributes.route||node.name;
  const handlers=edges.filter(e=>e.type==='HANDLED_BY'&&e.from===node.id).map(e=>index.nodes.get(e.to)).filter((h):h is Node=>!!h).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const callers=usage.get(node.id)!.callers,status=statuses.get(node.id)!;
  const searchable=[method,path,node.attributes.aliases||'',node.attributes.logicalPath||'',...handlers.map(h=>h.name),apiStatusLabels[status],...callers.map(c=>`${index.nodes.get(c.screenId)?.name||''} ${c.componentId?componentLabelsForScreen(index,c.screenId).get(c.componentId)||'':''}`)].join(' ').toLowerCase();
  return {node,method,path,handlers,callers,screens:new Set(callers.map(c=>c.screenId)).size,status,note:systemEntry(node,index),searchable,controller:controllerOf(handlers),prefix:urlPrefix(path)};
 });
 const byId=new Map(records.map(r=>[r.node.id,r]));
 // Arriving from a screen for one API: show it whatever the list was narrowed to before.
 if(options.selected&&byId.has(options.selected)){memory.filter='ALL';memory.query='';}
 let selected=options.selected&&byId.has(options.selected)?options.selected:undefined;

 const root=element('section',undefined,'api-page'),master=element('div',undefined,'api-master'),detail=element('aside',undefined,'api-detail');
 detail.setAttribute('aria-label','API 詳情');
 const head=element('div',undefined,'api-heading'),title=element('h1','API');
 title.append(element('span',String(records.length),'api-total'));
 head.append(title,element('p','狀態依目前的保留／移除標記即時計算。','api-intro'));
 const search=element('input'),grouping=element('div',undefined,'segmented api-grouping'),chips=element('div',undefined,'chips');
 search.type='search';search.placeholder='搜尋網址、處理程式或畫面';search.setAttribute('aria-label','搜尋 API');search.value=memory.query;
 grouping.setAttribute('role','group');grouping.setAttribute('aria-label','分組方式');
 chips.setAttribute('role','group');chips.setAttribute('aria-label','API 狀態篩選');
 const toolbar=element('div',undefined,'api-toolbar');toolbar.append(chips,grouping);
 const list=element('div',undefined,'api-list');list.setAttribute('role','listbox');list.setAttribute('aria-label','API 清單');
 head.append(search,toolbar);master.append(head,list);root.append(master,detail);

 const visible=(r:ApiRecord)=>{const q=memory.query.trim().toLowerCase();return (memory.filter==='ALL'||(memory.filter==='IN_USE'?r.status==='IN_USE':r.status!=='IN_USE'))&&(!q||r.searchable.includes(q));};
 const rows=()=>[...list.querySelectorAll<HTMLButtonElement>('.api-row')].filter(row=>!row.closest('.api-group.is-collapsed'));

 /** Scrolls only the list, never the page, and keeps the row clear of its group's sticky header. */
 const keepInView=(row:HTMLElement)=>{
  const view=list.getBoundingClientRect(),box=row.getBoundingClientRect(),header=row.closest('.api-group')?.querySelector('.api-group-header')?.getBoundingClientRect().height||0;
  if(box.top<view.top+header)list.scrollTop-=view.top+header-box.top;else if(box.bottom>view.bottom)list.scrollTop+=box.bottom-view.bottom;
 };
 const select=(id:string,focus=false)=>{
  selected=id;options.onSelect?.(id);
  for(const row of list.querySelectorAll<HTMLElement>('.api-row')){const on=row.dataset.apiRow===id;row.setAttribute('aria-selected',String(on));row.tabIndex=on?0:-1;}
  const row=list.querySelector<HTMLElement>(`.api-row[data-api-row="${CSS.escape(id)}"]`);
  if(row){if(focus)row.focus({preventScroll:true});keepInView(row);}
  renderDetail();
 };

 const renderControls=()=>{
  grouping.replaceChildren();
  for(const [value,label,description] of [['controller','Controller','依 Controller 分組'],['url','網址','依網址分組']] as const){
   const button=element('button',label);button.type='button';button.dataset.apiGrouping=value;button.title=description;button.setAttribute('aria-label',description);button.setAttribute('aria-pressed',String(memory.grouping===value));
   button.onclick=()=>{memory.grouping=value;renderControls();renderList();};grouping.append(button);
  }
  chips.replaceChildren();
  const attention=records.filter(r=>r.status!=='IN_USE').length;
  for(const [value,label,count] of [['ALL','全部',records.length],['ATTENTION','需要注意',attention],['IN_USE','使用中',records.length-attention]] as const){
   const chip=element('button',`${label} ${count}`,'chip');chip.type='button';chip.dataset.apiFilter=value;chip.setAttribute('aria-pressed',String(memory.filter===value));
   if(value==='ATTENTION'&&count)chip.classList.add('is-attention');
   chip.onclick=()=>{memory.filter=value;renderControls();renderList();};chips.append(chip);
  }
 };

 const renderList=()=>{
  const shown=records.filter(visible),groups=new Map<string,ApiRecord[]>();
  for(const record of shown){const key=memory.grouping==='controller'?record.controller:record.prefix;groups.set(key,[...(groups.get(key)||[]),record]);}
  const keys=[...groups.keys()].sort((a,b)=>(a===NO_HANDLER?1:0)-(b===NO_HANDLER?1:0)||a.localeCompare(b,'en'));
  list.replaceChildren();
  if(!shown.length)list.append(element('p','沒有符合的 API','empty-list'));
  const searching=!!memory.query.trim();
  for(const key of keys){
   const items=groups.get(key)!.sort((a,b)=>a.path.localeCompare(b.path,'en')||a.method.localeCompare(b.method,'en'));
   const memoryKey=`${memory.grouping}:${key}`,collapsed=!searching&&memory.collapsed.has(memoryKey)&&!items.some(r=>r.node.id===selected);
   const group=element('section',undefined,'api-group'),header=element('button',undefined,'api-group-header'),body=element('div',undefined,'api-group-items');
   group.dataset.apiGroup=key;group.classList.toggle('is-collapsed',collapsed);body.setAttribute('role','group');body.setAttribute('aria-label',key);
   header.type='button';header.setAttribute('aria-expanded',String(!collapsed));
   const attention=items.filter(r=>r.status!=='IN_USE').length;
   header.append(element('span',undefined,'api-group-caret'),element('span',key,'api-group-name'),element('span',String(items.length),'api-group-count'));
   if(attention)header.append(element('span',`${attention} 需要注意`,'api-group-attention'));
   header.onclick=()=>{const now=!group.classList.contains('is-collapsed');group.classList.toggle('is-collapsed',now);header.setAttribute('aria-expanded',String(!now));if(now)memory.collapsed.add(memoryKey);else memory.collapsed.delete(memoryKey);};
   for(const record of items){
    const row=element('button',undefined,'api-row');row.type='button';row.setAttribute('role','option');
    row.dataset.apiRow=record.node.id;row.dataset.apiStatus=record.status;row.title=`${record.method} ${record.path}`;
    const meta=element('span',undefined,'api-row-meta');
    meta.append(element('span',record.screens?`${record.screens} 個畫面`:'沒有呼叫來源','api-screen-count'));
    if(record.status!=='IN_USE')meta.append(statusTag(record.status));
    row.append(methodBadge(record.method),element('code',record.path,'api-path'),meta);
    row.onclick=()=>select(record.node.id);
    body.append(row);
   }
   group.append(header,body);list.append(group);
  }
  // Keep the selection on a visible API; when it is filtered away, the first one shown takes its place.
  const ids=rows().map(row=>row.dataset.apiRow!);
  if(!selected||!ids.includes(selected))selected=ids[0];
  if(selected)select(selected);else renderDetail();
 };

 list.addEventListener('keydown',event=>{
  const all=rows(),at=all.findIndex(row=>row.dataset.apiRow===selected);
  const target=event.key==='ArrowDown'?all[Math.min(all.length-1,at+1)]:event.key==='ArrowUp'?all[Math.max(0,at-1)]:event.key==='Home'?all[0]:event.key==='End'?all.at(-1):undefined;
  if(!target)return;event.preventDefault();select(target.dataset.apiRow!,true);
 });
 search.oninput=()=>{memory.query=search.value;renderList();};

 const callerLabel=(caller:Caller)=>caller.componentId?componentLabelsForScreen(index,caller.screenId).get(caller.componentId)||'沒有文字的按鈕':callerKind(index,caller)==='unresolved'?'無法確定的觸發來源':'畫面載入時';
 const removed=(caller:Caller)=>screenDecision(state,caller.screenId)==='REMOVE'||!!caller.componentId&&componentDecision(state,caller.screenId,caller.componentId)==='REMOVE';
 const callerButton=(caller:Caller,label:string)=>{
  const link=element('button',undefined,'api-caller');link.type='button';
  link.dataset.callerScreen=caller.screenId;if(caller.componentId)link.dataset.callerComponent=caller.componentId;
  link.append(element('span',label,'api-caller-label'));
  if(removed(caller)){link.classList.add('is-removed');link.append(element('span','已標記移除','api-removed-tag'));}
  link.onclick=()=>options.onCaller(caller.screenId,caller.componentId);
  return link;
 };
 const section=(heading:string)=>{const box=element('section',undefined,'api-section');box.append(element('h3',heading));return box;};

 const renderCallers=(record:ApiRecord)=>{
  const box=section(`呼叫來源 ${record.screens} 個畫面`);box.dataset.apiSection='callers';
  if(!record.callers.length){box.append(element('p','畫面中找不到呼叫這個 API 的地方。','muted'));return box;}
  // A caller written once and reached from many screens (a layout's logout button, an app-wide load call) is one
  // shared entry: keyed by the component's source line, or by the load call's own code.
  const sharedKey=(caller:Caller)=>{
   if(caller.componentId){const source=index.nodes.get(caller.componentId)?.source;return source?.file&&source.file!=='.'?`component:${source.file}:${source.line??''}`:`component:${caller.componentId}`;}
   const behavior=index.behaviors.get(caller.behaviorId||'');return behavior?`behavior:${behavior.event||''}|${behavior.expression||''}|${behavior.guard||''}`:undefined;
  };
  const screensOf=new Map<string,Set<string>>();
  for(const caller of record.callers){const key=sharedKey(caller);if(key)screensOf.set(key,new Set([...(screensOf.get(key)||[]),caller.screenId]));}
  const shared=new Set([...screensOf].filter(([,screens])=>screens.size>=SHARED_SCREENS).map(([key])=>key));
  const isShared=(caller:Caller)=>{const key=sharedKey(caller);return !!key&&shared.has(key);};
  const own=new Map<string,Caller[]>();
  for(const caller of record.callers)if(!isShared(caller))own.set(caller.screenId,[...(own.get(caller.screenId)||[]),caller]);
  const name=(id:string)=>index.nodes.get(id)?.name||'畫面';
  const byName=(a:string,b:string)=>name(a).localeCompare(name(b),'zh-Hant');
  for(const [key,screens] of [...screensOf].filter(([key])=>shared.has(key)).sort((a,b)=>b[1].size-a[1].size||a[0].localeCompare(b[0],'en'))){
   const callers=record.callers.filter(c=>sharedKey(c)===key),first=callers[0],component=first.componentId?index.nodes.get(first.componentId):undefined;
   const fold=element('details',undefined,'api-shared'),summary=element('summary');fold.dataset.apiShared=key;
   summary.append(element('span',component?`共用按鈕「${callerLabel(first).replace(/（第 \d+ 個）$/,'')}」`:`${callerLabel(first)}（共用程式）`,'api-shared-name'),element('span',`${screens.size} 個畫面`,'muted'));
   if(component?.source?.file&&component.source.file!=='.')summary.append(element('code',`${component.source.file}${component.source.line?`:${component.source.line}`:''}`,'api-source'));
   const triggers=element('div',undefined,'api-caller-list');
   const perScreen=new Map<string,Caller>();for(const caller of callers)if(!perScreen.has(caller.screenId))perScreen.set(caller.screenId,caller);
   for(const [screenId,caller] of [...perScreen].sort((a,b)=>byName(a[0],b[0])))triggers.append(callerButton(caller,name(screenId)));
   fold.append(summary,triggers);box.append(fold);
  }
  for(const [screenId,callers] of [...own].sort((a,b)=>byName(a[0],b[0]))){
   const group=element('div',undefined,'api-caller-screen'),link=element('button',name(screenId),'api-screen-link');link.type='button';
   link.dataset.callerScreen=screenId;link.onclick=()=>options.onCaller(screenId);
   if(screenDecision(state,screenId)==='REMOVE')group.classList.add('is-removed');
   const triggers=element('div',undefined,'api-caller-list');
   for(const caller of callers)triggers.append(callerButton(caller,callerLabel(caller)));
   group.append(link,triggers);box.append(group);
  }
  return box;
 };

 type Field={name?:unknown;type?:unknown;location?:unknown;required?:unknown};
 type Body={contentType?:unknown;bodyType?:unknown;fields?:unknown;status?:unknown};
 const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'';
 const fieldTable=(fields:Field[])=>{
  const table=element('table',undefined,'api-fields'),head=element('tr');
  for(const label of ['欄位','型別','位置','必填'])head.append(element('th',label));
  const thead=element('thead');thead.append(head);const tbody=element('tbody');
  for(const field of fields){const row=element('tr');const name=element('td');name.append(element('code',text(field.name)));row.append(name,element('td',text(field.type)),element('td',text(field.location)),element('td',field.required===true?'是':field.required===false?'否':''));tbody.append(row);}
  table.append(thead,tbody);return table;
 };
 const bodyBlock=(heading:string,body:Body)=>{
  const block=element('div',undefined,'api-contract-part'),fields=Array.isArray(body.fields)?body.fields as Field[]:[];
  block.append(element('h4',heading));
  const facts=[text(body.bodyType),text(body.contentType)].filter(Boolean);
  if(facts.length){const line=element('p',undefined,'api-contract-type');facts.forEach((fact,i)=>{if(i)line.append(' · ');line.append(element('code',fact));});block.append(line);}
  if(fields.length)block.append(fieldTable(fields));
  else if(!facts.length)block.append(element('p','沒有分析到內容。','muted'));
  return block;
 };
 const renderContract=(record:ApiRecord)=>{
  const contract=(index.graph.apiContracts||[]).find(c=>c.endpointId===record.node.id);if(!contract)return undefined;
  const request=(contract.request||{}) as Body,responses=(Array.isArray(contract.responses)?contract.responses:[]) as Body[];
  const fold=element('details',undefined,'api-contract');fold.append(element('summary','Request／Response'));
  fold.append(bodyBlock('Request',request));
  for(const response of responses)fold.append(bodyBlock(`Response ${text(response.status)}`.trim(),response));
  return fold;
 };

 const reason=(record:ApiRecord)=>record.note?`${record.note}：由系統設定進入，視為使用中。`
  :record.status==='IN_USE'?`${record.screens} 個畫面會呼叫這個 API。`
  :record.status==='UNREFERENCED'?'畫面中找不到呼叫這個 API 的地方。排程、其他系統或直接輸入網址仍可能使用，刪除前請先確認。'
  :'所有呼叫來源都已標記移除，依目前的標記可以移除。這是推導結果，不是刪除建議。';

 const renderDetail=()=>{
  detail.replaceChildren();
  const record=selected?byId.get(selected):undefined;
  if(!record){detail.append(element('p','選一個 API 查看詳情','empty-list'));return;}
  const inner=element('div',undefined,'api-detail-inner');inner.dataset.apiDetail=record.node.id;
  const title=element('div',undefined,'api-detail-title');title.append(methodBadge(record.method),element('code',record.path,'api-detail-path'),statusTag(record.status));
  const why=element('p',reason(record),record.note?'api-reason api-note':'api-reason');why.dataset.apiStatus=record.status;
  inner.append(title,why);
  const handlers=section('處理程式');handlers.dataset.apiSection='handlers';
  if(!record.handlers.length)handlers.append(element('p',NO_HANDLER,'muted'));
  for(const handler of record.handlers){
   const line=element('div',undefined,'api-handler');line.append(element('strong',handler.name));
   const source=handler.source||record.node.source;
   if(source?.file)line.append(element('code',`${source.file}${source.line?`:${source.line}`:''}`,'api-source'));
   handlers.append(line);
  }
  inner.append(handlers,renderCallers(record));
  const contract=renderContract(record);if(contract)inner.append(contract);
  detail.append(inner);detail.scrollTop=0;
 };

 renderControls();renderList();
 return root;
}
