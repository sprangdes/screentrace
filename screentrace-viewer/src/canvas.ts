import {iconButton,icon} from './shell-ui';
import {partitionNavigation,flowLayout,roundedPath,commonDestinations} from './overview';
import {relationTooltip,focusedRelations,FocusRelation,sharedNavigation} from './relations';
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
 /** Builds the full preview of the focused screen inside the given box; resolves once it can be shown. */
 renderFocus:(id:string,host:HTMLElement)=>Promise<void>|void;
 /** The person is pointing at a screen they may open next, so its preview can be prepared ahead. */
 onIntent?:(id:string)=>void;
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

const CARD={width:250,height:220},MOTION_MS=450,DENSE_SCREENS=20,BOX_MARGIN={side:56,top:48,bottom:56};
/** The preview fades in over this part of the zoom; if it is still loading, it waits at most READY_MS more. */
const REVEAL={from:0.3,span:0.45},LEAVE_SPAN=0.3,READY_MS=600,FADE_MS=180;
/** Same curve as the side panels' width transition, so the canvas and the panels move as one. */
const ease=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const svgNs='http://www.w3.org/2000/svg';
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
type Edge='right'|'bottom'|'left'|'top';
type Spot={x:number;y:number;edge:Edge};
const LOOP={width:30,height:38,corner:40,step:16};
/** The point on the box edge farthest from every taken point; ties keep the first edge in right, bottom, left, top order. The top edge is skipped while header-link pills occupy the space above it. */
function freeSpot(b:{left:number;top:number;right:number;bottom:number},taken:{x:number;y:number}[],useTop:boolean):Spot{
 const candidates:Spot[]=[];
 const along=(from:number,to:number,place:(v:number)=>Spot)=>{for(let v=from+LOOP.corner;v<=to-LOOP.corner;v+=LOOP.step)candidates.push(place(v));};
 along(b.top,b.bottom,y=>({x:b.right,y,edge:'right'}));along(b.left,b.right,x=>({x,y:b.bottom,edge:'bottom'}));
 along(b.top,b.bottom,y=>({x:b.left,y,edge:'left'}));if(useTop)along(b.left,b.right,x=>({x,y:b.top,edge:'top'}));
 let best=candidates[0]||{x:b.right,y:(b.top+b.bottom)/2,edge:'right' as Edge},score=-1;
 for(const spot of candidates){const near=taken.length?Math.min(...taken.map(p=>Math.hypot(p.x-spot.x,p.y-spot.y))):Infinity;if(near>score+0.5){score=near;best=spot;}}
 return best;
}
/** A small arc leaving the box at the spot and returning beside it, bowed outward from that edge. */
function loopPath(spot:Spot,b:{top:number}){
 const normal={right:{x:1,y:0},left:{x:-1,y:0},bottom:{x:0,y:1},top:{x:0,y:-1}}[spot.edge],tangent={x:-normal.y,y:normal.x};
 // The top edge has only the margin above the box; stay clear of the header-link pills there.
 const height=spot.edge==='top'?Math.min(LOOP.height,Math.max(18,b.top-12)):LOOP.height,half=LOOP.width/2;
 const sx=spot.x-tangent.x*half,sy=spot.y-tangent.y*half,ex=spot.x+tangent.x*half,ey=spot.y+tangent.y*half;
 const c1={x:sx+normal.x*height-tangent.x*8,y:sy+normal.y*height-tangent.y*8},c2={x:ex+normal.x*height+tangent.x*8,y:ey+normal.y*height+tangent.y*8};
 return {sx,sy,ex,ey,d:`M${sx},${sy} C${c1.x},${c1.y} ${c2.x},${c2.y} ${ex},${ey}`};
}
const focusMarkers=['focus-arrow-out','focus-arrow-in','focus-arrow-unresolved'].map(id=>`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L9,5 L1,9 Z"/></marker>`).join('');

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
 let focused:string|undefined,overview:(CanvasTransform&{left:number;top:number})|undefined,sequence=0,frameId=0;
 // Where the canvas sat on the page while showing the overview; a zoom may already have moved it by the time focus() runs.
 let rest:{left:number;top:number}|undefined;
 const keepRest=()=>{if(!focused&&viewport.isConnected){const r=viewport.getBoundingClientRect();rest={left:r.left,top:r.top};}};
 const apply=()=>{
  keepRest();
  world.style.transform=`translate(${x}px, ${y}px) scale(${zoom})`;
  viewport.dataset.semanticZoom=zoom<0.7?'compact':'detail';
  if(!focused&&viewport.dataset.fitted==='true')options.onTransformChange?.({zoom,x,y});
 };
 const layout=flowLayout(index),positions=layout.positions;
 const width=Math.max(800,layout.width),height=Math.max(600,layout.height);
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
 // Arrowheads keep one size and take the colour of their line's state (see .relation-line in viewer.css).
 const marker=(id:string)=>`<marker id="${id}" class="flow-marker" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L9,5 L1,9 Z"/></marker>`;
 svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.classList.add('relations');
 // With many screens the lines step back until a screen or a line is pointed at.
 if(index.screens.length>DENSE_SCREENS)svg.classList.add('is-dense');
 svg.innerHTML=`<defs>${['flow-arrow','flow-arrow-out','flow-arrow-in','flow-arrow-muted'].map(marker).join('')}</defs>`;
 // Highlighted lines are repainted in a top layer; moving the hovered element itself would lose its mouseleave.
 const raised=document.createElementNS(svgNs,'g');raised.setAttribute('class','relation-raised');raised.setAttribute('aria-hidden','true');
 /** Lines leaving the pointed screen are drawn as outgoing, lines arriving as incoming; the rest step back. */
 const highlight=(out:Set<Element>,into:Set<Element>,ids:Set<string>)=>{
  raised.replaceChildren();
  svg.querySelectorAll<SVGPathElement>('.relation-line').forEach(line=>{
   const leaving=out.has(line),arriving=!leaving&&into.has(line);
   line.classList.toggle('is-out',leaving);line.classList.toggle('is-in',arriving);line.classList.toggle('is-muted',!leaving&&!arriving);
   if(leaving||arriving){const copy=line.cloneNode() as SVGPathElement;copy.removeAttribute('tabindex');copy.removeAttribute('role');copy.removeAttribute('aria-label');raised.append(copy);}
  });
  world.querySelectorAll<HTMLElement>('.screen-card').forEach(card=>{const on=ids.has(card.dataset.screen!);card.classList.toggle('is-highlighted',on);card.classList.toggle('is-muted',!on);});
 };
 const clear=()=>{raised.replaceChildren();svg.querySelectorAll('.relation-line').forEach(line=>line.classList.remove('is-out','is-in','is-muted'));world.querySelectorAll('.screen-card').forEach(card=>card.classList.remove('is-highlighted','is-muted'));};
 for(const {relation,points} of layout.routes){
  const group=document.createElementNS(svgNs,'g'),hit=document.createElementNS(svgNs,'path') as SVGPathElement,line=document.createElementNS(svgNs,'path') as SVGPathElement,d=roundedPath(points);
  group.setAttribute('class','relation');hit.setAttribute('d',d);hit.setAttribute('class','relation-hit');hit.setAttribute('aria-hidden','true');
  line.setAttribute('d',d);line.setAttribute('class','relation-line');
  line.dataset.from=relation.from;line.dataset.to=relation.to;line.setAttribute('tabindex','0');line.setAttribute('role','button');
  line.setAttribute('aria-label',`${index.nodes.get(relation.from)!.name} → ${index.nodes.get(relation.to)!.name}`);
  // Every screen is already visible on the overview, so pointing at a line only highlights it and its two ends.
  const show=()=>highlight(new Set([line]),new Set(),new Set([relation.from,relation.to]));
  group.addEventListener('mouseenter',show);group.addEventListener('mouseleave',clear);group.addEventListener('click',()=>options.onOpen(relation.to));
  line.addEventListener('focus',show);line.addEventListener('blur',clear);
  line.addEventListener('keydown',event=>{if((event as KeyboardEvent).key==='Enter')options.onOpen(relation.to);});
  group.append(hit,line);svg.append(group);
 }
 svg.append(raised);world.append(svg);
 const cards=new Map<string,HTMLButtonElement>();
 for(const screen of index.screens){
  const p=positions.get(screen.id)!,card=element('button',undefined,'screen-card'),route=index.routes.get(screen.id)?.[0]||text.noUrl;
  card.dataset.screen=screen.id;card.style.left=`${p.x}px`;card.style.top=`${p.y}px`;card.title=`${screen.name}\n${route}`;
  const thumb=payload.preview.screens?.find(s=>s.graphScreenId===screen.id)?.thumbnail;
  if(thumb?.startsWith('data:image/')){const img=element('img',undefined,'card-preview');img.src=thumb;img.alt=screen.name;if(index.screens.length>150){img.loading='lazy';img.decoding='async';}card.append(img);}
  else{const missing=element('div',undefined,'card-preview missing-preview');missing.append(element('span',text.noPreview));card.append(missing);}
  const caption=element('div',undefined,'screen-caption'),routeLabel=element('span',route,'screen-route');routeLabel.title=route;
  caption.append(element('strong',screen.name),routeLabel);card.append(caption);
  // Header/footer links are not drawn on the overview; a badge still tells that this screen is reachable from them.
  const entries=sharedNavigation(index,screen.id,false).into.length;
  const common=commonDestinations(index).get(screen.id)?.length||0;
  if(common){const badge=element('span',`${common}`,'common-entry');badge.setAttribute('role','img');const label=`可從 ${common} 個畫面直接前往（總覽不逐一畫線，放大畫面時顯示）`;badge.setAttribute('aria-label',label);badge.title=label;badge.dataset.count=String(common);if(entries)badge.classList.add('after-shared');card.append(badge);}
  if(entries){const badge=icon('menu');badge.classList.add('shared-entry');badge.setAttribute('role','img');const label=`可從 ${entries} 個畫面的頁首／頁尾連結進入`;badge.setAttribute('aria-label',label);const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=label;badge.append(title);badge.dataset.count=String(entries);card.append(badge);}
  const linked=()=>{if(focused)return;const out=new Set<Element>(),into=new Set<Element>(),ids=new Set([screen.id]);svg.querySelectorAll<SVGPathElement>('.relation-line').forEach(line=>{const leaving=line.dataset.from===screen.id,arriving=line.dataset.to===screen.id;if(leaving)out.add(line);else if(arriving)into.add(line);if(leaving||arriving){ids.add(line.dataset.from!);ids.add(line.dataset.to!);}});highlight(out,into,ids);};
  card.onmouseenter=card.onfocus=linked;card.onmouseleave=card.onblur=clear;
  card.addEventListener('pointerenter',()=>{if(!frameId)options.onIntent?.(screen.id);});
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
  svg.querySelectorAll<SVGPathElement>('.relation-line').forEach(line=>{(line.parentNode as SVGGElement).style.display=visible(line.dataset.from!)&&visible(line.dataset.to!)?'':'none';});
  if(refit&&!focused)fit();
 };

 // ---- focus: the same canvas zoomed onto one screen, with that screen's outgoing lines
 const newLayer=():HTMLElement=>{const host=element('div',undefined,'focus-layer');host.hidden=true;return host;};
 let layer=newLayer(),leaving:HTMLElement|undefined;
 const lines=document.createElementNS(svgNs,'svg') as SVGSVGElement,tips=element('div',undefined,'focus-tips');
 lines.classList.add('focus-lines');lines.innerHTML=`<defs>${focusMarkers}</defs>`;
 lines.style.display='none';
 const box=()=>{const w=viewport.clientWidth,h=viewport.clientHeight;return {left:BOX_MARGIN.side,top:BOX_MARGIN.top,right:w-BOX_MARGIN.side,bottom:h-BOX_MARGIN.bottom,width:Math.max(1,w-2*BOX_MARGIN.side),height:Math.max(1,h-BOX_MARGIN.top-BOX_MARGIN.bottom)};};
 const transformFor=(id:string):CanvasTransform=>{const p=positions.get(id)!,b=box(),z=Math.min(b.width/CARD.width,b.height/CARD.height);return {zoom:z,x:b.left+b.width/2-(p.x+CARD.width/2)*z,y:b.top+b.height/2-(p.y+CARD.height/2)*z};};
 const placeLayer=(host:HTMLElement=layer)=>{const b=box();Object.assign(host.style,{left:`${b.left}px`,top:`${b.top}px`,width:`${b.width}px`,height:`${b.height}px`});};
 const center=(id:string)=>{const p=positions.get(id)!;return {x:p.x+CARD.width/2,y:p.y+CARD.height/2};};
 // Shared navigation (header/footer links) is summarised as one dashed line each way above the preview box;
 // its label opens the list of screens behind it.
 const drawShared=(id:string,b:ReturnType<typeof box>)=>{
  const shared=sharedNavigation(index,id);
  const sides=[{direction:'in' as const,ids:shared.into,labels:shared.intoLabels,x:b.left+b.width*0.3,text:`頁首／頁尾連結進來 · ${shared.into.length} 個畫面`,heading:'經由頁首／頁尾連結到這裡'},
   {direction:'out' as const,ids:shared.out,labels:shared.outLabels,x:b.left+b.width*0.7,text:`頁首／頁尾連結前往 · ${shared.out.length} 個畫面`,heading:'這個畫面的頁首／頁尾可前往'}];
  for(const side of sides){
   if(!side.ids.length)continue;
   const pill=element('button',side.text,`shared-link is-${side.direction}`);pill.dataset.direction=side.direction;pill.dataset.count=String(side.ids.length);
   pill.setAttribute('aria-haspopup','true');pill.setAttribute('aria-expanded','false');tips.append(pill);
   const top=8,height=pill.offsetHeight||24,width=pill.offsetWidth||200,left=Math.round(side.x-width/2);
   Object.assign(pill.style,{left:`${left}px`,top:`${top}px`});
   const path=document.createElementNS(svgNs,'path'),group=document.createElementNS(svgNs,'g'),[y1,y2]=side.direction==='in'?[top+height,b.top]:[b.top,top+height];
   path.setAttribute('d',`M${side.x},${y1} L${side.x},${y2}`);path.setAttribute('class',`focus-line shared ${side.direction==='in'?'is-in':'is-out'}`);path.dataset.kind=`shared-${side.direction}`;
   group.append(path);lines.append(group);
   const menu=element('div',undefined,'shared-popover');menu.hidden=true;menu.setAttribute('role','menu');menu.dataset.direction=side.direction;
   menu.append(element('strong',side.heading));if(side.labels.length)menu.append(element('p',`連結：${side.labels.join('、')}`));
   for(const other of side.ids){const item=element('button',index.nodes.get(other)?.name||other,'link-row');item.setAttribute('role','menuitem');item.dataset.sharedScreen=other;item.onclick=()=>options.onOpen(other);item.onpointerenter=()=>{if(!frameId)options.onIntent?.(other);};menu.append(item);}
   const close=()=>{menu.hidden=true;pill.setAttribute('aria-expanded','false');};
   pill.onclick=event=>{event.stopPropagation();const open=menu.hidden;tips.querySelectorAll<HTMLElement>('.shared-popover').forEach(m=>{m.hidden=true;});tips.querySelectorAll('.shared-link').forEach(p=>p.setAttribute('aria-expanded','false'));
    if(!open)return;menu.hidden=false;pill.setAttribute('aria-expanded','true');
    menu.style.left=`${Math.max(8,Math.min(viewport.clientWidth-menu.offsetWidth-8,left))}px`;menu.style.top=`${top+height+6}px`;menu.querySelector<HTMLElement>('button')?.focus();};
   menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();pill.focus();}});
   menu.addEventListener('click',event=>event.stopPropagation());
   tips.append(menu);
  }
 };
 viewport.addEventListener('click',()=>tips.querySelectorAll<HTMLElement>('.shared-popover:not([hidden])').forEach(menu=>{menu.hidden=true;}));
 const drawLines=(id:string)=>{
  lines.querySelectorAll('g').forEach(g=>g.remove());tips.replaceChildren();
  const b=box(),cx=b.left+b.width/2,cy=b.top+b.height/2,w=viewport.clientWidth,h=viewport.clientHeight,from=center(id);
  lines.setAttribute('width',String(w));lines.setAttribute('height',String(h));
  // Lines leave toward each destination and arrive from each source, in the directions the overview draws them.
  const relations=focusLines(index,id),known=relations.filter(r=>!r.unresolved&&r.to!==id),loops=relations.filter(r=>r.to===id),stubs=relations.filter(r=>r.unresolved);
  const incoming=partitionNavigation(index).flows.filter(r=>r.to===id&&r.from!==id);
  type Kind='known'|'incoming'|'loop'|'unresolved';
  type Segment={relation:FocusRelation;sx:number;sy:number;ex:number;ey:number;d?:string;kind:Kind};
  const segments:Segment[]=[];
  const rays=[...known.map(relation=>({relation,other:relation.to,kind:'known' as Kind})),...incoming.map(relation=>({relation,other:relation.from,kind:'incoming' as Kind}))]
   .map(ray=>{const to=center(ray.other),dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1;return {...ray,ux:dx/length,uy:dy/length,angle:Math.atan2(dy,dx)};})
   .sort((a,b)=>a.angle-b.angle||(a.other<b.other?-1:a.other>b.other?1:0)||(a.kind<b.kind?-1:a.kind>b.kind?1:0));
  const groups:(typeof rays)[]=[];for(const ray of rays){const last=groups.at(-1);if(last&&ray.angle-last[0].angle<5*Math.PI/180)last.push(ray);else groups.push([ray]);}
  for(const group of groups)group.forEach((ray,i)=>{
   const {ux,uy}=ray,edge=Math.min(ux?b.width/2/Math.abs(ux):Infinity,uy?b.height/2/Math.abs(uy):Infinity);
   const reach=Math.min(ux>0?(w-6-cx)/ux:ux<0?(6-cx)/ux:Infinity,uy>0?(h-6-cy)/uy:uy<0?(6-cy)/uy:Infinity);
   const offset=(i-(group.length-1)/2)*18,nx=-uy*offset,ny=ux*offset,inner={x:cx+ux*edge+nx,y:cy+uy*edge+ny},outer={x:cx+ux*reach+nx,y:cy+uy*reach+ny};
   const [start,end]=ray.kind==='incoming'?[outer,inner]:[inner,outer];
   segments.push({relation:ray.relation,kind:ray.kind,sx:start.x,sy:start.y,ex:end.x,ey:end.y});
  });
  drawShared(id,b);
  stubs.forEach((relation,i)=>{const sx=b.left+b.width*(i+1)/(stubs.length+1);segments.push({relation,kind:'unresolved',sx,sy:b.bottom,ex:sx,ey:Math.min(h-8,b.bottom+44)});});
  // Lines back to this screen sit where the box edge is free: away from every other line's end and the shared links.
  const shared=sharedNavigation(index,id),taken=segments.map(segment=>segment.kind==='incoming'?{x:segment.ex,y:segment.ey}:{x:segment.sx,y:segment.sy});
  if(shared.into.length)taken.push({x:b.left+b.width*0.3,y:b.top});if(shared.out.length)taken.push({x:b.left+b.width*0.7,y:b.top});
  loops.forEach(relation=>{const spot=freeSpot(b,taken,!shared.into.length&&!shared.out.length);taken.push(spot);segments.push({relation,kind:'loop',...loopPath(spot,b)});});
  for(const segment of segments){
   const {relation}=segment,arriving=segment.kind==='incoming',other=arriving?relation.from:relation.to,target=index.nodes.get(other),group=document.createElementNS(svgNs,'g'),path=segment.d||`M${segment.sx},${segment.sy} L${segment.ex},${segment.ey}`;
   const visibleLine=document.createElementNS(svgNs,'path') as SVGPathElement,hit=document.createElementNS(svgNs,'path') as SVGPathElement;
   visibleLine.setAttribute('d',path);visibleLine.setAttribute('class',`focus-line ${segment.kind==='unresolved'?'unresolved':arriving?'is-in':'is-out'}`);
   hit.setAttribute('d',path);hit.setAttribute('class','focus-line-hit');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');
   for(const node of [visibleLine,hit]){node.dataset.from=relation.from;node.dataset.to=relation.to;node.dataset.kind=segment.kind;}
   hit.setAttribute('aria-label',segment.kind==='unresolved'?text.unresolved:segment.kind==='loop'?`回到「${target?.name||''}」`:arriving?`來自「${target?.name||''}」`:`前往「${target?.name||''}」`);
   // An incoming line describes its source screen and the buttons there that lead here.
   const tip=relationTooltip(index,payload,arriving?{...relation,to:relation.from}:relation);tip.hidden=true;tip.classList.add('focus-tooltip');tip.dataset.to=relation.to;tip.dataset.kind=segment.kind;
   if(segment.kind==='known'||arriving)tip.prepend(element('span',arriving?'來自':'前往',`tooltip-direction ${arriving?'is-in':'is-out'}`));
   tips.append(tip);
   const placeTip=(px:number,py:number)=>{tip.hidden=false;const tw=tip.offsetWidth||260,th=tip.offsetHeight||200;tip.style.left=`${Math.max(8,Math.min(w-tw-8,px+14))}px`;tip.style.top=`${Math.max(8,Math.min(h-th-8,py+14))}px`;};
   const show=(px:number,py:number)=>{if((segment.kind==='known'||arriving)&&!frameId)options.onIntent?.(other);group.classList.add('is-active');placeTip(px,py);options.onLineHover?.(arriving?undefined:relation.triggers);};
   const hide=()=>{group.classList.remove('is-active');tip.hidden=true;options.onLineHover?.(undefined);};
   hit.addEventListener('mousemove',event=>{const r=viewport.getBoundingClientRect();show(event.clientX-r.left,event.clientY-r.top);});
   hit.addEventListener('mouseleave',hide);hit.addEventListener('blur',hide);
   hit.addEventListener('focus',()=>show((segment.sx+segment.ex)/2,(segment.sy+segment.ey)/2));
   const open=()=>{if(segment.kind==='known'||arriving)options.onOpen(other);};
   hit.addEventListener('click',open);hit.addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){event.preventDefault();open();}});
   group.append(visibleLine,hit);lines.append(group);
  }
 };
 // Zooming is a shared-element move: the card's thumbnail lands exactly where the page appears in the preview box,
 // and the box travels with the card, so only its frame fades in around a picture that never jumps.
 const aligned=(id:string,host:HTMLElement):CanvasTransform=>{
  const card=cards.get(id),image=card?.querySelector<HTMLImageElement>('img.card-preview'),scroller=host.querySelector<HTMLElement>('.prototype-scroll'),frame=scroller?.offsetParent as HTMLElement|null;
  if(!card||!image?.naturalWidth||!image.naturalHeight||!scroller||!frame||host.hidden)return transformFor(id);
  const page=Math.max(1,payload.preview.screens?.find(s=>s.graphScreenId===id)?.width||1440),b=box(),p=positions.get(id)!;
  const boxWidth=image.clientWidth,boxHeight=image.clientHeight,shown=boxWidth/boxHeight<image.naturalWidth/image.naturalHeight?boxWidth:boxHeight*image.naturalWidth/image.naturalHeight;
  const thumbX=p.x+card.clientLeft+image.offsetLeft+(boxWidth-shown)/2,thumbY=p.y+card.clientTop+image.offsetTop;
  const inner=scroller.clientWidth,scale=Math.min(1,Math.max(1,inner-16)/page);
  const stageX=b.left+frame.offsetLeft+scroller.offsetLeft+scroller.clientLeft+(inner-page*scale)/2,stageY=b.top+frame.offsetTop+scroller.offsetTop+scroller.clientTop;
  const z=page*scale/shown;
  return {zoom:z,x:stageX-thumbX*z,y:stageY-thumbY*z};
 };
 /** Keeps a preview box glued to its card while the world moves. */
 const glue=(host:HTMLElement,id:string)=>{
  placeLayer(host);const a=aligned(id,host),k=zoom/a.zoom,b=box();
  host.style.transformOrigin='0 0';
  host.style.transform=Math.abs(k-1)<1e-4&&Math.abs(x-a.x)<.5&&Math.abs(y-a.y)<.5?'':`translate(${x+(b.left-a.x)*k-b.left}px, ${y+(b.top-a.y)*k-b.top}px) scale(${k})`;
 };
 const origin=()=>{const r=viewport.getBoundingClientRect();return {left:r.left,top:r.top};};
 /** Moves the world to target(), re-read every frame because the side panels resize the canvas meanwhile; scale changes geometrically around anchor. */
 const animate=(target:()=>CanvasTransform,anchor:{x:number;y:number},frame:(t:number)=>void,done:()=>void)=>{
  cancelAnimationFrame(frameId);
  const o=origin(),from={zoom,x:x+o.left,y:y+o.top};let start:number|undefined;
  const step=(now:number)=>{
   start??=now;
   const t=Math.min(1,(now-start)/MOTION_MS),e=ease(t),here=origin(),local=target(),to={zoom:local.zoom,x:local.x+here.left,y:local.y+here.top};
   const z=from.zoom*Math.pow(to.zoom/from.zoom,e);
   const ax=from.x+anchor.x*from.zoom+(to.x+anchor.x*to.zoom-from.x-anchor.x*from.zoom)*e,ay=from.y+anchor.y*from.zoom+(to.y+anchor.y*to.zoom-from.y-anchor.y*from.zoom)*e;
   if(t<1){zoom=z;x=ax-anchor.x*z-here.left;y=ay-anchor.y*z-here.top;}else({zoom,x,y}=local);apply();
   frame(t);
   if(t<1)frameId=requestAnimationFrame(step);else{frameId=0;done();}
  };
  frameId=requestAnimationFrame(step);
 };
 const dropLeaving=()=>{leaving?.remove();leaving=undefined;};
 // A box on its way out is only a picture: it takes no input and is not the current preview.
 const markLeaving=(host:HTMLElement|undefined)=>{if(host){host.classList.add('is-leaving');host.inert=true;}};
 /** The box that is leaving keeps following its card while it fades out. */
 const fadeLeaving=(id:string,t:number,startOpacity:number)=>{
  if(!leaving)return;
  glue(leaving,id);leaving.style.opacity=String(startOpacity*(1-clamp(t/LEAVE_SPAN)));
  if(t>=LEAVE_SPAN)dropLeaving();
 };
 const showLines=(id:string,token:number)=>{
  if(token!==sequence||focused!==id)return;
  lines.style.display='';drawLines(id);lines.classList.add('is-entering');
  requestAnimationFrame(()=>lines.classList.remove('is-entering'));
 };
 const focus=(id:string)=>{
  const token=++sequence,previous=focused,old=previous?layer:undefined,oldOpacity=old?Number(getComputedStyle(old).opacity)||0:0;
  if(!previous){const o=rest??origin();overview={zoom,x,y,left:o.left,top:o.top};}
  focused=id;viewport.dataset.mode='focus';viewport.dataset.focused=id;options.onLineHover?.(undefined);
  clear();svg.classList.add('is-dim');lines.style.display='none';tips.replaceChildren();
  for(const [cardId,card] of cards){card.classList.toggle('is-dim',cardId!==id&&cardId!==previous);card.classList.remove('is-under-focus');card.classList.toggle('is-morphing',cardId===id||cardId===previous);}
  dropLeaving();leaving=old;markLeaving(old);if(!old)layer.remove();
  layer=newLayer();viewport.insertBefore(layer,tips);
  placeLayer();layer.classList.add('is-entering');layer.style.transition='none';layer.style.opacity='0';
  const host=layer;let loaded=false,ready:Promise<void>|undefined;
  // Build the preview after the zoom's first frame so the work never delays its start; the motion is still
  // nearly at rest then, so switching from the approximate to the exact target is invisible.
  const build=()=>{if(ready||token!==sequence)return;host.hidden=false;ready=Promise.resolve(options.renderFocus(id,host)).then(()=>{loaded=true;});};
  const finish=()=>{
   if(token!==sequence)return;
   build();dropLeaving();({zoom,x,y}=aligned(id,host));apply();glue(host,id);
   for(const [cardId,card] of cards){card.classList.toggle('is-dim',cardId!==id);if(cardId!==id)card.classList.remove('is-morphing');}
   const reveal=()=>{
    if(token!==sequence)return;
    host.style.transition='';host.style.opacity='';host.classList.remove('is-entering');
    const hide=()=>{if(token===sequence)cards.get(id)?.classList.add('is-under-focus');};
    if(loaded||reducedMotion())hide();else wait(FADE_MS).then(hide);
    showLines(id,token);
   };
   if(loaded||reducedMotion())reveal();else Promise.race([ready!,wait(READY_MS)]).then(reveal);
  };
  if(reducedMotion()){finish();return;}
  animate(()=>{placeLayer(host);return aligned(id,host);},center(id),t=>{
   if(t>0)build();
   if(previous)fadeLeaving(previous,t,oldOpacity);
   glue(host,id);host.style.opacity=loaded?String(clamp((t-REVEAL.from)/REVEAL.span)):'0';
  },finish);
 };
 const exit=()=>{
  if(!focused)return;
  const token=++sequence,id=focused,host=layer;focused=undefined;viewport.dataset.mode='overview';delete viewport.dataset.focused;
  options.onLineHover?.(undefined);lines.style.display='none';tips.replaceChildren();
  dropLeaving();leaving=host.hidden?undefined:host;markLeaving(leaving);if(host.hidden)host.remove();
  layer=newLayer();viewport.insertBefore(layer,tips);
  const oldOpacity=leaving?Number(getComputedStyle(leaving).opacity)||0:0;if(leaving)leaving.style.transition='none';
  for(const [cardId,card] of cards){card.classList.remove('is-dim','is-under-focus');card.classList.toggle('is-morphing',cardId===id);}
  svg.classList.remove('is-dim');
  // Keyboard focus returns to the card only once the canvas has settled, so its highlighted lines appear at overview scale.
  const end=()=>{if(token!==sequence)return;dropLeaving();cards.get(id)?.classList.remove('is-morphing');viewport.dataset.fitted='true';apply();cards.get(id)?.focus({preventScroll:true});};
  const saved=overview;
  if(!saved){dropLeaving();cards.get(id)?.classList.remove('is-morphing');fit();cards.get(id)?.focus({preventScroll:true});}
  else{
   const target=()=>{const o=origin();return {zoom:saved.zoom,x:saved.x+(saved.left-o.left),y:saved.y+(saved.top-o.top)};};
   if(reducedMotion()){({zoom,x,y}=target());end();}
   else animate(target,center(id),t=>{fadeLeaving(id,t,oldOpacity);if(t>=.5)cards.get(id)?.classList.remove('is-morphing');},end);
  }
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
 viewport.addEventListener('pointerdown',event=>{if(focused||(event.target as Element).closest('button,.relation'))return;dragging={x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);});
 viewport.addEventListener('pointermove',event=>{if(!dragging)return;x+=event.clientX-dragging.x;y+=event.clientY-dragging.y;dragging={x:event.clientX,y:event.clientY};apply();});
 for(const name of ['pointerup','pointercancel'])viewport.addEventListener(name,()=>{dragging=undefined;});
 viewport.addEventListener('wheel',event=>{
  if(focused){if(layer.contains(event.target as Node)&&!event.ctrlKey)return;event.preventDefault();if(event.deltaY>0)options.onExitRequest();return;}
  event.preventDefault();change(event.deltaY<0?1.1:1/1.1);
 },{passive:false});
 const hint=element('p','點選畫面開始確認 · n 下一個未確認 · / 搜尋','canvas-hint');
 viewport.append(world,lines,layer,tips,hint,controls);
 update(state);apply();
 let observed:{width:number;height:number}|undefined;
 new ResizeObserver(entries=>{
  const size=entries[0]?.contentRect;if(!size)return;
  const changed=!!observed&&(size.width!==observed.width||size.height!==observed.height);observed={width:size.width,height:size.height};
  if(!changed||frameId)return;
  keepRest();
  if(focused){
   // Opening or folding a side panel resizes the canvas: keep the screen glued to its preview box.
   placeLayer();({zoom,x,y}=aligned(focused,layer));apply();glue(layer,focused);
   if(lines.style.display!=='none')drawLines(focused);
  }
  else if(!options.transform&&!overview)fit();
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
