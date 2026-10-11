import {attachSimulation} from './simulation-ui';
import {inertDocument} from './inert-document';
import {iconSprite,icon,iconButton} from './shell-ui';
import {initializeComponentLabels} from './labels';
import {screenNames,NameHint} from './names';
import {Payload,requireGraph,requirePreview} from './contracts';
import {element,text} from './text';
import {indexGraph,searchScreens} from './map';
import {canvas,fileTree,CanvasTransform,CanvasView} from './canvas';
import {prototypeViewer} from './prototype';
import {PrototypeHistory} from './prototype-history';
import {apiPage} from './api-page';
import {screenPanel,emptyScreenPanel} from './screen-panel';
import {decisionLabel} from './review-ui';
import {previewDocument,previewSelector} from './preview';
import {generateMarkdown,importMarkdown,markdownSizeWarning} from './shared/review-md';
import {loadReview,saveReview,screenDecision,componentDecision,effectiveComponent,setScreen,setComponent,statistics,conflicts,ReviewState,Decision} from './shared/review';

type Filter='ALL'|'UNDECIDED'|'KEEP'|'REMOVE';
const root=document.querySelector<HTMLDivElement>('#app')!;

/** Fields from earlier report versions (reasons, notes, component library) that this report no longer uses. */
function withoutRetiredFields(state:ReviewState):{state:ReviewState;dropped:boolean}{
 const {decisionNotes,component_overrides,orphan_component_overrides,manifest_sha256,...rest}=state as ReviewState&Record<string,unknown>;
 const notes=decisionNotes as {screens?:object;components?:object}|undefined;
 const dropped=!!(notes&&(Object.keys(notes.screens||{}).length||Object.keys(notes.components||{}).length))||!!component_overrides||!!(orphan_component_overrides as unknown[]|undefined)?.length;
 return {state:rest as ReviewState,dropped};
}

