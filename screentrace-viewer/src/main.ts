import {Payload,requireGraph} from './contracts';
import {element,text} from './text';
const root=document.querySelector<HTMLDivElement>('#app')!;
try {
 const payload=JSON.parse(document.querySelector('#st-data')!.textContent!) as Payload;
 const graph=requireGraph(payload.graph);
 document.querySelector('#application')!.textContent=graph.application.name;
 const shell=element('div',undefined,'shell'),nav=element('nav'),main=element('main'),panel=element('aside');
 nav.setAttribute('aria-label','主要導覽');nav.append(element('button',text.screens),element('button',text.apis));panel.append(element('h2',text.info));
 const list=element('div',undefined,'screen-list');
 for(const screen of graph.nodes.filter(n=>n.type==='SCREEN')){const button=element('button',screen.name);button.dataset.screen=screen.id;button.onclick=()=>{main.replaceChildren(element('h2',screen.name),element('p',text.notice,'notice'));const frame=element('iframe');frame.setAttribute('sandbox','allow-same-origin');frame.title=screen.name;frame.srcdoc=payload.documents[screen.id]||'<html><body></body></html>';const preview=element('section',undefined,'preview');preview.append(frame);main.append(preview);};list.append(button);}
 main.append(list);shell.append(nav,main,panel);root.replaceChildren(shell);root.dataset.ready='true';
} catch(error){root.replaceChildren(element('p',String(error)));root.dataset.error='true';}
