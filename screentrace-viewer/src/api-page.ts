import {Index} from './map';
import {ReviewState,deriveApiUsage} from './shared/review';
import {callSources,callerKind} from './usage';
import {element,text} from './text';

type Caller={screenId:string;componentId?:string;behaviorId?:string};
type ApiRecord={id:string;method:string;path:string;handler:string;status:string;callers:Caller[];searchable:string};

export function apiPage(index:Index,state:ReviewState,onDetail:(id:string)=>void,onCaller?:(screenId:string,componentId?:string)=>void):HTMLElement {
 const root=element('section',undefined,'api-page');root.append(element('h2',text.apis),element('p',text.external,'notice'));
 const search=element('input');search.type='text';search.setAttribute('aria-label',text.apiSearch);search.placeholder=text.apiSearch;
 const status=element('select');status.setAttribute('aria-label',text.apiFilter);const labels={IN_USE:text.inUse,REMOVABLE:text.removable,UNREFERENCED:text.unreferenced};
 for(const value of ['ALL','IN_USE','REMOVABLE','UNREFERENCED']as const){const option=element('option',value==='ALL'?text.all:labels[value]);option.value=value;status.append(option);}
 const methodFilter=element('select');methodFilter.setAttribute('aria-label','API 方法篩選');
 const methods=[...new Set(index.graph.nodes.filter(n=>n.type==='ENDPOINT').map(n=>n.attributes.httpMethod||n.attributes.method||'ANY'))].sort();
 for(const method of ['ALL',...methods]){const option=element('option',method==='ALL'?'所有方法':method);option.value=method;methodFilter.append(option);}
 const table=element('table'),head=element('thead'),body=element('tbody'),heading=element('tr');let sort='method',ascending=true;
 for(const [key,label]of [['method',text.method],['path',text.path],['handler',text.handlers],['status',text.status],['callers',text.callerCount]]){const th=element('th'),button=element('button',label);button.setAttribute('aria-label',`${text.sortBy}${label}${text.sortSuffix}`);button.onclick=()=>{ascending=sort===key?!ascending:true;sort=key;render();};th.append(button);heading.append(th);}
 heading.append(element('th','呼叫來源摘要'));head.append(heading);table.append(head,body);root.append(search,status,methodFilter,table);
 const usage=deriveApiUsage(index.graph,state);
 const records:ApiRecord[]=index.graph.nodes.filter(n=>n.type==='ENDPOINT').map(n=>{const method=n.attributes.httpMethod||n.attributes.method||'ANY',path=n.attributes.path||n.attributes.route||n.name,handler=(index.graph.relationships||[]).filter(e=>e.type==='HANDLED_BY'&&e.from===n.id).map(e=>{const target=index.nodes.get(e.to);return `${target?.name||e.to}${target?.source?` · ${target.source.file}:${target.source.line}`:''}`;}).sort().join('\n'),callers=usage.get(n.id)!.callers,searchable=[method,path,handler,labels[usage.get(n.id)!.status],...callers.map(c=>`${index.nodes.get(c.screenId)?.name||''} ${c.componentId?index.nodes.get(c.componentId)?.name||'':''}`)].join(' ').toLowerCase();return{id:n.id,method,path,handler,status:usage.get(n.id)!.status,callers,searchable};});
 const callerLabel=(caller:Caller,apiId:string)=>{const screen=index.nodes.get(caller.screenId)?.name||'畫面';if(caller.componentId)return `${screen} › ${index.nodes.get(caller.componentId)?.name||'可操作項目'}`;const behavior=index.graph.behaviors?.find(b=>b.id===caller.behaviorId);return `${screen} › ${callerKind(index,caller)==='unresolved'?`未解析呼叫來源${behavior?.event?` · ${behavior.event}`:''}`:'畫面載入'}`;};
 const callerButton=(caller:Caller,apiId:string)=>{const button=element('a',callerLabel(caller,apiId));button.href='#';button.dataset.apiCaller=apiId;button.onclick=event=>{event.preventDefault();onCaller?.(caller.screenId,caller.componentId);};return button;};
 const render=()=>{const query=search.value.toLowerCase(),rows=records.filter(r=>(status.value==='ALL'||r.status===status.value)&&(methodFilter.value==='ALL'||r.method===methodFilter.value)&&(!query||r.searchable.includes(query))).sort((a,b)=>{const av=a[sort as keyof ApiRecord],bv=b[sort as keyof ApiRecord],left=typeof av==='number'?av:String(av),right=typeof bv==='number'?bv:String(bv),comparison=left<right?-1:left>right?1:a.id<b.id?-1:a.id>b.id?1:0;return ascending?comparison:-comparison;});body.replaceChildren();for(const record of rows){const tr=element('tr',undefined,'api-row');tr.dataset.apiRow=record.id;tr.append(element('td',record.method));const path=element('td'),button=element('button',record.path);button.onclick=()=>onDetail(record.id);path.append(button);tr.append(path,element('td',record.handler||text.noHandler),element('td',labels[record.status as keyof typeof labels]),element('td',String(record.callers.length)));const summary=element('td',undefined,'api-caller-summary');for(const caller of record.callers.slice(0,3))summary.append(callerButton(caller,record.id));if(record.callers.length>3){const more=element('details',undefined,'api-extra-callers');more.append(element('summary',`＋${record.callers.length-3} 個`));for(const caller of record.callers.slice(3))more.append(callerButton(caller,record.id));summary.append(more);}tr.append(summary);body.append(tr);}};
 search.oninput=render;status.onchange=render;methodFilter.onchange=render;render();return root;
}
