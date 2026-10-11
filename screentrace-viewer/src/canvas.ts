import {iconButton,icon} from './shell-ui';
import {partitionNavigation,flowLayout,overviewRoute} from './overview';
import {relationTooltip,focusedRelations,FocusRelation} from './relations';
import {Index,fileEntries,searchScreens} from './map';
import {Payload} from './contracts';
import {element,text} from './text';

export interface CanvasTransform {zoom:number;x:number;y:number}
export interface CanvasState {query:string;visible?:Set<string>;screenStatus:(id:string)=>string}
export interface CanvasOptions extends CanvasState {
 transform?:CanvasTransform;
 onTransformChange?:(state:CanvasTransform)=>void;
 /** The person picked a screen: a card, an overview line or a focus line. */
 onOpen:(id:string)=>void;
 /** Builds the full preview of the focused screen inside the given box. */
 renderFocus:(id:string,host:HTMLElement)=>void;
 /** A focus line is hovered (its trigger components) or left (undefined). */
 onLineHover?:(triggers:string[]|undefined)=>void;
 onExitRequest:()=>void;
}
export interface CanvasView {
 element:HTMLElement;
 update(state:CanvasState):void;
 focus(id:string):void;
 exit():void;
 readonly focused:string|undefined;
}

const CARD={width:250,height:220},MOTION_MS=400,BOX_MARGIN={side:96,top:40,bottom:96};
const svgNs='http://www.w3.org/2000/svg';
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const arrowDefs=(id:string,color:string)=>`<defs><marker id="${id}" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${color}"/></marker></defs>`;

/** Lines leaving the focused screen: its screen-specific flows (as drawn on the overview) plus one stub per trigger whose destination is unknown. */
export function focusLines(index:Index,id:string):FocusRelation[]{
 const flows:FocusRelation[]=partitionNavigation(index).flows.filter(r=>r.from===id);
 const unresolved=focusedRelations(index,id).filter(r=>r.unresolved).flatMap(r=>r.triggers.length?r.triggers.map(trigger=>({...r,triggers:[trigger],to:`unresolved:${trigger}`})):[r]);
 return [...flows,...unresolved];
}

