import {needsSimulationSurface,simulationSurface} from './simulation-surface';
import {assessSimulation,Effect} from './simulation';
import {previewElement,previewSelector} from './preview';
import {Payload,ElementRecord} from './contracts';
import {element} from './text';

const operable='a,button,form,select,input,textarea';
const eventElement=(target:EventTarget|null):Element|null=>{if(!target)return null;const candidate=target as Element;if(typeof candidate.closest==='function')return candidate;return (target as Node).parentElement||null;};

function dialogRecords(payload:Payload,id:string,doc:Document):Map<string,Element>{
 const result=new Map<string,Element>();
 for(const record of payload.preview.elements||[])if(record.graphScreenId===id&&record.graphComponentId&&record.componentResolution!=='UNRESOLVED'&&record.componentResolution!=='AMBIGUOUS')try{const node=doc.querySelector(previewSelector(record.path));if(node)result.set(record.graphComponentId,node);}catch{}
 return result;
}
function editableInput(node:Element):boolean{return ['input','select','textarea'].includes(node.localName)&&!node.hasAttribute('disabled')&&!node.hasAttribute('readonly')&&!['hidden','button','submit','reset','image','file'].includes(node.getAttribute('type')||'');}
function submitControl(node:Element):boolean{return node.localName==='button'&&(!node.getAttribute('type')||node.getAttribute('type')==='submit')||node.localName==='input'&&['submit','image'].includes(node.getAttribute('type')||'');}

/** Simulates a click as the real page would: a submit control acts for its form, and forms are always treated as valid. */
export function simulateElement(payload:Payload,id:string,node:Element,dialogIds=[...dialogRecords(payload,id,node.ownerDocument).keys()],componentId?:string){
 const form=submitControl(node)?(node as HTMLButtonElement|HTMLInputElement).form:undefined,target=form||node,record=previewElement(payload,id,target);
 const result=assessSimulation(payload,id,record,{tag:target.localName,href:target.getAttribute('href')||undefined,valid:true,dialogIds,componentId});
 return {...(!result.possible&&editableInput(target)?{...result,reason:undefined}:result),node:target,record,delegated:target!==node};
}
export function elementSimulationAssessment(payload:Payload,id:string,node:Element,dialogIds=[...dialogRecords(payload,id,node.ownerDocument).keys()]){
 const {node:_target,record:_record,...result}=simulateElement(payload,id,node,dialogIds);
 return result;
}

export const unknownDestination='無法確定前往哪個畫面';

export interface SimulationOptions {focus:(id:string)=>void;api:(id:string)=>void;thumbnail:(id:string)=>string|undefined}

