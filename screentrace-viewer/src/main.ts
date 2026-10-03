import {Payload,requireGraph} from './contracts';
import {element,text} from './text';
import {indexGraph} from './map';
import {canvas,fileTree} from './canvas';
import {focusRelation} from './relations';
import {screenPanel,elementDetail} from './details';
import {previewDocument,previewElement} from './preview';
const root=document.querySelector<HTMLDivElement>('#app')!;
try {
 const payload=JSON.parse(document.querySelector('#st-data')!.textContent!) as Payload;
 const graph=requireGraph(payload.graph),index=indexGraph(graph);
 document.querySelector('#application')!.textContent=graph.application.name;
 const shell=element('div',undefined,'shell'),nav=element('nav'),main=element('main'),panel=element('aside');
 nav.setAttribute('aria-label','主要導覽');panel.append(element('h2',text.info));
 const screens=element('button',text.screens),apis=element('button',text.apis),overview=element('button',text.overview),files=element('button',text.files),search=element('input');
 search.type='text';search.setAttribute('aria-label',text.search);search.placeholder=text.search;nav.append(screens,apis,overview,files,search);
 let mode='overview',current:string|undefined;const history:string[]=[];
 const focus=(id:string,component?:string,push=true)=>{
  if(current&&current!==id&&push)history.push(current);current=id;
  const screen=index.nodes.get(id)!;main.replaceChildren(element('h2',screen.name));
  const back=element('button',text.back);back.disabled=!history.length;back.onclick=()=>{const previous=history.pop();if(previous)focus(previous,undefined,false);};main.append(back,element('p',text.notice,'notice'));
  const metadata=payload.preview.screens?.find(s=>s.graphScreenId===id);if(metadata?.dynamicExpressions?.length)main.append(element('pre',metadata.dynamicExpressions.join('\n')));
  if(metadata?.rendering?.mode==='skipped')main.append(element('p',metadata.rendering.diagnostic||text.noPreview));
  const frame=element('iframe');frame.setAttribute('sandbox','allow-same-origin');frame.title=screen.name;
  frame.onload=()=>{const document=frame.contentDocument;if(!document)return;document.addEventListener('submit',e=>e.preventDefault());document.addEventListener('click',e=>{e.preventDefault();const node=e.target;if(!node||!(node as Element).tagName)return;const record=previewElement(payload,id,node as Element);if(record)elementDetail(panel,payload,record);});
   if(component){for(const node of document.querySelectorAll('*'))if(node.getAttribute('data-st-component-id')===component||payload.preview.elements?.some(e=>e.graphScreenId===id&&e.graphComponentId===component&&e.id===node.id&&!!node.id)){(node as HTMLElement).style.outline='3px solid #eab308';node.scrollIntoView({block:'center'});}}
  };
  frame.srcdoc=previewDocument(payload,id);const preview=element('section',undefined,'preview');preview.append(frame);
  const layout=element('div',undefined,'focus-layout'),neighbors=element('section',undefined,'focus-neighbors');neighbors.setAttribute('aria-label',text.related);for(const r of index.relations.filter(r=>r.from===id))neighbors.append(focusRelation(index,payload,r,focus));layout.append(preview,neighbors);main.append(layout);
  screenPanel(panel,index,payload,id,focus);
 };
 const show=()=>{current=undefined;main.replaceChildren(mode==='files'?fileTree(index,search.value,focus):canvas(index,payload,search.value,focus));panel.replaceChildren(element('h2',text.info));};
 overview.onclick=()=>{mode='overview';show();};files.onclick=()=>{mode='files';show();};screens.onclick=show;search.oninput=show;
 show();shell.append(nav,main,panel);root.replaceChildren(shell);root.dataset.ready='true';
} catch(error){root.replaceChildren(element('p',String(error)));root.dataset.error='true';}