/** Screen Map: every screen as a card on one pannable canvas. Opening a screen zooms the same canvas into it. */
export function canvas(index:Index,payload:Payload,options:CanvasOptions):CanvasView{
 const viewport=element('div',undefined,'canvas'),world=element('div',undefined,'world'),controls=element('div',undefined,'canvas-controls');
 viewport.tabIndex=0;viewport.setAttribute('aria-label',text.canvas);viewport.dataset.mode='overview';
 let state:CanvasState={query:options.query,visible:options.visible,screenStatus:options.screenStatus};
 let zoom=options.transform?.zoom??1,x=options.transform?.x??0,y=options.transform?.y??0;
 let focused:string|undefined,overview:CanvasTransform|undefined,sequence=0;
 const apply=(animate=false)=>{
  world.style.transition=animate&&!reducedMotion()?`transform ${MOTION_MS}ms cubic-bezier(.2,.8,.2,1)`:'none';
  world.style.transform=`translate(${x}px, ${y}px) scale(${zoom})`;
  viewport.dataset.semanticZoom=zoom<0.7?'compact':'detail';
  if(!focused&&viewport.dataset.fitted==='true')options.onTransformChange?.({zoom,x,y});
 };
 const layout=flowLayout(index),positions=layout.positions,flows=partitionNavigation(index).flows;
 const width=Math.max(800,...[...positions.values()].map(p=>p.x+340)),height=Math.max(600,...[...positions.values()].map(p=>p.y+335));
 world.style.width=`${width}px`;world.style.height=`${height}px`;
 const visible=(id:string)=>!state.visible||state.visible.has(id);
 const fit=()=>{
  if(!viewport.clientWidth||!viewport.clientHeight||focused)return;
  const shown=index.screens.filter(s=>visible(s.id)).map(s=>positions.get(s.id)!);
  if(!shown.length)return;
  const left=Math.min(...shown.map(p=>p.x)),top=Math.min(...shown.map(p=>p.y)),right=Math.max(...shown.map(p=>p.x+CARD.width)),bottom=Math.max(...shown.map(p=>p.y+CARD.height));
  const w=right-left+80,h=bottom-top+80;
  zoom=Math.min(1,(viewport.clientWidth-48)/w,(viewport.clientHeight-48)/h);
  x=(viewport.clientWidth-w*zoom)/2-(left-40)*zoom;y=(viewport.clientHeight-h*zoom)/2-(top-40)*zoom;
  viewport.dataset.fitted='true';apply();
 };
 const change=(ratio:number)=>{if(focused)return;zoom=Math.max(0.1,Math.min(4,zoom*ratio));viewport.dataset.fitted='true';apply();};
 for(const [label,name,action] of [[text.zoomIn,'zoom',()=>change(1.2)],[text.zoomOut,'minus',()=>change(1/1.2)],[text.reset,'fit',fit]] as const){const button=iconButton(label,name);button.onclick=action;controls.append(button);}

 // ---- overview: cards and their flows
 const svg=document.createElementNS(svgNs,'svg');
 svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.classList.add('relations');svg.innerHTML=arrowDefs('overview-arrow','#64748b');
 const highlight=(lines:Set<Element>,ids:Set<string>)=>{
  svg.querySelectorAll('.relation-line').forEach(line=>{line.classList.toggle('is-highlighted',lines.has(line));line.classList.toggle('is-muted',!lines.has(line));});
  world.querySelectorAll<HTMLElement>('.screen-card').forEach(card=>{const on=ids.has(card.dataset.screen!);card.classList.toggle('is-highlighted',on);card.classList.toggle('is-muted',!on);});
 };
 const clear=()=>world.querySelectorAll('.relation-line,.screen-card').forEach(node=>node.classList.remove('is-highlighted','is-muted'));
 for(const [ordinal,relation] of flows.entries()){
  const line=document.createElementNS(svgNs,'path') as SVGPathElement,target=positions.get(relation.to)!;
  line.setAttribute('d',overviewRoute(positions,relation,ordinal).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
  line.setAttribute('class','relation-line');line.setAttribute('marker-end','url(#overview-arrow)');
  line.dataset.from=relation.from;line.dataset.to=relation.to;line.setAttribute('tabindex','0');line.setAttribute('role','button');
  line.setAttribute('aria-label',`${index.nodes.get(relation.from)!.name} → ${index.nodes.get(relation.to)!.name}`);
  const tooltip=relationTooltip(index,payload,relation);
  tooltip.hidden=true;tooltip.style.position='absolute';tooltip.style.left=`${target.x}px`;tooltip.style.top=`${target.y+140}px`;
  const show=()=>{highlight(new Set([line]),new Set([relation.from,relation.to]));tooltip.hidden=false;},hide=()=>{clear();tooltip.hidden=true;};
  line.addEventListener('mouseenter',show);line.addEventListener('focus',show);line.addEventListener('mouseleave',hide);line.addEventListener('blur',hide);
  line.addEventListener('click',()=>options.onOpen(relation.to));
  line.addEventListener('keydown',event=>{if((event as KeyboardEvent).key==='Enter')options.onOpen(relation.to);});
  svg.append(line);world.append(tooltip);
 }
 world.append(svg);
 const cards=new Map<string,HTMLButtonElement>();
 for(const screen of index.screens){
  const p=positions.get(screen.id)!,card=element('button',undefined,'screen-card'),route=index.routes.get(screen.id)?.[0]||text.noUrl;
  card.dataset.screen=screen.id;card.style.left=`${p.x}px`;card.style.top=`${p.y}px`;card.title=`${screen.name}\n${route}`;
  const thumb=payload.preview.screens?.find(s=>s.graphScreenId===screen.id)?.thumbnail;
  if(thumb?.startsWith('data:image/')){const img=element('img',undefined,'card-preview');img.src=thumb;img.alt=screen.name;if(index.screens.length>150){img.loading='lazy';img.decoding='async';}card.append(img);}
  else{const missing=element('div',undefined,'card-preview missing-preview');missing.append(element('span',text.noPreview));card.append(missing);}
  const caption=element('div',undefined,'screen-caption'),routeLabel=element('span',route,'screen-route');routeLabel.title=route;
  caption.append(element('strong',screen.name),routeLabel);card.append(caption);
  const linked=()=>{if(focused)return;const lines=new Set<Element>(),ids=new Set([screen.id]);svg.querySelectorAll<SVGPathElement>('.relation-line').forEach(line=>{if(line.dataset.from===screen.id||line.dataset.to===screen.id){lines.add(line);ids.add(line.dataset.from!);ids.add(line.dataset.to!);}});highlight(lines,ids);};
  card.onmouseenter=card.onfocus=linked;card.onmouseleave=card.onblur=clear;
  card.onclick=()=>options.onOpen(screen.id);
  world.append(card);cards.set(screen.id,card);
 }
 const sameSet=(a?:Set<string>,b?:Set<string>)=>a===b||!!a&&!!b&&a.size===b.size&&[...a].every(id=>b.has(id));
 const update=(next:CanvasState)=>{
  const refit=!sameSet(next.visible,state.visible);state=next;
  const matches=searchScreens(index,state.query);
  for(const [id,card] of cards){
   card.hidden=!visible(id);card.classList.toggle('search-match',!!state.query&&matches.has(id));
   const status=state.screenStatus(id);card.querySelector('.review-status-icon')?.remove();
   if(status==='KEEP'||status==='REMOVE'){card.dataset.screenStatus=status;const mark=icon(status==='KEEP'?'check':'close');mark.classList.add('review-status-icon');mark.setAttribute('role','img');mark.setAttribute('aria-label',status==='KEEP'?text.keep:text.remove);card.append(mark);}
   else delete card.dataset.screenStatus;
  }
  svg.querySelectorAll<SVGPathElement>('.relation-line').forEach(line=>{line.style.display=visible(line.dataset.from!)&&visible(line.dataset.to!)?'':'none';});
  if(refit&&!focused)fit();
 };

 // ---- focus: the same canvas zoomed onto one screen, with that screen's outgoing lines
 const layer=element('div',undefined,'focus-layer'),lines=document.createElementNS(svgNs,'svg') as SVGSVGElement,tips=element('div',undefined,'focus-tips');
 lines.classList.add('focus-lines');lines.innerHTML=arrowDefs('focus-arrow','#475569');
 layer.hidden=true;lines.style.display='none';
 const box=()=>{const w=viewport.clientWidth,h=viewport.clientHeight;return {left:BOX_MARGIN.side,top:BOX_MARGIN.top,right:w-BOX_MARGIN.side,bottom:h-BOX_MARGIN.bottom,width:Math.max(1,w-2*BOX_MARGIN.side),height:Math.max(1,h-BOX_MARGIN.top-BOX_MARGIN.bottom)};};
 const transformFor=(id:string):CanvasTransform=>{const p=positions.get(id)!,b=box(),z=Math.min(b.width/CARD.width,b.height/CARD.height);return {zoom:z,x:b.left+b.width/2-(p.x+CARD.width/2)*z,y:b.top+b.height/2-(p.y+CARD.height/2)*z};};
 const placeLayer=()=>{const b=box();Object.assign(layer.style,{left:`${b.left}px`,top:`${b.top}px`,width:`${b.width}px`,height:`${b.height}px`});};
 const center=(id:string)=>{const p=positions.get(id)!;return {x:p.x+CARD.width/2,y:p.y+CARD.height/2};};
 const drawLines=(id:string)=>{
  lines.querySelectorAll('g').forEach(g=>g.remove());tips.replaceChildren();
  const b=box(),cx=b.left+b.width/2,cy=b.top+b.height/2,w=viewport.clientWidth,h=viewport.clientHeight,from=center(id);
  lines.setAttribute('width',String(w));lines.setAttribute('height',String(h));
  const relations=focusLines(index,id),known=relations.filter(r=>!r.unresolved&&r.to!==id),loops=relations.filter(r=>r.to===id),stubs=relations.filter(r=>r.unresolved);
  type Segment={relation:FocusRelation;sx:number;sy:number;ex:number;ey:number;d?:string;kind:'known'|'loop'|'unresolved'};
  const segments:Segment[]=[];
  const rays=known.map(relation=>{const to=center(relation.to),dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1;return {relation,ux:dx/length,uy:dy/length,angle:Math.atan2(dy,dx)};}).sort((a,b)=>a.angle-b.angle||(a.relation.to<b.relation.to?-1:1));
  const groups:(typeof rays)[]=[];for(const ray of rays){const last=groups.at(-1);if(last&&ray.angle-last[0].angle<5*Math.PI/180)last.push(ray);else groups.push([ray]);}
  for(const group of groups)group.forEach((ray,i)=>{
   const {ux,uy}=ray,edge=Math.min(ux?b.width/2/Math.abs(ux):Infinity,uy?b.height/2/Math.abs(uy):Infinity);
   const reach=Math.min(ux>0?(w-6-cx)/ux:ux<0?(6-cx)/ux:Infinity,uy>0?(h-6-cy)/uy:uy<0?(6-cy)/uy:Infinity);
   const offset=(i-(group.length-1)/2)*18,nx=-uy*offset,ny=ux*offset;
   segments.push({relation:ray.relation,kind:'known',sx:cx+ux*edge+nx,sy:cy+uy*edge+ny,ex:cx+ux*reach+nx,ey:cy+uy*reach+ny});
  });
  loops.forEach((relation,i)=>{const top=cy-28-i*20,bottom=cy+28+i*20,out=b.right+52+i*14;segments.push({relation,kind:'loop',sx:b.right,sy:top,ex:b.right,ey:bottom,d:`M${b.right},${top} C${out},${top-36} ${out},${bottom+36} ${b.right},${bottom}`});});
  stubs.forEach((relation,i)=>{const sx=b.left+b.width*(i+1)/(stubs.length+1);segments.push({relation,kind:'unresolved',sx,sy:b.bottom,ex:sx,ey:Math.min(h-8,b.bottom+44)});});
  for(const segment of segments){
   const {relation}=segment,target=index.nodes.get(relation.to),group=document.createElementNS(svgNs,'g'),path=segment.d||`M${segment.sx},${segment.sy} L${segment.ex},${segment.ey}`;
   const visibleLine=document.createElementNS(svgNs,'path') as SVGPathElement,hit=document.createElementNS(svgNs,'path') as SVGPathElement;
   visibleLine.setAttribute('d',path);visibleLine.setAttribute('class',`focus-line${segment.kind==='unresolved'?' unresolved':''}`);visibleLine.setAttribute('marker-end','url(#focus-arrow)');
   hit.setAttribute('d',path);hit.setAttribute('class','focus-line-hit');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');
   for(const node of [visibleLine,hit]){node.dataset.from=relation.from;node.dataset.to=relation.to;node.dataset.kind=segment.kind;}
   hit.setAttribute('aria-label',segment.kind==='unresolved'?text.unresolved:segment.kind==='loop'?`回到「${target?.name||''}」`:`前往「${target?.name||''}」`);
   const tip=relationTooltip(index,payload,relation);tip.hidden=true;tip.classList.add('focus-tooltip');tip.dataset.to=relation.to;tips.append(tip);
   const placeTip=(px:number,py:number)=>{tip.hidden=false;const tw=tip.offsetWidth||260,th=tip.offsetHeight||200;tip.style.left=`${Math.max(8,Math.min(w-tw-8,px+14))}px`;tip.style.top=`${Math.max(8,Math.min(h-th-8,py+14))}px`;};
   const show=(px:number,py:number)=>{group.classList.add('is-active');placeTip(px,py);options.onLineHover?.(relation.triggers);};
   const hide=()=>{group.classList.remove('is-active');tip.hidden=true;options.onLineHover?.(undefined);};
   hit.addEventListener('mousemove',event=>{const r=viewport.getBoundingClientRect();show(event.clientX-r.left,event.clientY-r.top);});
   hit.addEventListener('mouseleave',hide);hit.addEventListener('blur',hide);
   hit.addEventListener('focus',()=>show((segment.sx+segment.ex)/2,(segment.sy+segment.ey)/2));
   const open=()=>{if(segment.kind==='known')options.onOpen(relation.to);};
   hit.addEventListener('click',open);hit.addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){event.preventDefault();open();}});
   group.append(visibleLine,hit);lines.append(group);
  }
 };
 const settle=(id:string,token:number)=>{
  if(token!==sequence||focused!==id)return;
  placeLayer();layer.hidden=false;lines.style.display='';
  for(const [cardId,card] of cards)card.classList.toggle('is-dim',cardId!==id);
  cards.get(id)?.classList.add('is-under-focus');
  options.renderFocus(id,layer);drawLines(id);
 };
 const focus=(id:string)=>{
  const token=++sequence,previous=focused;
  if(!previous)overview={zoom,x,y};
  focused=id;viewport.dataset.mode='focus';viewport.dataset.focused=id;
  layer.hidden=true;layer.replaceChildren();lines.style.display='none';tips.replaceChildren();options.onLineHover?.(undefined);
  for(const [cardId,card] of cards){card.classList.toggle('is-dim',cardId!==id&&cardId!==previous);card.classList.remove('is-under-focus');}
  svg.classList.add('is-dim');
  ({zoom,x,y}=transformFor(id));apply(true);
  if(reducedMotion())settle(id,token);else setTimeout(()=>settle(id,token),MOTION_MS);
 };
 const exit=()=>{
  if(!focused)return;
  ++sequence;const leaving=focused;focused=undefined;viewport.dataset.mode='overview';delete viewport.dataset.focused;
  layer.hidden=true;layer.replaceChildren();lines.style.display='none';tips.replaceChildren();options.onLineHover?.(undefined);
  for(const card of cards.values())card.classList.remove('is-dim','is-under-focus');
  svg.classList.remove('is-dim');
  if(overview){({zoom,x,y}=overview);viewport.dataset.fitted='true';apply(true);}else fit();
  cards.get(leaving)?.focus({preventScroll:true});
 };

 viewport.addEventListener('keydown',event=>{
  if(event.target!==viewport||focused)return;
  const step=50;
  if(event.key==='+'||event.key==='=')change(1.2);else if(event.key==='-')change(1/1.2);
  else if(event.key==='ArrowLeft')x+=step;else if(event.key==='ArrowRight')x-=step;
  else if(event.key==='ArrowUp')y+=step;else if(event.key==='ArrowDown')y-=step;else return;
  event.preventDefault();apply();
 });
 let dragging:{x:number;y:number}|undefined;
 viewport.addEventListener('pointerdown',event=>{if(focused||(event.target as Element).closest('button,.relation-line'))return;dragging={x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);});
 viewport.addEventListener('pointermove',event=>{if(!dragging)return;x+=event.clientX-dragging.x;y+=event.clientY-dragging.y;dragging={x:event.clientX,y:event.clientY};apply();});
 for(const name of ['pointerup','pointercancel'])viewport.addEventListener(name,()=>{dragging=undefined;});
 viewport.addEventListener('wheel',event=>{
  if(focused){if(layer.contains(event.target as Node)&&!event.ctrlKey)return;event.preventDefault();if(event.deltaY>0)options.onExitRequest();return;}
  event.preventDefault();change(event.deltaY<0?1.1:1/1.1);
 },{passive:false});
 viewport.append(world,lines,layer,tips,controls);
 update(state);apply();
 let observed:{width:number;height:number}|undefined;
 new ResizeObserver(entries=>{
  const size=entries[0]?.contentRect;if(!size)return;
  const changed=!!observed&&(size.width!==observed.width||size.height!==observed.height);observed={width:size.width,height:size.height};
  if(!changed)return;
  if(focused){({zoom,x,y}=transformFor(focused));apply();placeLayer();if(!layer.hidden)drawLines(focused);}
  else if(!options.transform)fit();
 }).observe(viewport);
 requestAnimationFrame(()=>{if(options.transform){viewport.dataset.fitted='true';apply();}else fit();});
 return {element:viewport,update,focus,exit,get focused(){return focused;}};
}