/** Wires clicks inside the static preview: navigate, open dialogs, show API calls, or offer the possible destinations. */
export function attachSimulation(payload:Payload,id:string,frame:HTMLIFrameElement,viewer:HTMLElement,options:SimulationOptions){
 const doc=frame.contentDocument!,status=viewer.querySelector<HTMLElement>('.prototype-status')!;
 const available=dialogRecords(payload,id,doc),dialogIds=[...available.keys()];
 let close:(()=>void)|undefined,surface:ReturnType<typeof simulationSurface>|undefined,picker:HTMLElement|undefined;
 const style=doc.createElement('style');style.dataset.stViewer='true';
 style.textContent='[data-simulation-capable]{cursor:pointer!important}[data-simulation-capable]:hover,[data-simulation-capable]:focus-visible{outline:2px solid #2347c5!important;outline-offset:2px}';
 doc.head?.append(style);
 for(const node of doc.querySelectorAll(operable))if(simulateElement(payload,id,node,dialogIds).possible)(node as HTMLElement).dataset.simulationCapable='true';
 const closePicker=()=>{picker?.remove();picker=undefined;};
 const say=(text:string,action?:{label:string;run:()=>void})=>{
  status.replaceChildren(element('span',text));
  if(action){const button=element('button',action.label,'link-row inline');button.onclick=action.run;status.append(button);}
 };
 const popup=(target:string)=>{
  const source=available.get(target);if(!source){say('彈窗內容無法從原始碼重建');return;}
  close?.();
  const active=surface?globalThis.document.activeElement as HTMLElement|null:doc.activeElement as HTMLElement|null,backdrop=doc.createElement('div'),modal=doc.createElement('section'),button=doc.createElement('button'),content=source.cloneNode(true) as HTMLElement;
  backdrop.className='simulation-backdrop';backdrop.dataset.stSimulationUi='true';
  const scale=Number(viewer.dataset.scale||'1'),rect=frame.getBoundingClientRect(),scroll=viewer.querySelector('.prototype-scroll');
  backdrop.style.cssText=`position:absolute;left:0;top:${Math.max(0,-rect.top+(scroll?.getBoundingClientRect().top||0))/scale}px;width:100%;height:${(scroll?.clientHeight||rect.height)/scale}px;background:#0007;z-index:2147483647;display:flex;align-items:center;justify-content:center;`;
  modal.className='simulation-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.style.cssText='background:white;color:#1b1e22;padding:20px;max-width:85%;max-height:85%;overflow:auto;border-radius:8px;';
  button.textContent='關閉模擬彈窗';button.type='button';
  content.hidden=false;content.removeAttribute('aria-hidden');content.style.setProperty('display','block','important');content.style.setProperty('visibility','visible','important');content.style.position='static';content.style.opacity='1';
  modal.append(button,content);backdrop.append(modal);doc.body.append(backdrop);
  close=()=>{backdrop.remove();close=undefined;surface?.update();if(active?.isConnected)active.focus();};
  button.onclick=event=>{event.preventDefault();close?.();};
  backdrop.onclick=event=>{if(event.target===backdrop)close?.();};
  if(surface){surface.update();surface.focusDialog();}else button.focus();
 };
 const label=(choice:Effect)=>choice.kind==='navigate'?choice.label||'畫面':choice.kind==='api'?`呼叫 API：${choice.method} ${choice.path}`:choice.kind==='dialog'?`開啟彈窗：${choice.label||''}`:choice.kind==='form'?`送出到 ${choice.path}`:unknownDestination;
 const choose=(choices:Effect[],node:Element,record:ElementRecord|undefined)=>{
  closePicker();
  const box=element('div',undefined,'simulation-picker');box.setAttribute('role','dialog');box.setAttribute('aria-label','可能的結果');box.dataset.stSimulationUi='true';
  box.append(element('strong','這個操作可能前往：'));
  for(const choice of choices){
   const button=element('button',undefined,'simulation-choice');
   if(choice.targetId)button.dataset.target=choice.targetId;
   const thumb=choice.kind==='navigate'&&choice.targetId?options.thumbnail(choice.targetId):undefined;
   if(thumb){const img=element('img');img.src=thumb;img.alt='';button.append(img);}
   button.append(element('span',label(choice)));
   button.onclick=()=>{closePicker();if(choice.componentId&&record){render(simulateElement(payload,id,node,dialogIds,choice.componentId).effect,record,node);}else render(choice,record,node);};
   box.append(button);
  }
  const dismiss=element('button','取消','simulation-cancel');dismiss.onclick=closePicker;box.append(dismiss);
  const scale=Number(viewer.dataset.scale||'1'),frameBox=frame.getBoundingClientRect(),nodeBox=node.getBoundingClientRect(),host=viewer.getBoundingClientRect();
  box.style.left=`${Math.max(8,Math.min(host.width-288,frameBox.left-host.left+nodeBox.left*scale))}px`;
  box.style.top=`${Math.max(8,frameBox.top-host.top+nodeBox.bottom*scale+6)}px`;
  viewer.append(box);picker=box;box.querySelector<HTMLButtonElement>('.simulation-choice')?.focus();
 };
 const render=(effect:Effect,record:ElementRecord|undefined,node:Element)=>{
  status.replaceChildren();
  if(effect.kind==='navigate'&&effect.targetId){options.focus(effect.targetId);return;}
  if(effect.kind==='dialog'&&effect.targetId){popup(effect.targetId);return;}
  if(effect.kind==='api'&&effect.targetId){const target=effect.targetId;say(`呼叫 API：${effect.method} ${effect.path}（不會真的送出）`,{label:'在 API 頁查看',run:()=>options.api(target)});return;}
  if(effect.kind==='external'){say('外部連結（不會開啟）');return;}
  const choices=effect.choices||[];
  if(effect.kind==='form'&&choices.length===1&&choices[0].kind==='navigate'&&choices[0].resolution!=='AMBIGUOUS'&&choices[0].targetId){options.focus(choices[0].targetId);return;}
  if(choices.length){choose(choices,node,record);return;}
  say(unknownDestination);
 };
 const submit=(form:HTMLFormElement,submitter:Element|null=null)=>{
  const result=simulateElement(payload,id,submitter&&submitControl(submitter)?submitter:form,dialogIds);
  render(result.effect,result.record,submitter||form);
 };
 doc.addEventListener('submit',event=>{event.preventDefault();const submission=event as SubmitEvent;submit(event.target as HTMLFormElement,submission.submitter instanceof Element?submission.submitter:null);},true);
 const click=(target:Element)=>{
  const form=(target as HTMLButtonElement).form;
  if(submitControl(target)&&form){submit(form,target);return;}
  const result=simulateElement(payload,id,target,dialogIds);
  render(result.effect,result.record,target);
 };
 const change=(node:Element)=>{
  const record=previewElement(payload,id,node);
  if(node.localName!=='select'&&!(payload.graph.behaviors||[]).some(b=>b.triggerId===record?.graphComponentId&&b.event==='change'))return;
  const result=simulateElement(payload,id,node,dialogIds);
  render(result.effect,result.record,node);
 };
 doc.addEventListener('click',event=>{
  closePicker();
  const target=eventElement(event.target)?.closest(operable);
  if(!target||target.closest('[data-st-simulation-ui]'))return;
  if(target.localName==='a'||target.localName==='button'||target.localName==='input'&&['submit','image'].includes(target.getAttribute('type')||''))event.preventDefault();
  click(target);
 });
 doc.addEventListener('change',event=>change(event.target as Element));
 doc.addEventListener('scroll',closePicker);
 if(needsSimulationSurface())surface=simulationSurface(frame,()=>{},click,submit,change,()=>close?.());
 return {closeDialog:()=>{if(picker){closePicker();return true;}if(!close)return false;close();return true;}};
}
