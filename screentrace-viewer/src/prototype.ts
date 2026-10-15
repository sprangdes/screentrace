import {element} from './text';
import {iconButton} from './shell-ui';
import {Index} from './map';
import {Payload} from './contracts';
import {PrototypeHistory} from './prototype-history';

export interface PrototypeOptions {back:()=>void;focus:(id:string)=>void;move:(delta:number)=>void;scroll:number;presenting:boolean;present:()=>void}

/** Full-size static preview of one screen with its own history toolbar and zoom controls. */
export function prototypeViewer(index:Index,payload:Payload,id:string,preview:HTMLElement,frame:HTMLIFrameElement,history:PrototypeHistory,options:PrototypeOptions):HTMLElement{
 const metadata=payload.preview.screens?.find(s=>s.graphScreenId===id),width=Math.max(1,metadata?.width||1440);
 let height=Math.max(1,metadata?.height||900);
 const root=element('section',undefined,'prototype-viewer'),toolbar=element('div',undefined,'prototype-toolbar'),scroller=element('div',undefined,'prototype-scroll'),stage=element('div',undefined,'prototype-stage'),status=element('div',undefined,'prototype-status');
 status.setAttribute('role','status');
 const back=iconButton('返回畫布','back'),previous=iconButton('上一頁','back'),next=iconButton('下一頁','arrow');
 back.classList.add('prototype-back');back.append(element('span','返回畫布'));
 const url=element('code',index.routes.get(id)?.[0]||'沒有已知 URL','prototype-url');
 url.setAttribute('aria-label','主要 URL');url.title=url.textContent!;
 back.onclick=options.back;
 previous.disabled=!history.canBack;next.disabled=!history.canForward;
 previous.onclick=()=>options.move(-1);next.onclick=()=>options.move(1);
 const present=iconButton(options.presenting?'結束全螢幕':'全螢幕預覽',options.presenting?'minimize':'maximize');
 present.classList.add('prototype-present');present.setAttribute('aria-pressed',String(options.presenting));present.onclick=options.present;
 toolbar.append(back,previous,next,url,present);
 root.append(toolbar,status,scroller);
 frame.style.width=`${width}px`;frame.style.height=`${height}px`;frame.style.maxWidth='none';frame.scrolling='no';
 preview.style.width=`${width}px`;preview.style.height=`${height}px`;preview.style.transformOrigin='0 0';
 stage.append(preview);scroller.append(stage);
 let scaleMode:'fit'|'manual'='fit',scale=1;
 const fitScale=()=>Math.min(1,Math.max(1,scroller.clientWidth-16)/width);
 const resize=()=>{
  if(!root.isConnected){observer.disconnect();contentObserver?.disconnect();return;}
  if(scaleMode==='fit')scale=fitScale();
  preview.style.transform=`scale(${scale})`;preview.style.height=`${height}px`;frame.style.height=`${height}px`;
  stage.style.width=`${width*scale}px`;stage.style.height=`${height*scale}px`;
  root.dataset.scale=String(scale);root.dataset.zoomMode=scaleMode;
 };
 const observer=new ResizeObserver(resize);let contentObserver:ResizeObserver|undefined;observer.observe(scroller);
 const zoomControls=element('div',undefined,'prototype-zoom-controls');zoomControls.setAttribute('aria-label','畫面縮放');
 const zoomBy=(delta:number)=>{const base=scaleMode==='fit'?fitScale():scale;scaleMode='manual';scale=Math.min(1.5,Math.max(0.5,Math.round((base+delta)*100)/100));resize();};
 const minus=iconButton('縮小','minus'),plus=iconButton('放大','zoom'),fit=iconButton('適合寬度','fit');
 minus.onclick=()=>zoomBy(-0.25);plus.onclick=()=>zoomBy(0.25);fit.onclick=()=>{scaleMode='fit';resize();};
 zoomControls.append(minus,plus,fit);
 frame.addEventListener('load',()=>{
  if(!frame.getAttribute('srcdoc')||!frame.contentDocument)return;
  const doc=frame.contentDocument;
  const measure=()=>{height=Math.max(metadata?.height||900,doc.documentElement.scrollHeight,doc.body?.scrollHeight||0);resize();};
  // Pages sized in vh/dvh grow with the frame, so watching the content would enlarge it without end. With a
  // captured height the content is measured once on load; the frame never chases its own resize.
  measure();
  if(!metadata?.height){contentObserver=new ResizeObserver(measure);if(doc.body)contentObserver.observe(doc.body);}
  scroller.scrollTop=options.scroll;root.dataset.loaded='true';
 });
 if(!payload.documents[id])status.textContent='未取得重建預覽';
 root.append(zoomControls);
 requestAnimationFrame(resize);
 return root;
}
