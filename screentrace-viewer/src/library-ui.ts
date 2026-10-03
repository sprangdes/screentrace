import {Payload} from './contracts';import {element} from './text';import {matchLibrary,libraryLabel} from './shared/library';import {ReviewState,effectiveOverride,screenDecision} from './shared/review';import {projectText} from './shared/review-md';
/** Manifest data is text only; docs URLs and usage never become links or active markup. */
export function libraryDetails(payload:Payload,componentId:string):HTMLElement {
 const section=element('section');section.dataset.libraryDetails='true';section.append(element('h3','建議元件'));
 const library=payload.componentLibrary;if(!library){section.append(element('p','未匯入元件庫'));return section;}
 const display=(value:unknown)=>projectText(value,undefined,libraryLabel(library));const match=matchLibrary(payload.graph,library).matches[componentId];section.append(element('p',display(libraryLabel(library))));
 if(!match||match.status==='NONE'){section.append(element('p','無對應元件'));return section;}section.append(element('p',match.status));
 for(const candidate of match.candidates){section.append(element('p',display(candidate.id)),element('p',display(candidate.name)),element('p',display(candidate.status)));for(const input of candidate.inputs)section.append(element('p',display(`${input.name} ← ${input.mapsFromAttribute||'—'} (${input.type})`)));for(const output of candidate.outputs)section.append(element('p',display(`${output.name} ← ${output.mapsFromEvent||'—'}`)));if(candidate.description)section.append(element('p',display(candidate.description)));if(candidate.usage)section.append(element('p',display(candidate.usage.replace(/\r\n|\r|\n/g,'\\n'))));}
 return section;
}
export function libraryOverride(payload:Payload,state:ReviewState,screenId:string,componentId:string,onChange:(id:string)=>void):HTMLElement|undefined {
 const library=payload.componentLibrary;if(!library||screenDecision(state,screenId)!=='KEEP')return undefined;
 const label=element('label','元件庫覆寫'),select=element('select');select.dataset.libraryOverride=componentId;select.setAttribute('aria-label',`元件庫覆寫 ${componentId}`);
 const automatic=element('option','使用自動比對');automatic.value='';select.append(automatic);
 for(const candidate of [...library.manifest.components].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){const option=element('option',projectText(`${candidate.name} (${candidate.id})`,undefined,libraryLabel(library)));option.value=candidate.id;select.append(option);}select.value=effectiveOverride(state,screenId,componentId)||'';select.onchange=()=>onChange(select.value);label.append(select);return label;
}
