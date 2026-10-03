import {Payload,requireGraph} from './contracts';import {element,text} from './text';import {indexGraph} from './map';import {canvas,fileTree} from './canvas';
const root=document.querySelector<HTMLDivElement>('#app')!;
try {
 const payload=JSON.parse(document.querySelector('#st-data')!.textContent!) as Payload;
 const graph=requireGraph(payload.graph),index=indexGraph(graph);document.querySelector('#application')!.textContent=graph.application.name;
 const shell=element('div',undefined,'shell'),nav=element('nav'),main=element('main'),panel=element('aside');nav.setAttribute('aria-label','主要導覽');panel.append(element('h2',text.info));
 const screens=element('button',text.screens),apis=element('button',text.apis),overview=element('button',text.overview),files=element('button',text.files),search=element('input');search.type='text';search.setAttribute('aria-label',text.search);search.placeholder=text.search;nav.append(screens,apis,overview,files,search);let mode='overview';
 const focus=(id:string)=>{const screen=index.nodes.get(id)!;main.replaceChildren(element('h2',screen.name),element('p',text.notice,'notice'));const frame=element('iframe');frame.setAttribute('sandbox','allow-same-origin');frame.title=screen.name;frame.srcdoc=payload.documents[screen.id]||'<html><body></body></html>';const preview=element('section',undefined,'preview');preview.append(frame);main.append(preview);};
 const show=()=>main.replaceChildren(mode==='files'?fileTree(index,search.value,focus):canvas(index,payload,search.value,focus));overview.onclick=()=>{mode='overview';show();};files.onclick=()=>{mode='files';show();};screens.onclick=show;search.oninput=show;
 show();shell.append(nav,main,panel);root.replaceChildren(shell);root.dataset.ready='true';
} catch(error){root.replaceChildren(element('p',String(error)));root.dataset.error='true';}
