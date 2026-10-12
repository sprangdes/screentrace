import {Index} from './map';
import {Node} from './contracts';
import {element,text} from './text';
import {componentLabelsForScreen} from './labels';
import {callSources} from './usage';
import {jsfLimitation} from './unsupported-framework';
import {apiEndpoints} from './api-page';
import {sharedNavigation} from './relations';
import {decisionSwitch,decisionLabel} from './review-ui';
import {ReviewState,Decision,screenDecision,componentDecision,markableComponents,conflicts} from './shared/review';

export interface ScreenPanelActions {
 setScreen:(screenId:string,value:Decision)=>void;
 setComponent:(screenId:string,componentId:string,value:Decision)=>void;
 focus:(screenId:string)=>void;
 api:(endpointId:string)=>void;
 buttonsOpen:boolean;
 onButtonsToggle:(open:boolean)=>void;
 highlight?:string;
}

const endpointLabel=(node:Node)=>{const method=node.attributes.httpMethod||node.attributes.method||'ANY';return `${method==='ANY'?'任何方法':method} ${node.attributes.path||node.attributes.route||node.name}`;};

/** What a component leads to, phrased for people: destination screens and called APIs. */
function outcomes(index:Index,componentId:string,apis:Set<string>):string[]{
 const targets=[...(index.graph.relationships||[]).filter(e=>e.from===componentId).map(e=>e.to),...(index.graph.behaviors||[]).filter(b=>b.triggerId===componentId&&b.targetId).map(b=>b.targetId!)];
 const result=new Set<string>();
 for(const id of targets){const node=index.nodes.get(id);if(node?.type==='SCREEN')result.add(`前往「${node.name}」`);else if(node&&apis.has(node.id))result.add(endpointLabel(node));}
 return [...result];
}

/** Templates included by the screen; their buttons (page header／footer) are grouped separately. */
function fragmentFiles(index:Index,screenId:string):Set<string>{
 return new Set((index.graph.relationships||[]).filter(e=>e.type==='INCLUDES'&&e.from===screenId).map(e=>index.nodes.get(e.to))
  .filter(n=>n&&[n.type,n.attributes.kind,n.attributes.type].includes('TEMPLATE_FRAGMENT')).map(n=>n!.source?.file).filter((f):f is string=>!!f));
}