/** File structure view of the screens, grouped by their source folders. */
export function fileTree(index:Index,query:string,onFocus:(id:string)=>void,options:{visible?:Set<string>;current?:string}={}):HTMLElement{
 const root=element('div',undefined,'file-tree'),folders=new Map<string,HTMLElement>([['',root]]),matches=searchScreens(index,query);
 for(const item of fileEntries(index)){
  if(options.visible&&!options.visible.has(item.screenId))continue;
  if(query&&!matches.has(item.screenId))continue;
  const parts=item.path.split('/');let current='',parent:HTMLElement=root;
  for(const folder of parts.slice(0,-1)){
   current=current?`${current}/${folder}`:folder;
   if(!folders.has(current)){const details=element('details'),children=element('div',undefined,'folder');details.open=true;details.append(element('summary',folder),children);parent.append(details);folders.set(current,children);}
   parent=folders.get(current)!;
  }
  const button=element('button',undefined,'file-entry');
  button.dataset.screen=item.screenId;button.dataset.screenList=item.screenId;
  button.setAttribute('aria-current',options.current===item.screenId?'page':'false');
  button.append(element('strong',parts.at(-1)!),element('span',index.nodes.get(item.screenId)!.name));
  button.onclick=()=>onFocus(item.screenId);
  parent.append(button);
 }
 if(!root.childElementCount)root.append(element('p','沒有符合的畫面','empty-list'));
 return root;
}
