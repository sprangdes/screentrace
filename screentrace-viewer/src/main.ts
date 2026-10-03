import {matchLibrary,libraryLabel} from './shared/library';
import {projectText} from './shared/review-md';
import {libraryDetails,libraryOverride} from './library-ui';
import {setOverride} from './shared/review';
import {Payload,requireGraph} from './contracts';
import {element,text} from './text';
import {indexGraph} from './map';
import {canvas,fileTree} from './canvas';
import {focusRelation} from './relations';
import {apiPage} from './api-page';
import {mdControls} from './md-controls';
import {screenPanel,elementDetail,apiDetail} from './details';
import {previewDocument,previewElement} from './preview';
import {emptyReview,loadReview,saveReview,screenDecision,componentDecision,effectiveComponent,setScreen,setComponent,statistics,markableComponents,conflicts,StorageLike} from './shared/review';
import {decisionControl,decisionLabel} from './review-ui';
const root=document.querySelector<HTMLDivElement>('#app')!;
try {
 const payload=JSON.parse(document.querySelector('#st-data')!.textContent!) as Payload;
 const graph=requireGraph(payload.graph),index=indexGraph(graph);
 document.querySelector('#application')!.textContent=graph.application.name;
 const shell=element('div',undefined,'shell'),nav=element('nav'),main=element('main'),panel=element('aside');
 nav.setAttribute('aria-label','主要導覽');panel.append(element('h2',text.info));
 const libraryBox=element('section');libraryBox.dataset.librarySummary='true';if(payload.componentLibrary){const result=matchLibrary(graph,payload.componentLibrary);libraryBox.append(element('h3',projectText(libraryLabel(payload.componentLibrary))),element('p',payload.componentLibrary.sha256));for(const row of result.coverage)libraryBox.append(element('p',`${projectText(row.kind)} 已對應 ${row.matched} 未對應 ${row.unmatched} 歧義 ${row.ambiguous}`));}else libraryBox.append(element('p','未匯入元件庫'));nav.append(libraryBox);
 const screens=element('button',text.screens),apis=element('button',text.apis),overview=element('button',text.overview),files=element('button',text.files),search=element('input');
 search.type='text';search.setAttribute('aria-label',text.search);search.placeholder=text.search;nav.append(screens,apis,overview,files,search);
 const diagnostics=[...(graph.diagnostics||[]),...(payload.preview.diagnostics||[]),...(Array.isArray(payload.manifest.diagnostics)?payload.manifest.diagnostics:[])];if(diagnostics.length){const box=element('details',undefined,'analysis-diagnostics');const codes=diagnostics.map(d=>typeof d==='object'&&d?String((d as {code?:string}).code||''):String(d));box.append(element('summary',`${text.diagnostics} (${diagnostics.length}) ${codes.join(' / ')}`),element('pre',JSON.stringify(diagnostics,null,2)));nav.append(box);}
 let mode='overview',current:string|undefined;const history:string[]=[];
 let storage:StorageLike|undefined;try{storage=window.localStorage;}catch{}const restored=loadReview(storage,graph,payload.fingerprint,payload.componentLibrary);let reviewState=restored.state,review=false;
 const orphanBox=element('section',undefined,'library-orphans');nav.append(orphanBox);
 const warning=element('p',restored.warning,'storage-warning'),stats=element('div',undefined,'review-statistics'),conflictList=element('div',undefined,'conflicts');nav.append(warning,stats,conflictList);
 const toggleLabel=element('label',text.review),toggle=element('input');toggle.type='checkbox';toggle.setAttribute('aria-label',text.review);toggleLabel.prepend(toggle);nav.append(toggleLabel);
 const filter=element('select');filter.setAttribute('aria-label',text.stateFilter);for(const value of ['ALL','UNDECIDED','KEEP','REMOVE','INHERITED_REMOVE']){const option=element('option',value==='ALL'?text.all:decisionLabel(value as 'KEEP'));option.value=value;filter.append(option);}nav.append(filter);
 const summaries=()=>{orphanBox.replaceChildren();for(const orphan of reviewState.orphan_component_overrides||[])orphanBox.append(element('p',`Orphan ${projectText(orphan.screenId)} / ${projectText(orphan.componentId)} / ${projectText(orphan.libraryComponentId)} / ${projectText(orphan.manifest_sha256)}`));stats.hidden=conflictList.hidden=!review;const counts=statistics(graph,reviewState);stats.replaceChildren(element('h3',text.statistics));for(const [label,values]of [[text.screens,counts.screens],[text.components,counts.components]]as const)stats.append(element('p',`${label} ${text.undecided}: ${values.UNDECIDED} ${text.keep}: ${values.KEEP} ${text.remove}: ${values.REMOVE}`));stats.append(element('p',`${text.inherited}: ${counts.inherited}`));conflictList.replaceChildren(element('h3',text.conflicts));for(const c of conflicts(graph,reviewState))conflictList.append(element('p',`${index.nodes.get(c.screenId)?.name}: ${index.nodes.get(c.componentId)?.name} → ${index.nodes.get(c.targetScreenId)?.name}`));};
 const changed=()=>{const failure=saveReview(storage,reviewState);if(failure)warning.textContent=failure;summaries();if(current)focus(current);else show();};
 nav.append(mdControls(payload,()=>reviewState,state=>{reviewState=state;changed();}));
 const decorate=(id:string,parent:HTMLElement)=>parent.append(decisionControl(text.screenDecision,screenDecision(reviewState,id),value=>{reviewState=setScreen(reviewState,id,value);changed();},id));
 const focus=(id:string,component?:string,push=true)=>{
  if(current&&current!==id&&push)history.push(current);current=id;
  const screen=index.nodes.get(id)!;main.replaceChildren(element('h2',screen.name));
  const back=element('button',text.back);back.disabled=!history.length;back.onclick=()=>{const previous=history.pop();if(previous)focus(previous,undefined,false);};main.append(back,element('p',text.notice,'notice'));if(review)decorate(id,main);
  const metadata=payload.preview.screens?.find(s=>s.graphScreenId===id);if(metadata?.dynamicExpressions?.length)main.append(element('pre',metadata.dynamicExpressions.join('\n')));
  if(metadata?.rendering?.mode==='skipped')main.append(element('p',metadata.rendering.diagnostic||text.noPreview));
  const frame=element('iframe');frame.setAttribute('sandbox','allow-same-origin');frame.title=screen.name;
  frame.onload=()=>{const document=frame.contentDocument;if(!document)return;document.addEventListener('submit',e=>e.preventDefault());document.addEventListener('click',e=>{e.preventDefault();const node=e.target;if(!node||!(node as Element).tagName)return;const record=previewElement(payload,id,node as Element);if(record){elementDetail(panel,payload,record);if(record.graphComponentId)panel.append(libraryDetails(payload,record.graphComponentId));}});
   if(component){for(const node of document.querySelectorAll('*'))if(node.getAttribute('data-st-component-id')===component||payload.preview.elements?.some(e=>e.graphScreenId===id&&e.graphComponentId===component&&e.id===node.id&&!!node.id)){(node as HTMLElement).style.outline='3px solid #eab308';node.scrollIntoView({block:'center'});}}
  };
  frame.srcdoc=previewDocument(payload,id);const preview=element('section',undefined,'preview');preview.append(frame);
  const layout=element('div',undefined,'focus-layout'),neighbors=element('section',undefined,'focus-neighbors');neighbors.setAttribute('aria-label',text.related);for(const r of index.relations.filter(r=>r.from===id))neighbors.append(focusRelation(index,payload,r,focus));layout.append(preview,neighbors);main.append(layout);
  screenPanel(panel,index,payload,id,focus,review&&payload.componentLibrary?{state:()=>reviewState,change:(componentId,value)=>{reviewState=setOverride(reviewState,graph,payload.componentLibrary!,id,componentId,value);changed();}}:undefined);if(review){const section=element('section',undefined,'component-decisions');section.append(element('h3',text.components));for(const key of markableComponents(graph).filter(k=>k.screenId===id)){const effective=effectiveComponent(reviewState,id,key.componentId);if(filter.value!=='ALL'&&effective!==filter.value)continue;const entry=element('div',undefined,'component-review');entry.append(decisionControl(index.nodes.get(key.componentId)!.name,componentDecision(reviewState,id,key.componentId),value=>{reviewState=setComponent(reviewState,id,key.componentId,value);changed();},undefined,key.componentId));if(effective==='INHERITED_REMOVE')entry.append(element('span',text.inherited));section.append(entry);}panel.append(section);}if(review&&payload.componentLibrary){const section=element('section');section.append(element('h3','元件庫覆寫'));for(const [componentId,owners]of index.owners)if(owners.includes(id)){const control=libraryOverride(payload,reviewState,id,componentId,value=>{reviewState=setOverride(reviewState,graph,payload.componentLibrary!,id,componentId,value);changed();});if(control)section.append(control);}panel.append(section);}summaries();
 };
 const show=()=>{current=undefined;const options={visible:review&&filter.value!=='ALL'?new Set(index.screens.filter(s=>screenDecision(reviewState,s.id)===filter.value).map(s=>s.id)):undefined,decorate:review?decorate:undefined};main.replaceChildren(mode==='files'?fileTree(index,search.value,focus,options):canvas(index,payload,search.value,focus,options));panel.replaceChildren(element('h2',text.info));};
 apis.onclick=()=>{current=undefined;main.replaceChildren(apiPage(index,reviewState,id=>apiDetail(panel,index,id,()=>panel.replaceChildren(element('h2',text.info)),focus)));panel.replaceChildren(element('h2',text.info));};
 overview.onclick=()=>{mode='overview';show();};files.onclick=()=>{mode='files';show();};screens.onclick=show;search.oninput=show;toggle.onchange=()=>{review=toggle.checked;summaries();if(current)focus(current);else show();};filter.onchange=()=>{if(current)focus(current);else show();};
 summaries();show();shell.append(nav,main,panel);root.replaceChildren(shell);root.dataset.ready='true';
} catch(error){root.replaceChildren(element('p',String(error)));root.dataset.error='true';}
