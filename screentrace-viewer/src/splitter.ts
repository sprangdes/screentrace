import {element} from './text';

/** How one column of a two-column layout is sized: a share of the layout's width, kept between min and max. */
export interface SplitRange {initial:number;min:number;max:number}

/** A share kept inside its range and rounded to a tenth of a percent, so dragging stays smooth but stable. */
export const clampSplit=(value:number,range:SplitRange)=>Math.round(Math.min(range.max,Math.max(range.min,value))*10)/10;

/**
 * The share a pointer at x gives the sized column: measured from the layout's left edge for a column on the left
 * (`start`), from its right edge for a column on the right (`end`).
 */
export function splitAt(x:number,left:number,width:number,side:'start'|'end',range:SplitRange):number{
 if(width<=0)return range.initial;
 const share=(side==='start'?x-left:left+width-x)/width*100;
 return clampSplit(share,range);
}

export interface SplitterOptions {label:string;side:'start'|'end';range:SplitRange;value:number;onChange:(value:number)=>void}

/**
 * A draggable divider between two columns. The layout reads the sized column's share from `--split` on `host`;
 * the divider is a focusable separator: arrow keys move it by 2%, Home and End go to the ends, and a double click
 * (or Enter) puts it back where it started.
 */
export function splitter(host:HTMLElement,options:SplitterOptions):HTMLElement{
 const {range,side}=options;
 const handle=element('div',undefined,'splitter');
 handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',options.label);
 handle.setAttribute('aria-valuemin',String(range.min));handle.setAttribute('aria-valuemax',String(range.max));
 handle.tabIndex=0;handle.title=`${options.label}：拖曳調整寬度，按兩下恢復預設`;
 const set=(value:number)=>{
  const share=clampSplit(value,range);
  host.style.setProperty('--split',`${share}%`);handle.setAttribute('aria-valuenow',String(Math.round(share)));handle.setAttribute('aria-valuetext',`${Math.round(share)}%`);
  options.onChange(share);return share;
 };
 let value=set(options.value);
 handle.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();handle.setPointerCapture(event.pointerId);handle.classList.add('is-dragging');
  const box=host.getBoundingClientRect();
  const move=(e:PointerEvent)=>{value=set(splitAt(e.clientX,box.left,box.width,side,range));};
  const end=()=>{handle.classList.remove('is-dragging');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);};
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
 });
 handle.addEventListener('dblclick',()=>{value=set(range.initial);});
 handle.addEventListener('keydown',event=>{
  // The arrow moves the divider itself; for a column on the right, moving left makes that column wider.
  const step=event.key==='ArrowRight'?2:event.key==='ArrowLeft'?-2:undefined;
  const next=step!==undefined?value+(side==='start'?step:-step):event.key==='Home'?range.min:event.key==='End'?range.max:event.key==='Enter'?range.initial:undefined;
  if(next===undefined)return;event.preventDefault();value=set(next);
 });
 return handle;
}