try {
 const payload=JSON.parse(document.querySelector('#st-data')!.textContent!) as Payload;
 requirePreview(payload.preview,requireGraph(payload.graph));
 const sourceGraph=requireGraph(payload.graph),sourceIndex=indexGraph(sourceGraph),documentsByScreen=new Map<string,Document>(),dynamicScreens=new Set<string>(),hints=new Map<string,NameHint>();
 for(const screen of sourceIndex.screens){
  const parsed=inertDocument(payload.documents[screen.id]||'');documentsByScreen.set(screen.id,parsed);
  hints.set(screen.id,{title:parsed.querySelector('title')?.textContent||undefined,heading:parsed.querySelector('h1')?.textContent||undefined});
  if(payload.preview.screens?.find(item=>item.graphScreenId===screen.id)?.dynamicExpressions?.length)dynamicScreens.add(screen.id);
 }
 const displayNames=screenNames(sourceIndex.screens,hints,sourceIndex.routes);
 const graph={...sourceGraph,nodes:sourceGraph.nodes.map(node=>node.type==='SCREEN'?{...node,name:displayNames.get(node.id)||node.name}:node)},index=indexGraph(graph);
 initializeComponentLabels(index,documentsByScreen,dynamicScreens,payload.preview.elements||[]);
 const mdPayload:Payload={...payload,componentLibrary:undefined};
 const orderedScreens=[...index.screens].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')||(a.id<b.id?-1:a.id>b.id?1:0));

 let storage:Storage|undefined;
 try{storage=window.localStorage;}catch{}
 const restored=loadReview(storage,graph,payload.fingerprint),initial=withoutRetiredFields(restored.state);
 let reviewState=initial.state;

 // ---- view state
 let page:'screens'|'api'='screens',current:string|undefined,filter:Filter='ALL',listMode:'list'|'files'='list',query='',canvasTransform:CanvasTransform|undefined;
 let buttonsOpen=false,highlightComponent:string|undefined,selectedApi:string|undefined;
 const history=new PrototypeHistory();

 // ---- top bar
 const header=document.querySelector('header')!;header.classList.add('topbar');document.body.prepend(iconSprite());
 document.querySelector('#application')!.textContent=graph.application.name;document.querySelector<HTMLElement>('#application')!.title=graph.application.name;
 const tabs=element('nav',undefined,'page-tabs');tabs.setAttribute('aria-label','主要分頁');
 const screensTab=element('button',undefined,'page-tab'),apiTab=element('button',undefined,'page-tab');
 screensTab.append(icon('screen'),element('span','畫面'));apiTab.append(icon('api'),element('span','API'));
 screensTab.dataset.page='screens';apiTab.dataset.page='api';
 tabs.append(screensTab,apiTab);
 const actions=element('div',undefined,'topbar-actions');
 const progress=element('details',undefined,'progress-menu'),progressSummary=element('summary',undefined,'progress-button'),progressPanel=element('div',undefined,'popover progress-panel');
 progressSummary.setAttribute('aria-label','確認進度');progress.append(progressSummary,progressPanel);
 const saveStatus=element('span',undefined,'save-status');saveStatus.setAttribute('role','status');
 const download=element('button',undefined,'primary download-md');download.append(icon('import'),element('span','下載 md'));download.dataset.mdExport='true';
 const openMd=element('button',undefined,'secondary open-md');openMd.append(element('span','開啟 md'));openMd.dataset.mdImport='true';
 const fileInput=element('input');fileInput.type='file';fileInput.accept='.md,text/markdown,text/plain';fileInput.hidden=true;fileInput.setAttribute('aria-label','開啟 md');
 const help=element('details',undefined,'help-menu'),helpSummary=element('summary',undefined,'icon-button');
 helpSummary.setAttribute('aria-label','說明');helpSummary.title='說明';helpSummary.append(icon('question'));
 const helpPanel=element('div',undefined,'popover help-panel');
 helpPanel.append(element('h2','操作說明'));
 const helpList=(title:string,items:string[])=>{helpPanel.append(element('h3',title));const list=element('ul');for(const item of items)list.append(element('li',item));helpPanel.append(list);};
 helpList('快捷鍵',['k 保留、x 移除、u 未確認（作用於目前畫面，或右側欄中選取的按鈕）','n 前往下一個未確認的畫面','/ 搜尋畫面','Esc 返回畫布']);
 helpList('操作方式',['點畫布上的畫面查看完整預覽','在預覽中點連結或按鈕，會模擬前往的畫面','標記會自動暫存在這個瀏覽器；請用「下載 md」保存並交付']);
 helpList('狀態',['綠色勾：保留','紅色叉：移除','沒有標示：未確認','隨畫面移除：畫面標記移除時，沒有個別標記的按鈕一起移除']);
 helpList('ScreenTrace 看不到的事',['書籤或 Email 連結直接進入的畫面','排程、批次工作或其他系統直接呼叫的 API','比對不到已知網址格式的程式組成連結']);
 help.append(helpSummary,helpPanel);
 actions.append(progress,saveStatus,download,openMd,fileInput,help);
 header.append(tabs,actions);
 for(const menu of [progress,help])menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){event.stopPropagation();menu.open=false;menu.querySelector('summary')!.focus();}});
 document.addEventListener('click',event=>{for(const menu of [progress,help])if(menu.open&&!menu.contains(event.target as Node))menu.open=false;});

 // ---- shell
 const shell=element('div',undefined,'shell'),nav=element('nav',undefined,'sidebar'),main=element('main'),panel=element('aside',undefined,'details-panel');
 nav.setAttribute('aria-label','畫面清單');panel.setAttribute('aria-label','畫面資訊');
 const searchBox=element('div',undefined,'search-box'),search=element('input'),clearSearch=iconButton('清除搜尋','close');
 search.type='search';search.placeholder='搜尋 URL 或畫面名稱';search.setAttribute('aria-label','搜尋 URL 或畫面名稱');
 searchBox.append(icon('search'),search,clearSearch);
 const modes=element('div',undefined,'segmented'),listButton=element('button','清單'),filesButton=element('button','檔案結構');
 modes.setAttribute('role','group');modes.setAttribute('aria-label','清單顯示方式');modes.append(listButton,filesButton);
 const chips=element('div',undefined,'chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','依狀態篩選');
 const notices=element('div',undefined,'sidebar-notices'),list=element('div',undefined,'screen-list');
 nav.append(searchBox,modes,chips,notices,list);
 shell.append(nav,main,panel);
 if(restored.warning&&!restored.warning.includes('覆寫'))notices.append(element('p',restored.warning,'notice'));
 if(initial.dropped)notices.append(element('p','先前的進度含已不再使用的欄位（原因、備註、元件庫對應），已略過；保留／移除標記不受影響。','notice'));

 const visibleScreens=():Set<string>|undefined=>filter==='ALL'?undefined:new Set(index.screens.filter(s=>screenDecision(reviewState,s.id)===filter).map(s=>s.id));
 const persist=()=>{
  const failure=saveReview(storage,reviewState);
  saveStatus.textContent=failure?'⚠ 無法暫存在瀏覽器，請下載 md':'已暫存在此瀏覽器';
  saveStatus.dataset.state=failure?'error':'saved';
 };
 const changed=()=>{persist();render();};
 const decide={
  screen:(id:string,value:Decision)=>{reviewState=setScreen(reviewState,id,value);changed();},
  component:(screenId:string,componentId:string,value:Decision)=>{reviewState=setComponent(reviewState,screenId,componentId,value);highlightComponent=componentId;changed();}
 };

 const renderProgress=()=>{
  const counts=statistics(graph,reviewState),done=counts.screens.KEEP+counts.screens.REMOVE,total=index.screens.length,issues=conflicts(graph,reviewState);
  progressSummary.replaceChildren(element('span',`已確認 ${done}／${total}`),icon('more'));
  progressSummary.dataset.done=String(done);
  progressPanel.replaceChildren(element('h2','確認進度'));
  const row=(label:string,value:Filter,count:number)=>{const button=element('button',undefined,'progress-row');button.dataset.progressFilter=value;button.append(element('span',label),element('strong',String(count)));button.onclick=()=>{filter=value;progress.open=false;page='screens';render();};return button;};
  progressPanel.append(element('h3','畫面'),row('保留','KEEP',counts.screens.KEEP),row('移除','REMOVE',counts.screens.REMOVE),row('未確認','UNDECIDED',counts.screens.UNDECIDED));
  progressPanel.append(element('h3','按鈕'),element('p',`保留 ${counts.components.KEEP} · 移除 ${counts.components.REMOVE} · 隨畫面移除 ${counts.inherited}`,'muted'));
  const conflictBox=element('div',undefined,'progress-conflicts');conflictBox.dataset.conflictCount=String(issues.length);
  conflictBox.append(element('h3',`衝突 ${issues.length} 個`));
  if(!issues.length)conflictBox.append(element('p','沒有衝突','muted'));
  for(const issue of issues){const link=element('button',`${index.nodes.get(issue.screenId)?.name||'畫面'} → ${index.nodes.get(issue.targetScreenId)?.name||'畫面'}`,'link-row');link.onclick=()=>{progress.open=false;openScreen(issue.screenId,{component:issue.componentId});};conflictBox.append(link);}
  progressPanel.append(conflictBox);
 };

 const renderSidebar=()=>{
  const counts=statistics(graph,reviewState).screens;
  chips.replaceChildren();
  for(const value of ['ALL','UNDECIDED','KEEP','REMOVE'] as const){
   const chip=element('button',`${value==='ALL'?'全部':decisionLabel(value)} ${value==='ALL'?index.screens.length:counts[value]}`,'chip');
   chip.dataset.stateFilter=value;chip.setAttribute('aria-pressed',String(filter===value));
   chip.onclick=()=>{filter=value;render();};chips.append(chip);
  }
  listButton.setAttribute('aria-pressed',String(listMode==='list'));filesButton.setAttribute('aria-pressed',String(listMode==='files'));
  const visible=visibleScreens(),matches=searchScreens(index,query);
  if(listMode==='files'){list.replaceChildren(fileTree(index,query,id=>openScreen(id),{visible,current}));return;}
  list.replaceChildren();
  for(const screen of orderedScreens){
   if((visible&&!visible.has(screen.id))||(query&&!matches.has(screen.id)))continue;
   const status=screenDecision(reviewState,screen.id),button=element('button',undefined,'screen-row');
   button.dataset.screenList=screen.id;button.dataset.decision=status;
   button.setAttribute('aria-current',current===screen.id?'page':'false');
   const label=element('span',undefined,'screen-row-text');label.append(element('strong',screen.name),element('code',index.routes.get(screen.id)?.[0]||text.noUrl));
   button.append(label);
   if(status!=='UNDECIDED'){const mark=icon(status==='KEEP'?'check':'close');mark.classList.add('status-mark',`decision-${status}`);mark.setAttribute('role','img');mark.setAttribute('aria-label',decisionLabel(status));button.append(mark);}
   button.onclick=()=>openScreen(screen.id);
   list.append(button);
  }
  if(!list.childElementCount)list.append(element('p','沒有符合的畫面','empty-list'));
 };

 const renderPanel=()=>{
  if(page==='api'||!current){emptyScreenPanel(panel);return;}
  const shown=panel.querySelector<HTMLDetailsElement>(`[data-screen-panel="${CSS.escape(current)}"] .panel-buttons`);
  if(shown)buttonsOpen=shown.open||buttonsOpen&&!!highlightComponent;
  screenPanel(panel,index,reviewState,current,{
   setScreen:decide.screen,setComponent:decide.component,focus:id=>openScreen(id),api:id=>showApi(id),
   buttonsOpen,onButtonsToggle:open=>{buttonsOpen=open;},highlight:highlightComponent
  });
  if(highlightComponent)requestAnimationFrame(()=>panel.querySelector(`[data-component-row="${CSS.escape(highlightComponent!)}"]`)?.scrollIntoView({block:'nearest'}));
 };

 // ---- main area: the canvas (zooming into the open screen) or the API page
 let simulation:ReturnType<typeof attachSimulation>|undefined,view:CanvasView|undefined,frame:HTMLIFrameElement|undefined,viewer:HTMLElement|undefined;
 const thumbnail=(id:string)=>{const value=payload.preview.screens?.find(s=>s.graphScreenId===id)?.thumbnail;return value?.startsWith('data:image/')?value:undefined;};
 const canvasState=()=>({query,visible:visibleScreens(),screenStatus:(id:string)=>screenDecision(reviewState,id)});
 const nodesFor=(doc:Document,id:string,component:string)=>{const nodes=new Set<HTMLElement>(doc.querySelectorAll<HTMLElement>(`[data-st-component-id="${CSS.escape(component)}"]`));for(const record of payload.preview.elements||[])if(record.graphScreenId===id&&record.graphComponentId===component)try{const node=doc.querySelector<HTMLElement>(previewSelector(record.path));if(node)nodes.add(node);}catch{}return [...nodes];};
 /** Decision outlines and badges inside the preview, reapplied in place whenever decisions change. */
 const decorate=(doc:Document,id:string)=>{
  doc.querySelectorAll('[data-review-badge]').forEach(node=>node.remove());
  doc.querySelectorAll<HTMLElement>('[data-review-status],[data-spotlight]').forEach(node=>{node.style.outline=node.dataset.originalOutline||'';delete node.dataset.reviewStatus;delete node.dataset.spotlight;});
  for(const record of payload.preview.elements||[]){
   if(record.graphScreenId!==id||!record.graphComponentId)continue;
   const decided=componentDecision(reviewState,id,record.graphComponentId)!=='UNDECIDED',spotlight=record.graphComponentId===highlightComponent;
   if(!decided&&!spotlight)continue;
   let node:HTMLElement|null=null;try{node=doc.querySelector<HTMLElement>(previewSelector(record.path));}catch{continue;}
   if(!node)continue;
   if(node.dataset.originalOutline===undefined)node.dataset.originalOutline=node.style.outline;
   if(spotlight){node.style.outline='3px solid #eab308';node.dataset.spotlight='true';}
   if(!decided)continue;
   const effective=effectiveComponent(reviewState,id,record.graphComponentId),color=effective==='KEEP'?'#1d6b45':'#9e3410';
   node.dataset.reviewStatus=effective;if(!spotlight)node.style.outline=`3px solid ${color}`;
   const badge=doc.createElement('span');badge.dataset.reviewBadge=record.graphComponentId;badge.textContent=decisionLabel(effective);
   badge.style.cssText=`display:inline-block;background:${color};color:white;font:600 11px system-ui;padding:2px 5px;border-radius:4px;pointer-events:none;`;
   if(node.localName==='input')node.insertAdjacentElement('afterend',badge);else node.append(badge);
  }
 };
 const renderFocus=(id:string,host:HTMLElement)=>{
  const preview=element('section',undefined,'preview'),notice=element('span','示意畫面：資料為範例值，不是真實系統','preview-notice');
  frame=element('iframe');simulation=undefined;
  const own=frame;
  preview.setAttribute('aria-busy','true');
  own.setAttribute('sandbox','allow-same-origin');own.title=index.nodes.get(id)!.name;
  own.onload=()=>{
   const doc=own.contentDocument;if(!doc||!own.getAttribute('srcdoc'))return;
   preview.setAttribute('aria-busy','false');
   doc.addEventListener('keydown',onKey);
   simulation=attachSimulation(payload,id,own,viewer!,{focus:target=>openScreen(target),api:target=>showApi(target),thumbnail});
   doc.querySelector('[data-spotlight]')?.scrollIntoView({block:'center'});
  };
  own.srcdoc=previewDocument(payload,id,doc=>decorate(doc,id));
  preview.append(own,notice);
  const scroll=history.current?.screenId===id?history.current.scroll:0;
  viewer=prototypeViewer(index,payload,id,preview,own,history,{back:()=>showCanvas(),focus:target=>openScreen(target),move:delta=>{const visit=history.move(delta,viewerScroll());if(visit)openScreen(visit.screenId,{push:false});},scroll});
  host.replaceChildren(viewer);
 };
 const highlightTriggers=(triggers:string[]|undefined)=>{
  const doc=frame?.contentDocument;if(!doc||!current)return;
  doc.querySelectorAll<HTMLElement>('[data-line-trigger]').forEach(node=>{node.style.outline=node.dataset.lineTrigger||'';delete node.dataset.lineTrigger;});
  for(const component of triggers||[])for(const node of nodesFor(doc,current,component)){node.dataset.lineTrigger=node.style.outline;node.style.outline='3px solid #2347c5';node.scrollIntoView({block:'nearest'});}
 };
 const ensureCanvas=()=>{
  if(view&&main.contains(view.element))return view;
  view=canvas(index,payload,{...canvasState(),transform:canvasTransform,onTransformChange:state=>{canvasTransform=state;},onOpen:id=>openScreen(id),renderFocus,onLineHover:highlightTriggers,onExitRequest:()=>showCanvas()});
  main.replaceChildren(view.element);
  return view;
 };
 const viewerScroll=()=>viewer?.querySelector('.prototype-scroll')?.scrollTop||0;

 const render=()=>{
  shell.dataset.page=page;
  screensTab.setAttribute('aria-current',page==='screens'?'page':'false');apiTab.setAttribute('aria-current',page==='api'?'page':'false');
  renderProgress();renderSidebar();renderPanel();
  if(page==='api'){
   const apis=apiPage(index,reviewState,{selected:selectedApi,onCaller:(screenId,componentId)=>openScreen(screenId,{component:componentId})});
   const hint=(graph.diagnostics as {code?:string;evidence?:unknown}[]|undefined||[]).find(d=>d?.code==='CONTEXT_PATH_HINT');
   if(hint){const note=element('p',`有 ${Array.isArray(hint.evidence)?hint.evidence.length:0} 個呼叫因為網址前綴無法確認，相關 API 可能被誤列為未被使用；請分析人員以 ./bin/screentrace config 設定 context path 後重新分析。`,'notice');note.dataset.contextPathReminder='true';apis.querySelector('.api-heading')?.append(note);}
   main.replaceChildren(apis);view=undefined;frame=undefined;viewer=undefined;simulation=undefined;
   return;
  }
  const canvasView=ensureCanvas();canvasView.update(canvasState());
  if(current&&canvasView.focused!==current)canvasView.focus(current);
  else if(!current&&canvasView.focused)canvasView.exit();
  else if(current&&frame?.contentDocument)decorate(frame.contentDocument,current);
 };

 const openScreen=(id:string,options:{component?:string;push?:boolean}={})=>{
  if(options.push!==false){if(!current||page!=='screens')history.start(id);else history.visit(id,viewerScroll());}
  if(current!==id)buttonsOpen=false;
  highlightComponent=options.component;if(options.component)buttonsOpen=true;
  if(current!==id){frame=undefined;viewer=undefined;simulation=undefined;}
  page='screens';current=id;render();
 };
 const showCanvas=()=>{page='screens';current=undefined;highlightComponent=undefined;frame=undefined;viewer=undefined;simulation=undefined;render();};
 const showApi=(id?:string)=>{page='api';selectedApi=id;current=undefined;render();};
 screensTab.onclick=()=>{if(page!=='screens'||current)showCanvas();};
 apiTab.onclick=()=>showApi();
 listButton.onclick=()=>{listMode='list';renderSidebar();};
 filesButton.onclick=()=>{listMode='files';renderSidebar();};
 let searchTimer:ReturnType<typeof setTimeout>|undefined;
 const applySearch=()=>{renderSidebar();if(page==='screens')view?.update(canvasState());};
 search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=search.value.trim();applySearch();},150);};
 clearSearch.onclick=()=>{search.value='';query='';applySearch();search.focus();};

 // ---- md download / open
 download.onclick=async()=>{
  download.disabled=true;
  try{
   const md=await generateMarkdown(mdPayload,reviewState),url=URL.createObjectURL(new Blob([md],{type:'text/markdown;charset=utf-8'})),link=element('a');
   link.href=url;link.download='screentrace-review.md';link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   saveStatus.textContent=markdownSizeWarning(md)?'md 超過 5 MB，仍完整下載':'已下載 md';saveStatus.dataset.state='saved';
  }catch(error){saveStatus.textContent=`下載失敗：${String(error)}`;saveStatus.dataset.state='error';}
  finally{download.disabled=false;}
 };
 openMd.onclick=()=>fileInput.click();
 fileInput.onchange=async()=>{
  const file=fileInput.files?.[0];if(!file)return;
  try{
   if(file.size>64*1024*1024)throw Error('檔案超過 64 MiB 安全上限');
   const imported=await importMarkdown(await file.text(),mdPayload),clean=withoutRetiredFields(imported.state);
   reviewState=clean.state;persist();
   notices.querySelectorAll('[data-import-notice]').forEach(n=>n.remove());
   const messages=[imported.changed?'分析結果已變更，部分標記可能對應不到目前的畫面。':'',imported.orphans.length?`有 ${imported.orphans.length} 筆標記找不到對應的畫面或按鈕，已保留在檔案中。`:'',clean.dropped?'檔案含已不再使用的欄位（原因、備註、元件庫對應），已略過。':''].filter(Boolean);
   for(const message of messages){const note=element('p',message,'notice');note.dataset.importNotice='true';notices.append(note);}
   if(imported.orphans.length){const list=element('ul',undefined,'notice orphan-list');list.dataset.importNotice='true';list.dataset.mdOrphans='true';for(const orphan of imported.orphans)list.append(element('li',`${orphan.screenId}${orphan.componentId?` / ${orphan.componentId}`:''}`));notices.append(list);}
   saveStatus.textContent='已開啟 md';saveStatus.dataset.state='saved';render();
  }catch(error){saveStatus.textContent=`開啟失敗：${String(error)}`;saveStatus.dataset.state='error';}
  finally{fileInput.value='';}
 };

 // ---- keyboard
 const nextUndecided=()=>{
  const ids=orderedScreens.map(s=>s.id),start=current?ids.indexOf(current):-1;
  for(let step=1;step<=ids.length;step++){const id=ids[(start+step+ids.length)%ids.length];if(screenDecision(reviewState,id)==='UNDECIDED'){openScreen(id);return;}}
  saveStatus.textContent='全部畫面都已確認';
 };
 const onKey=(event:KeyboardEvent)=>{
  const target=event.target as Element|null,editable=target?.closest?.('input,textarea,select,[contenteditable="true"]');
  if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)&&page==='screens'&&current){event.preventDefault();const visit=history.move(event.key==='ArrowLeft'?-1:1,viewerScroll());if(visit)openScreen(visit.screenId,{push:false});return;}
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='Escape'){
   if(simulation?.closeDialog())return;
   if(page==='screens'&&current){event.preventDefault();showCanvas();}
   return;
  }
  if(editable)return;
  const key=event.key.toLowerCase();
  if(key==='/'){event.preventDefault();if(page!=='screens'){page='screens';render();}search.focus();return;}
  if(key==='n'&&page==='screens'){event.preventDefault();nextUndecided();return;}
  const value=({k:'KEEP',x:'REMOVE',u:'UNDECIDED'} as Record<string,Decision>)[key];
  if(!value||page!=='screens'||!current)return;
  event.preventDefault();
  const row=(document.activeElement as Element|null)?.closest?.('[data-component-row]') as HTMLElement|null;
  if(row)decide.component(current,row.dataset.componentRow!,value);else decide.screen(current,value);
 };
 document.addEventListener('keydown',onKey);

 saveStatus.textContent=storage?'已暫存在此瀏覽器':'⚠ 無法暫存在瀏覽器，請下載 md';saveStatus.dataset.state=storage?'saved':'error';
 render();
 root.replaceChildren(shell);
 root.dataset.ready='true';
} catch(error) {
 root.replaceChildren(element('p',String(error)));
 root.dataset.error='true';
}
