import {Payload} from './contracts';
import {element} from './text';
import {matchLibrary,libraryLabel} from './shared/library';
import {ReviewState,effectiveOverride,screenDecision} from './shared/review';
import {projectText} from './shared/review-md';

const stripFence=(value:string):string=>{const start=value.match(/^(`+) /);return start&&value.endsWith(' '+start[1])?value.slice(start[0].length,-(start[1].length+1)):value;};
const safeText=(value:unknown,reference?:string):string=>stripFence(projectText(value,undefined,reference));
const statusLabel=(status:string):string=>({MATCH:'已對應',AMBIGUOUS:'有多個候選',NONE:'尚無建議',stable:'穩定版',beta:'測試版',deprecated:'已停止維護',experimental:'實驗版'}[status]||'狀態待確認');
function technicalValue(label:string,value:unknown,reference:string):HTMLElement {const row=element('p');row.append(document.createTextNode(`${label}：`),element('code',safeText(value,reference)));return row;}

/** Manifest data is text only; docs URLs and usage never become links or active markup. */
export function libraryDetails(payload:Payload,componentId:string):HTMLElement {
 const section=element('section');section.dataset.libraryDetails='true';section.append(element('h3','建議元件'));
 const library=payload.componentLibrary;if(!library){section.append(element('p','未匯入元件庫'));return section;}
 const match=matchLibrary(payload.graph,library).matches[componentId];
 if(!match||match.status==='NONE'){section.append(element('p','尚無建議'));return section;}
 section.append(element('p',statusLabel(match.status)));
 for(const candidate of match.candidates){const summary=element('p');summary.append(document.createTextNode(`${match.status==='MATCH'?'建議元件':'候選元件'}：`),element('code',safeText(candidate.name,libraryLabel(library))));section.append(summary);}
 const technical=element('details');technical.append(element('summary','技術細節'));
 technical.append(technicalValue('元件庫版本',libraryLabel(library),libraryLabel(library)),technicalValue('元件識別值',componentId,libraryLabel(library)),technicalValue('比對結果',match.status,libraryLabel(library)));
 for(const candidate of match.candidates){
  technical.append(element('h4',safeText(candidate.name,libraryLabel(library))),technicalValue('元件識別值',candidate.id,libraryLabel(library)),technicalValue('狀態',candidate.status,libraryLabel(library)),technicalValue('選擇器',candidate.selector,libraryLabel(library)),technicalValue('分類',candidate.category,libraryLabel(library)));
  for(const input of candidate.inputs)technical.append(technicalValue('輸入對照',`${input.name} ← ${input.mapsFromAttribute||'—'} (${input.type})`,libraryLabel(library)));
  for(const output of candidate.outputs)technical.append(technicalValue('輸出對照',`${output.name} ← ${output.mapsFromEvent||'—'}`,libraryLabel(library)));
  if(candidate.description)technical.append(technicalValue('說明',candidate.description,libraryLabel(library)));
  if(candidate.usage)technical.append(technicalValue('使用範例',candidate.usage.replace(/\r\n|\r|\n/g,'\\n'),libraryLabel(library)));
 }
 section.append(technical);
 return section;
}

export function libraryOverride(payload:Payload,state:ReviewState,screenId:string,componentId:string,onChange:(id:string)=>void):HTMLElement|undefined {
 const library=payload.componentLibrary;if(!library||screenDecision(state,screenId)!=='KEEP')return undefined;
 const label=element('label','元件庫覆寫'),select=element('select');select.dataset.libraryOverride=componentId;select.setAttribute('aria-label',`元件庫覆寫 ${componentId}`);
 const automatic=element('option','使用自動比對');automatic.value='';select.append(automatic);
 for(const candidate of [...library.manifest.components].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){const option=element('option',safeText(`${candidate.name} (${candidate.id})`,libraryLabel(library)));option.value=candidate.id;select.append(option);}select.value=effectiveOverride(state,screenId,componentId)||'';select.onchange=()=>onChange(select.value);label.append(select);return label;
}
