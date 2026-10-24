import {applyDataAction,setModelFeedback,setSubmittedValues} from './simulation-data';
import {needsSimulationSurface,simulationSurface} from './simulation-surface';
import {assessSimulation,Effect,staticAction,choiceLeaves} from './simulation';
import {previewElement,previewSelector,registerPreviewClone} from './preview';
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
export function simulateElement(payload:Payload,id:string,node:Element,dialogIds=[...dialogRecords(payload,id,node.ownerDocument).keys()],componentId?:string,event?:string){
 const own=previewElement(payload,id,node),submitter=payload.graph.nodes.find(n=>n.id===own?.graphComponentId)?.attributes.submitterAction==='true'||payload.graph.behaviors?.some(b=>b.triggerId===own?.graphComponentId&&staticAction(b)?.operation==='preventSubmit');
 const form=submitControl(node)&&!submitter?(node as HTMLButtonElement|HTMLInputElement).form:undefined;
 const parentLink=!form&&node.localName==='button'&&!payload.graph.behaviors?.some(b=>b.triggerId===own?.graphComponentId)?node.closest('a[href]'):null;
 const target=form||parentLink||node,record=previewElement(payload,id,target);
 const identity=target.getAttribute('data-st-component-id');if(!componentId&&record?.componentResolution==='AMBIGUOUS'&&identity&&record.graphComponentCandidates?.includes(identity))componentId=identity;
 const result=assessSimulation(payload,id,record,{tag:target.localName,href:target.getAttribute('href')||undefined,valid:true,dialogIds,componentId,event});
 return {...(!result.possible&&editableInput(target)?{...result,reason:undefined}:result),node:target,record,delegated:target!==node};
}
export function elementSimulationAssessment(payload:Payload,id:string,node:Element,dialogIds=[...dialogRecords(payload,id,node.ownerDocument).keys()]){
 const {node:_target,record:_record,...result}=simulateElement(payload,id,node,dialogIds);
 return result;
}

export const unknownDestination='無法確定前往哪個畫面';

