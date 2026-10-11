import {icon} from './shell-ui';
import {element} from './text';
import {Decision,EffectiveDecision} from './shared/review';
import {decisionTerm} from './terms';

export function decisionLabel(value:EffectiveDecision):string {return decisionTerm(value);}

const choices=['KEEP','REMOVE','UNDECIDED'] as const;

/** Three-state keep／remove／undecided selector implemented as a radiogroup; arrow keys move the choice. */
export function decisionSwitch(label:string,value:Decision,onChange:(value:Decision)=>void,options:{compact?:boolean;screen?:string;component?:string}={}):HTMLElement{
 const group=element('div',undefined,options.compact?'decision-switch compact':'decision-switch');
 group.setAttribute('role','radiogroup');group.setAttribute('aria-label',label);group.dataset.decision=value;
 if(options.screen)group.dataset.screenId=options.screen;
 if(options.component)group.dataset.componentId=options.component;
 const buttons=choices.map(decision=>{
  const button=element('button',undefined,'decision-option');
  button.type='button';button.dataset.decision=decision;
  button.setAttribute('role','radio');button.setAttribute('aria-checked',String(value===decision));
  button.tabIndex=value===decision?0:-1;
  button.append(icon(decision==='KEEP'?'check':decision==='REMOVE'?'close':'question'));
  if(options.compact){button.setAttribute('aria-label',`${label}：${decisionLabel(decision)}`);button.title=decisionLabel(decision);}
  else button.append(element('span',decisionLabel(decision)));
  button.onclick=()=>{if(value!==decision)onChange(decision);};
  button.onkeydown=event=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
   event.preventDefault();
   const next=choices[(choices.indexOf(decision)+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+choices.length)%choices.length];
   const selector=`.decision-switch[data-screen-id="${CSS.escape(options.screen||'')}"]${options.component?`[data-component-id="${CSS.escape(options.component)}"]`:':not([data-component-id])'} [data-decision="${next}"]`;
   onChange(next);
   requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(selector)?.focus());
  };
  return button;
 });
 group.append(...buttons);
 return group;
}