export function screenPanel(panel:HTMLElement,index:Index,state:ReviewState,screenId:string,actions:ScreenPanelActions):void{
 const screen=index.nodes.get(screenId)!,routes=index.routes.get(screenId)||[],decision=screenDecision(state,screenId),labels=componentLabelsForScreen(index,screenId);
 const apis=new Set(apiEndpoints(index).map(n=>n.id));
 const root=element('div',undefined,'screen-panel');root.dataset.screenPanel=screenId;
 const header=element('section',undefined,'panel-header');
 header.append(element('h2',screen.name));
 const url=element('code',routes[0]||text.noUrl,'panel-url');url.title=routes.join('\n');header.append(url);
 if(routes.length>1){const more=element('details',undefined,'panel-routes');more.append(element('summary',`其他網址 ${routes.length-1} 個`));for(const route of routes.slice(1))more.append(element('code',route));header.append(more);}
 header.append(decisionSwitch('這個畫面',decision,value=>actions.setScreen(screenId,value),{screen:screenId}));
 root.append(header);

 const notices=element('section',undefined,'panel-notices');
 if(screen.attributes.unsupportedComponentFramework==='JSF'){const count=index.screens.filter(s=>s.attributes.unsupportedComponentFramework==='JSF').length,note=element('p',jsfLimitation(count),'notice');note.dataset.jsfReminder='true';notices.append(note);}
 for(const issue of conflicts(index.graph,state).filter(c=>c.screenId===screenId||c.targetScreenId===screenId)){
  const note=element('p',`「${index.nodes.get(issue.screenId)?.name||'畫面'}」保留的「${componentLabelsForScreen(index,issue.screenId).get(issue.componentId)||'按鈕'}」會前往已標記移除的「${index.nodes.get(issue.targetScreenId)?.name||'畫面'}」。`,'notice conflict');
  note.dataset.conflict=`${issue.screenId}:${issue.componentId}`;notices.append(note);
 }
 if(notices.childElementCount)root.append(notices);

 const keys=markableComponents(index.graph).filter(k=>k.screenId===screenId),fragments=fragmentFiles(index,screenId);
 const buttons=element('details',undefined,'panel-section panel-buttons');buttons.open=actions.buttonsOpen;buttons.dataset.section='buttons';
 const decided=keys.filter(k=>componentDecision(state,screenId,k.componentId)!=='UNDECIDED').length;
 buttons.append(element('summary',`按鈕 ${keys.length} 個${decided?` · 已標記 ${decided}`:''}`));
 buttons.addEventListener('toggle',()=>actions.onButtonsToggle(buttons.open));
 if(!keys.length)buttons.append(element('p','這個畫面沒有可標記的按鈕','muted'));
 else buttons.append(element('p',decision==='REMOVE'?'畫面已標記移除，未個別標記的按鈕隨畫面移除。':'沒有個別標記的按鈕跟著畫面的決定。','muted'));
 const row=(componentId:string)=>{
  const value=componentDecision(state,screenId,componentId),name=labels.get(componentId)||'沒有文字的按鈕',item=element('div',undefined,'button-row');
  item.dataset.componentRow=componentId;item.tabIndex=-1;
  if(actions.highlight===componentId)item.classList.add('is-highlighted');
  const info=element('div',undefined,'button-info'),result=outcomes(index,componentId,apis);
  info.append(element('strong',name),element('span',result.length?result.join(' · '):'目的地無法確定','muted'));
  if(decision==='REMOVE'&&value==='UNDECIDED')info.append(element('span',decisionLabel('INHERITED_REMOVE'),'inherited-tag'));
  item.append(info,decisionSwitch(name,value,next=>actions.setComponent(screenId,componentId,next),{compact:true,screen:screenId,component:componentId}));
  return item;
 };
 const own=keys.filter(k=>!fragments.has(index.nodes.get(k.componentId)?.source?.file||'')),shared=keys.filter(k=>!own.includes(k));
 for(const key of own)buttons.append(row(key.componentId));
 if(shared.length){const group=element('details',undefined,'fragment-group');group.append(element('summary',`頁首、頁尾的按鈕 ${shared.length} 個`));for(const key of shared)group.append(row(key.componentId));buttons.append(group);}
 root.append(buttons);

 const called=[...callSources(index.graph)].filter(([api,callers])=>apis.has(api)&&callers.some(c=>c.screenId===screenId)).map(([api])=>index.nodes.get(api)!).sort((a,b)=>endpointLabel(a).localeCompare(endpointLabel(b),'en'));
 const apiSection=element('section',undefined,'panel-section');apiSection.dataset.section='apis';
 apiSection.append(element('h3',`呼叫的 API ${called.length} 個`));
 if(!called.length)apiSection.append(element('p','沒有已知的 API 呼叫','muted'));
 for(const node of called){const link=element('button',endpointLabel(node),'link-row');link.dataset.api=node.id;link.onclick=()=>actions.api(node.id);apiSection.append(link);}
 root.append(apiSection);

 const sources=[...new Set(index.relations.filter(r=>r.to===screenId&&r.from!==screenId).map(r=>r.from))].map(id=>index.nodes.get(id)!).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
 const inbound=element('section',undefined,'panel-section');inbound.dataset.section='inbound';
 inbound.append(element('h3',`從哪些畫面可來到這裡 ${sources.length} 個`));
 if(!sources.length)inbound.append(element('p','畫面中找不到前往這裡的連結；可能由網址、書籤或其他系統直接進入。','muted'));
 // Sources reached only through header/footer links are grouped, matching the single shared line on the preview.
 const navigation=sharedNavigation(index,screenId),viaShared=new Set(navigation.into);
 const sourceRow=(source:Node)=>{const link=element('button',source.name,'link-row');link.dataset.inbound=source.id;link.onclick=()=>actions.focus(source.id);return link;};
 for(const source of sources)if(!viaShared.has(source.id))inbound.append(sourceRow(source));
 if(viaShared.size){
  const group=element('details',undefined,'fragment-group inbound-shared'),summary=element('summary',`透過頁首／頁尾連結 ${viaShared.size} 個畫面`);
  group.append(summary);if(navigation.intoLabels.length)group.append(element('p',`連結：${navigation.intoLabels.join('、')}`,'muted'));
  for(const source of sources)if(viaShared.has(source.id))group.append(sourceRow(source));
  inbound.append(group);
 }
 root.append(inbound);
 panel.replaceChildren(root);
}

