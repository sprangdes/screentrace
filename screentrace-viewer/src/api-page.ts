import {endpointGroup} from './endpoint-presentation';
import {deriveApiUsage,ReviewState} from './shared/review';
import {componentLabelsForScreen} from './labels';
import {callerKind} from './usage';
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

export interface ApiPageOptions {selected?:string;onCaller:(screenId:string,componentId?:string)=>void}
type SortKey='path'|'status'|'callers';

export function apiPage(index:Index,state:ReviewState,options:ApiPageOptions):HTMLElement{
 const root=element('section',undefined,'api-page'),usage=deriveApiUsage(index.graph,state),statuses=apiStatuses(index,state);
 const records=apiEndpoints(index).map(node=>{
  const method=node.attributes.httpMethod||node.attributes.method||'ANY',path=node.attributes.path||node.attributes.route||node.name;
  const handlers=(index.graph.relationships||[]).filter(e=>e.type==='HANDLED_BY'&&e.from===node.id).map(e=>index.nodes.get(e.to)).filter((h):h is Node=>!!h);
  const callers=usage.get(node.id)!.callers,status=statuses.get(node.id)!;
  const handler=handlers.map(h=>h.name).sort().join('、');
  const searchable=[method,path,node.attributes.aliases||'',node.attributes.logicalPath||'',handler,apiStatusLabels[status],...callers.map(c=>`${index.nodes.get(c.screenId)?.name||''} ${c.componentId?componentLabelsForScreen(index,c.screenId).get(c.componentId)||'':''}`)].join(' ').toLowerCase();
  return {node,method,path,handler,callers,status,searchable,note:systemEntry(node,index)};
 });
 let filter:'ALL'|ApiStatus='ALL',sort:SortKey='path',ascending=true,open=options.selected;
 const toolbar=element('div',undefined,'api-toolbar'),search=element('input'),chips=element('div',undefined,'chips'),sorter=element('select'),list=element('div',undefined,'api-list');
 search.type='search';search.placeholder='搜尋 API、處理程式或畫面';search.setAttribute('aria-label','搜尋 API');
 chips.setAttribute('role','group');chips.setAttribute('aria-label','API 狀態篩選');
 sorter.setAttribute('aria-label','排序');
 for(const [value,label] of [['path','依 URL 排序'],['status','依狀態排序'],['callers','依呼叫來源數排序']] as const)sorter.append(new Option(label,value));
 sorter.onchange=()=>{sort=sorter.value as SortKey;ascending=sort!=='callers';render();};
 search.oninput=()=>render();
 const heading=element('div',undefined,'api-heading');
 heading.append(element('h1','API'),element('p',`${records.length} 個 API。狀態依目前的保留／移除標記即時計算；「未被使用」只代表畫面中找不到呼叫來源，排程或其他系統仍可能呼叫。`,'api-intro'));
 toolbar.append(search,sorter);
 root.append(heading,toolbar,chips,list);
 const order:Record<ApiStatus,number>={REMOVABLE:0,UNREFERENCED:1,IN_USE:2};
 const render=()=>{
  chips.replaceChildren();
  for(const value of ['ALL','IN_USE','UNREFERENCED','REMOVABLE'] as const){
   const count=value==='ALL'?records.length:records.filter(r=>r.status===value).length;
   const chip=element('button',`${value==='ALL'?'全部':apiStatusLabels[value]} ${count}`,'chip');
   chip.dataset.apiFilter=value;chip.setAttribute('aria-pressed',String(filter===value));
   chip.onclick=()=>{filter=value;render();};chips.append(chip);
  }
  const query=search.value.trim().toLowerCase();
  const rows=records.filter(r=>(filter==='ALL'||r.status===filter)&&(!query||r.searchable.includes(query))).sort((a,b)=>{
   const compare=sort==='status'?order[a.status]-order[b.status]:sort==='callers'?a.callers.length-b.callers.length:a.path.localeCompare(b.path,'en');
   return (ascending?compare:-compare)||a.path.localeCompare(b.path,'en')||a.method.localeCompare(b.method,'en');
  });
  list.replaceChildren();
  if(!rows.length)list.append(element('p','沒有符合的 API','empty-list'));
  for(const record of rows){
   const row=element('article',undefined,'api-row'),summary=element('button',undefined,'api-summary');
   row.dataset.apiRow=record.node.id;row.dataset.apiStatus=record.status;
   summary.setAttribute('aria-expanded',String(open===record.node.id));
   const method=element('span',record.method==='ANY'?'任何方法':record.method,'method-badge');method.dataset.method=record.method;
   const status=element('span',apiStatusLabels[record.status],'api-status');status.dataset.apiStatus=record.status;
   summary.append(method,element('code',record.path,'api-path'),element('span',record.handler||'找不到處理程式','api-handler'),element('span',`${record.callers.length} 個來源`,'api-caller-count'),status);
   summary.onclick=()=>{open=open===record.node.id?undefined:record.node.id;render();};
   row.append(summary);
   if(open===record.node.id){
    const detail=element('div',undefined,'api-detail');
    if(record.note)detail.append(element('p',`${record.note}：由系統設定進入，視為使用中。`,'api-note'));
    detail.append(element('h3','呼叫來源'));
    if(!record.callers.length)detail.append(element('p','畫面中找不到呼叫這個 API 的地方。','muted'));
    for(const caller of record.callers){
     const screen=index.nodes.get(caller.screenId)?.name||'畫面';
     const trigger=caller.componentId?componentLabelsForScreen(index,caller.screenId).get(caller.componentId)||'沒有文字的按鈕':callerKind(index,caller)==='unresolved'?'無法確定的觸發來源':'畫面載入時';
     const link=element('button',undefined,'api-caller');
     link.dataset.callerScreen=caller.screenId;if(caller.componentId)link.dataset.callerComponent=caller.componentId;
     link.append(element('strong',screen),element('span',trigger));
     link.onclick=()=>options.onCaller(caller.screenId,caller.componentId);
     detail.append(link);
    }
    row.append(detail);
   }
   list.append(row);
  }
 };
 render();
 return root;
}