export interface SimulationOptions {focus:(id:string,notice?:string)=>void;api:(id:string)=>void;thumbnail:(id:string)=>string|undefined}

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
  const active=surface?globalThis.document.activeElement as HTMLElement|null:doc.activeElement as HTMLElement|null,backdrop=doc.createElement('div'),modal=doc.createElement('section'),button=doc.createElement('button'),content=source as HTMLElement;
  const slot=doc.createComment('simulation-dialog-position'),oldStyle=content.getAttribute('style'),oldHidden=content.hidden,oldAria=content.getAttribute('aria-hidden');
  registerPreviewClone(payload,id,source,source);source.before(slot);
  backdrop.className='simulation-backdrop';backdrop.dataset.stSimulationUi='true';
  const scale=Number(viewer.dataset.scale||'1'),rect=frame.getBoundingClientRect(),scroll=viewer.querySelector('.prototype-scroll');
  backdrop.style.cssText=`position:absolute;left:0;top:${Math.max(0,-rect.top+(scroll?.getBoundingClientRect().top||0))/scale}px;width:100%;height:${(scroll?.clientHeight||rect.height)/scale}px;background:#0007;z-index:2147483647;display:flex;align-items:center;justify-content:center;`;
  modal.className='simulation-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.style.cssText='background:white;color:#1b1e22;padding:20px;max-width:85%;max-height:85%;overflow:auto;border-radius:8px;';
  button.textContent='關閉模擬彈窗';button.type='button';
  content.hidden=false;content.removeAttribute('aria-hidden');content.style.setProperty('display','block','important');content.style.setProperty('visibility','visible','important');content.style.position='static';content.style.opacity='1';content.style.setProperty('transform','none','important');
  modal.append(button,content);backdrop.append(modal);doc.body.append(backdrop);
  close=()=>{slot.replaceWith(content);if(oldStyle===null)content.removeAttribute('style');else content.setAttribute('style',oldStyle);content.hidden=oldHidden;if(oldAria!==null)content.setAttribute('aria-hidden',oldAria);backdrop.remove();close=undefined;surface?.update();if(active?.isConnected)active.focus();};
  button.onclick=event=>{event.preventDefault();close?.();};
  backdrop.onclick=event=>{if(event.target===backdrop)close?.();};
  if(surface){surface.update();surface.focusDialog();}else button.focus();
  if((payload.graph.behaviors||[]).some(b=>b.triggerId===target&&b.event==='shown.bs.modal')){const result=simulateElement(payload,id,content,dialogIds,undefined,'shown.bs.modal');render(result.effect,result.record,content);}
 };
 /** A conditional result with a single outcome is that outcome; the condition is noted in its label. */
 const outcomeOf=(choice:Effect):Effect=>choice.kind==='choices'&&choice.choices?.length===1?choice.choices[0]:choice;
 const label=(choice:Effect):string=>choice.kind==='sequence'?`${choice.callback==='error'?'失敗':'成功'}：${(choice.choices||[]).map(c=>c.kind==='message'?c.message:c.kind==='ui'&&c.operation==='reload'?'重新顯示本頁':c.kind==='ui'&&c.operation==='setText'?c.value:label(c)).join('；')}`:choice.kind==='choices'&&choice.choices?.length===1?`${label(choice.choices[0])}（有條件）`:choice.kind==='message'?`${choice.callback==='error'?'失敗':choice.callback==='success'?'成功':'訊息'}：${choice.message}`:choice.kind==='navigate'?(choice.label||'畫面')+(choice.condition?'（'+choice.condition+'）':''):choice.kind==='api'?(choice.message||`呼叫 API：${choice.method} ${choice.path}`):choice.kind==='dialog'?`開啟彈窗：${choice.label||''}`:choice.kind==='form'?`送出到 ${choice.path}`:unknownDestination;
 const choose=(choices:Effect[],node:Element,record:ElementRecord|undefined,calls:Effect[]=[])=>{
  choices=choiceLeaves(choices);
  closePicker();
  const box=element('div',undefined,'simulation-picker');box.setAttribute('role','dialog');box.setAttribute('aria-label','可能的結果');box.dataset.stSimulationUi='true';
  if(calls.length){box.append(element('strong','這個操作會呼叫：'));const list=element('ul',undefined,'simulation-calls');for(const call of calls)list.append(element('li',label(call)));box.append(list);}
  const destinations=choices.every(choice=>outcomeOf(choice).kind==='navigate');
  box.append(element('strong',destinations?(calls.length?'然後可能前往：':'這個操作可能前往：'):'這個操作可能：'));
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
 const message=(text:string)=>{
  close?.();const box=doc.createElement('div'),content=doc.createElement('section'),body=doc.createElement('p'),button=doc.createElement('button');
  box.className='simulation-backdrop';box.dataset.stSimulationUi='true';box.style.cssText='position:fixed;inset:0;background:#0007;display:flex;align-items:center;justify-content:center;z-index:2147483647';
  content.className='simulation-modal';content.setAttribute('role','dialog');content.style.cssText='background:white;color:#111;padding:20px;max-width:80%;border-radius:8px';
  body.textContent=text;button.type='button';button.textContent='關閉';button.onclick=()=>close?.();content.append(body,button);box.append(content);doc.body.append(box);close=()=>{box.remove();close=undefined;};button.focus();
 };
 const apply=(effect:Effect)=>{
  if(effect.operation==='preventSubmit')return;
  if(effect.operation==='reload'){say('重新顯示本頁示例（不會送出請求）');return;}
  if(effect.operation==='print'){say('列印目前的靜態畫面');window.print();return;}
  if(effect.when){let control:HTMLInputElement|null=null;try{control=doc.querySelector(effect.when.selector);}catch{}if(control?.value!==effect.when.value)return;}
  let targets:Element[]=[];try{targets=effect.selector?Array.from(doc.querySelectorAll(effect.selector)):[];}catch{}
  if(effect.index!==undefined)targets=targets[effect.index]?[targets[effect.index]]:[];
  if(effect.operation==='datePicker'&&targets.length!==1){say('無法確認日期欄位');return;}
  if(effect.relative)targets=targets.map(n=>effect.relative==='previousElementSibling'?n.previousElementSibling:n.nextElementSibling).filter((n):n is Element=>!!n);
  for(const target of targets){
   if(effect.operation==='toggleDisclosure'&&effect.inputSelector){let button:Element|null=null;try{button=doc.querySelector(effect.inputSelector);}catch{}if(button){const expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));target.classList.toggle('show',!expanded);(target as HTMLElement).hidden=expanded;}}
   else if(effect.operation==='toggleDisplay'){const current=(target as HTMLElement).style.display;(target as HTMLElement).style.display=current==='none'||current===''?'block':'none';}
   else if(effect.operation==='setText')target.textContent=effect.value??'';
   else if(effect.operation==='setStyle'&&['display','color'].includes(effect.property||''))(target as HTMLElement).style.setProperty(effect.property!,effect.value??'');
   else if(['classAdd','classRemove','classToggle'].includes(effect.operation||'')&&/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(effect.value||'')){const operation=effect.operation==='classAdd'?'add':effect.operation==='classRemove'?'remove':'toggle';target.classList[operation](effect.value!);}
   else if(effect.operation==='dateMin'&&Number.isInteger(effect.days)&&effect.days!>=1&&effect.days!<=366&&effect.inputSelector){let input:HTMLInputElement|null=null;try{input=doc.querySelector(effect.inputSelector);}catch{}const value=input?.value||'';if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const date=new Date(value+'T00:00:00Z');if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value){date.setUTCDate(date.getUTCDate()+effect.days!);target.setAttribute('min',date.toISOString().slice(0,10));}}}
   else if(effect.operation==='setValue'&&'value'in target)(target as HTMLInputElement).value=effect.value??'';
   else if(['show','hide','toggle'].includes(effect.operation||'')){
    const hidden=effect.operation==='hide'||effect.operation==='toggle'&&doc.defaultView!.getComputedStyle(target).display!=='none';
    (target as HTMLElement).hidden=hidden;(target as HTMLElement).style.display=hidden?'none':'block';
   }else if(effect.operation==='datePicker'&&'value'in target){
    close?.();const panel=doc.createElement('div'),input=doc.createElement('input'),button=doc.createElement('button');panel.className='simulation-backdrop';panel.dataset.stSimulationUi='true';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','選擇日期');panel.style.cssText='position:fixed;inset:20% 25%;background:white;border:1px solid #bbb;padding:24px;z-index:2147483647';input.type='date';input.setAttribute('aria-label','日期');button.type='button';button.textContent='套用日期';button.onclick=()=>{const [year,month,day]=input.value.split('-');if(year&&month&&day)(target as HTMLInputElement).value=(effect.format||'yyyy/mm/dd').replace('yyyy',year).replace('mm',month).replace('dd',day);close?.();};panel.append(input,button);doc.body.append(panel);close=()=>{panel.remove();close=undefined;};input.focus();
   }
  }
 };
 const render=(effect:Effect,record:ElementRecord|undefined,node:Element)=>{
  status.replaceChildren();
  if(effect.kind==='confirm'){
   message(effect.message||'');const modal=doc.querySelector('.simulation-modal')!,cancel=modal.querySelector('button')!;
   cancel.textContent='取消';cancel.className='simulation-confirm-cancel';
   const accept=doc.createElement('button');accept.type='button';accept.textContent='確認';accept.className='simulation-confirm-accept';
   accept.onclick=()=>{close?.();const next=effect.choices||[];if(next.length)render(next.length===1?next[0]:{kind:'choices',choices:next},record,node);};
   modal.append(accept);cancel.focus();return;
  }
  if(effect.kind==='gate'){
   for(const check of effect.checks||[]){let nodes:HTMLInputElement[]=[];try{nodes=Array.from(doc.querySelectorAll<HTMLInputElement>(check.selector));}catch{say('無法確認檢核欄位');return;}
    if(!nodes.length||check.kind==='required'&&nodes.length!==1){say('無法確認檢核欄位');return;}const count=nodes.filter(n=>n.checked).length;
    if(check.kind==='required'&&nodes.length===1&&!nodes[0].value.trim()||check.kind==='selection'&&count!==1){message(check.kind==='selection'&&count>1?check.maximumMessage||check.message:check.message);return;}
   }
   const next=effect.choices||[];if(next.length)render(next.length===1?next[0]:{kind:'choices',choices:next},record,node);return;
  }
  if(effect.kind==='sequence'){for(const item of effect.choices||[])render(item,record,node);return;}
  if(effect.kind==='ui'){apply(effect);return;}
  if(effect.kind==='message'){message(effect.message||'');return;}
  if(effect.kind==='choices'&&effect.choices?.some(c=>c.kind==='ui')){
   const actions=effect.choices.filter(c=>c.kind==='ui');for(const action of actions)apply(action);
   const rest=effect.choices.filter(c=>c.kind!=='ui'&&c.kind!=='unknown');if(!rest.length){if(effect.choices.some(c=>c.kind==='unknown'))say('已模擬可確認的操作；部分腳本結果無法確定');return;}render(rest.length===1?rest[0]:{kind:'choices',choices:rest},record,node);return;
  }
  // An element with several behaviors usually requests APIs and then moves on: the requests all happen, so they
  // are listed, never offered as alternatives; only the remaining outcomes are something to choose between.
  if(effect.kind==='choices'&&effect.choices?.length&&!effect.choices.some(choice=>choice.componentId)){
   const calls=effect.choices.filter(choice=>outcomeOf(choice).kind==='api'),rest=effect.choices.filter(choice=>!calls.includes(choice));
   if(calls.length){
    const requested=`呼叫 API：${calls.map(call=>label(call).replace(/^呼叫 API：/,'')).join('、')}（不會真的送出）`;
    if(!rest.length){say(`留在本頁 · ${requested}`);return;}
    const next=rest.length===1?outcomeOf(rest[0]):undefined;
    if(next?.kind==='navigate'&&next.targetId&&next.resolution!=='AMBIGUOUS'){options.focus(next.targetId,`上一個畫面的操作${requested}`);return;}
    if(next?.kind==='dialog'&&next.targetId){popup(next.targetId);say(requested);return;}
    choose(rest,node,record,calls);return;
   }
  }
  if(effect.kind==='navigate'&&effect.targetId){let dataNotice:string|undefined;if(effect.dataAction&&!applyDataAction(payload,effect.dataAction,node)){if(effect.dataAction.scope==='submitted-fields-only'&&effect.dataAction.useSelectedIdentity)dataNotice='來源正常回傳路徑；未選定資料列，未回放更新資料';else{say('示範資料無法確認操作的資料列或欄位');return;}}setModelFeedback(payload,effect.targetId,effect.feedback??{});setSubmittedValues(payload,effect.targetId,effect.inputProjection??{},node);options.focus(effect.targetId,dataNotice||(effect.inputProjection?'已回放提交欄位；其他資料為來源範例':undefined));return;}
  if(effect.kind==='dialog'&&effect.targetId){popup(effect.targetId);return;}
  if(effect.kind==='api'&&effect.targetId){const target=effect.targetId;say(`${effect.message||`呼叫 API：${effect.method} ${effect.path}`}（不會真的送出）`,{label:'在 API 頁查看',run:()=>options.api(target)});return;}
  if(effect.kind==='external'){say('外部連結（不會開啟）');return;}
  const choices=effect.choices||[];
  if(effect.kind==='form'&&choices.length===1&&choices[0].kind==='navigate'&&choices[0].resolution!=='AMBIGUOUS'&&choices[0].targetId){render(choices[0],record,node);return;}
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
 const change=(node:Element,event='change')=>{
  const record=previewElement(payload,id,node);
  if(!(node.localName==='select'&&event==='change')&&!(payload.graph.behaviors||[]).some(b=>b.triggerId===record?.graphComponentId&&b.event?.split('.')[0]===event))return;
  const result=simulateElement(payload,id,node,dialogIds,undefined,event);
  render(result.effect,result.record,node);
 };
 doc.addEventListener('keypress',event=>{
  const node=eventElement(event.target);if(!node)return;const record=previewElement(payload,id,node);
  for(const b of payload.graph.behaviors||[])if(b.triggerId===record?.graphComponentId&&b.event==='keypress'){
   const action=staticAction(b);if(action?.operation==='keyFilter'&&typeof action.pattern==='string'&&/^\^?\[[A-Za-z0-9 -]+\]\$?$/.test(action.pattern)&&action.pattern.length<=128&&/^(i)?$/.test(action.flags||'')){
    const key=(event as KeyboardEvent).key;if(typeof key==='string')try{if(!new RegExp(action.pattern,action.flags).test(key))event.preventDefault();}catch{}
   }
  }
 },true);
 for(const type of ['keyup','keydown','input','blur','focus'])doc.addEventListener(type,event=>{const node=eventElement(event.target);if(node)change(node,type);},true);
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
