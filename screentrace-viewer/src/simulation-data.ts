import {Payload,Node as GraphNode,Evidence,Behavior} from './contracts';
import {registerPreviewClone} from './preview';
export interface DataAction {version:1;operation:'readAll'|'readOne'|'upsert'|'delete';collection:string;fields:string[];idField:string;model?:string;conditional?:boolean;inputFields?:Record<string,string>;generatedIdentity?:boolean;useSelectedIdentity?:boolean;scope?:string}
type RecordData=Record<string,string>;
interface Collection {records:Map<string,RecordData>;next:number;selected?:string}
const modelFeedback=new WeakMap<Payload,Map<string,Record<string,string>>>();
export function setModelFeedback(payload:Payload,screen:string,values:Record<string,string>){let map=modelFeedback.get(payload);if(!map){map=new Map();modelFeedback.set(payload,map);}map.set(screen,values);}
const submittedValues=new WeakMap<Payload,Map<string,Record<string,string>>>();
export function setSubmittedValues(payload:Payload,screen:string,fields:Record<string,string>,node:Element){
 let screens=submittedValues.get(payload);if(!screens){screens=new Map();submittedValues.set(payload,screens);}const values:Record<string,string>=Object.create(null);
 const form=node.localName==='form'?node as HTMLFormElement:(node as HTMLButtonElement).form;
 if(form)for(const [key,input]of Object.entries(fields)){const controls=Array.from(form.elements).filter(e=>e.getAttribute('name')===input&&'value'in e&&!e.hasAttribute('disabled'));if(controls.length===1)values[key]=String((controls[0] as HTMLInputElement).value).slice(0,4000);}screens.set(screen,values);
}
const sessions=new WeakMap<Payload,Map<string,Collection>>();
const safeField=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z_][\w]*$/.test(s)&&!['__proto__','prototype','constructor'].includes(s);
export function parseDataAction(value:unknown):DataAction|undefined {
 if(!value||typeof value!=='object')return;const a=value as DataAction;
 if(a.version!==1||!['readAll','readOne','upsert','delete'].includes(a.operation)||typeof a.collection!=='string'||a.collection.length>500||!safeField(a.idField)||!Array.isArray(a.fields)||!a.fields.length||a.fields.length>64||!a.fields.every(safeField)||!a.fields.includes(a.idField)||a.model!==undefined&&!safeField(a.model)||a.conditional!==undefined&&typeof a.conditional!=='boolean')return;
 if(a.inputFields!==undefined&&(!a.inputFields||typeof a.inputFields!=='object'||Object.keys(a.inputFields).length>64||!Object.entries(a.inputFields).every(([field,input])=>a.fields.includes(field)&&safeField(field)&&safeField(input))))return;
 if(a.generatedIdentity!==undefined&&typeof a.generatedIdentity!=='boolean'||a.useSelectedIdentity!==undefined&&typeof a.useSelectedIdentity!=='boolean')return;
 return a;
}
function contract(node:GraphNode|undefined,key:string):DataAction[]{
 if(!node||(node.attributes[key]?.length||0)>16384||!(node.evidence as Evidence[]||[]).some(e=>['SpringDataSimulation','SpringDtoSimulation'].includes(e.parser)&&e.resolution==='INFERRED'))return [];
 try{const raw=JSON.parse(node.attributes[key]||'null');return (key==='simulationBindings'&&Array.isArray(raw)?raw:[raw]).map(parseDataAction).filter((a):a is DataAction=>!!a);}catch{return [];}
}
export function endpointDataAction(payload:Payload,endpoint:string):DataAction|undefined {
 const handlers=(payload.graph.relationships||[]).filter(e=>e.from===endpoint&&e.type==='HANDLED_BY').map(e=>e.to);
 if(handlers.length!==1)return;return contract(payload.graph.nodes.find(n=>n.id===handlers[0]),'simulationData')[0];
}
export function behaviorDataAction(payload:Payload,behavior:Behavior,target:string):DataAction|undefined {
 const direct=endpointDataAction(payload,target);if(direct)return direct;
 const candidates=(payload.graph.relationships||[]).filter(e=>e.from===behavior.triggerId&&e.type==='TRIGGERS').map(e=>endpointDataAction(payload,e.to)).filter((a):a is DataAction=>!!a);
 const unique=new Map(candidates.map(a=>[JSON.stringify(a),a]));return unique.size===1?[...unique.values()][0]:undefined;
}
function collection(payload:Payload,action:DataAction):Collection {
 let session=sessions.get(payload);if(!session){session=new Map();sessions.set(payload,session);}
 let data=session.get(action.collection);if(!data){const seed:RecordData=Object.create(null);for(const field of action.fields)seed[field]=field===action.idField?'1':`示例 ${field}`;data={records:new Map([['1',seed]]),next:2};session.set(action.collection,data);}return data;
}
/** Runs only the tool's CRUD model, with form strings; never source code or requests. */
export function applyDataAction(payload:Payload,action:DataAction,node:Element):boolean {
 const data=collection(payload,action),row=node.closest('[data-st-demo-key]'),key=row?.getAttribute('data-st-demo-key')||undefined;
 if(action.operation==='readOne'){if(!key){data.selected=undefined;return true;}if(!data.records.has(key))return false;data.selected=key;return true;}
 if(action.operation==='delete'){if(!key||!data.records.has(key))return false;data.records.delete(key);return true;}
 if(action.operation!=='upsert')return true;
 const form=node.localName==='form'?node as HTMLFormElement:(node as HTMLButtonElement).form;if(!form)return false;
 const record:RecordData=Object.create(null);let supplied=false;
 for(const field of action.fields){const controls=Array.from(form.elements).filter(e=>e.getAttribute('name')===(action.inputFields?.[field]||field)&&'value'in e&&!e.hasAttribute('disabled'));if(controls.length>1)return false;if(controls.length){record[field]=String((controls[0] as HTMLInputElement).value).slice(0,4000);if(field!==action.idField)supplied=true;}}
 if(!supplied||data.records.size>=200&&!record[action.idField])return false;
 if(action.useSelectedIdentity&&(!data.selected||!data.records.has(data.selected)))return false;
 const id=action.useSelectedIdentity?data.selected!:action.generatedIdentity?String(data.next++):record[action.idField]||String(data.next++);record[action.idField]=id;
 data.records.set(id,{...data.records.get(id),...record});data.selected=id;return true;
}
function pattern(text:string,variable:string,record:RecordData,fields:string[]):string {
 return text.replace(/\$\{([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\}/g,(raw,model,field)=>model===variable&&fields.includes(field)?record[field]??'':raw);
}
/** Called on each focused screen; session data survives focus, but never alters the graph. */
export function projectSimulationData(payload:Payload,id:string,doc:Document):void {
 const submitted=submittedValues.get(payload)?.get(id);for(const node of doc.querySelectorAll<HTMLElement>('[data-st-submitted-key]')){const key=node.dataset.stSubmittedKey!,value=submitted?.[key];if(value===undefined)continue;const format=node.dataset.stSubmittedFormat;if(format){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))continue;const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)continue;const [year,month,day]=value.split('-');if(['dd-MM-yyyy','yyyy-MM-dd','dd/MM/yyyy'].includes(format))node.textContent=format.replace('yyyy',year).replace('MM',month).replace('dd',day);}else node.textContent=value;}
 const feedback=modelFeedback.get(payload)?.get(id);for(const node of doc.querySelectorAll<HTMLElement>('[data-st-model-if]')){const key=node.dataset.stModelIf!;node.hidden=!feedback||!Object.hasOwn(feedback,key)||!feedback[key];}if(feedback)for(const node of doc.querySelectorAll<HTMLElement>('[data-st-model-key]')){const key=node.dataset.stModelKey!;if(Object.hasOwn(feedback,key))node.textContent=feedback[key];}
 const bindings=contract(payload.graph.nodes.find(n=>n.id===id),'simulationBindings');
 for(const binding of bindings){const data=collection(payload,binding);
  if(binding.operation==='readOne'){
   const record=data.selected?data.records.get(data.selected):undefined;if(!record)continue;
   for(const input of doc.querySelectorAll<HTMLInputElement>('input[name],textarea[name],select[name]'))if(binding.fields.includes(input.name)&&record[input.name]!==undefined)input.value=record[input.name];
  }else if(binding.operation==='readAll'){
   for(const node of doc.querySelectorAll<HTMLElement>('[data-st-demo-empty]'))if(node.dataset.stDemoEmpty===binding.collection)node.hidden=node.dataset.stDemoEmptyNegated==='true'?data.records.size===0:data.records.size!==0;
   for(const template of Array.from(doc.querySelectorAll<HTMLElement>('[data-st-demo-row]'))){
    if(template.dataset.stDemoRow!==binding.collection||!safeField(template.dataset.stDemoVariable))continue;
    const variable=template.dataset.stDemoVariable;
    for(const [key,record] of data.records){const row=template.cloneNode(true) as HTMLElement;row.dataset.stDemoKey=key;
     registerPreviewClone(payload,id,template,row);
     for(const node of [row,...row.querySelectorAll<HTMLElement>('[data-st-demo-text],[data-st-demo-attrs],[data-st-demo-parts]')]){
      if(node.dataset.stDemoParts)try{const parts=JSON.parse(node.dataset.stDemoParts);if(Array.isArray(parts)&&parts.length<=64&&parts.every(p=>p&&typeof p==='object'&&Object.keys(p).length===1&&(typeof p.literal==='string'&&p.literal.length<=4000||typeof p.field==='string'&&binding.fields.includes(p.field))))node.textContent=parts.map(p=>p.literal??record[p.field]??'').join('');}catch{}
      if(node.dataset.stDemoText)node.textContent=pattern(node.dataset.stDemoText,variable,record,binding.fields);
      if(node.dataset.stDemoAttrs)try{const attrs=JSON.parse(node.dataset.stDemoAttrs);for(const [name,value] of Object.entries(attrs))if(['href','value','action'].includes(name)&&typeof value==='string')node.setAttribute(name,pattern(value,variable,record,binding.fields));}catch{}
     }
     template.before(row);
    }
    template.remove();
   }
  }
 }
}
