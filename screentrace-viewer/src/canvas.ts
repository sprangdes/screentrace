import {iconButton,icon} from './shell-ui';
import {partitionNavigation,flowLayout,overviewRoute} from './overview';
import {relationTooltip} from './relations';
import {Index,fileEntries,searchScreens} from './map';
import {Payload} from './contracts';
import {element,text} from './text';

export interface CanvasTransform {zoom:number;x:number;y:number}
export interface MapOptions {
 transform?:CanvasTransform;
 onTransformChange?:(state:CanvasTransform)=>void;
 visible?:Set<string>;
 screenStatus?:(id:string)=>string;
}

/** Screen Map: every screen as a card on one pannable canvas, connected by its screen-specific flows. */
export function canvas(index:Index,payload:Payload,query:string,onFocus:(id:string)=>void,options:MapOptions={}):HTMLElement{
 const viewport=element('div',undefined,'canvas'),world=element('div',undefined,'world'),controls=element('div',undefined,'canvas-controls');
 viewport.tabIndex=0;viewport.setAttribute('aria-label',text.canvas);
 let zoom=options.transform?.zoom??1,x=options.transform?.x??0,y=options.transform?.y??0;
 const update=()=>{
  world.style.transform=`translate(${x}px, ${y}px) scale(${zoom})`;
  viewport.dataset.semanticZoom=zoom<0.7?'compact':'detail';
  if(viewport.dataset.fitted==='true')options.onTransformChange?.({zoom,x,y});
 };
 const fit=()=>{
  if(!viewport.clientWidth||!viewport.clientHeight)return;
  const cards=[...world.querySelectorAll<HTMLElement>('.screen-card')];
  const left=Math.min(...cards.map(c=>c.offsetLeft)),top=Math.min(...cards.map(c=>c.offsetTop));
  const right=Math.max(...cards.map(c=>c.offsetLeft+c.offsetWidth)),bottom=Math.max(...cards.map(c=>c.offsetTop+c.offsetHeight));
  if(!cards.length||!Number.isFinite(left))return;
  const width=Math.max(1,right-left+80),height=Math.max(1,bottom-top+80);
  zoom=Math.min(1,(viewport.clientWidth-48)/width,(viewport.clientHeight-48)/height);
  x=(viewport.clientWidth-width*zoom)/2-(left-40)*zoom;
  y=(viewport.clientHeight-height*zoom)/2-(top-40)*zoom;
  viewport.dataset.fitted='true';update();
 };
 const change=(ratio:number)=>{zoom=Math.max(0.1,Math.min(4,zoom*ratio));viewport.dataset.fitted='true';update();};
 for(const [label,name,action] of [[text.zoomIn,'zoom',()=>change(1.2)],[text.zoomOut,'minus',()=>change(1/1.2)],[text.reset,'fit',fit]] as const){
  const button=iconButton(label,name);button.onclick=action;controls.append(button);
 }

 const layout=flowLayout(index),positions=layout.positions,matches=searchScreens(index,query),flows=partitionNavigation(index).flows;
 const visible=(id:string)=>!options.visible||options.visible.has(id);
 const width=Math.max(800,...[...positions.values()].map(p=>p.x+340)),height=Math.max(600,...[...positions.values()].map(p=>p.y+335));
 world.style.width=`${width}px`;world.style.height=`${height}px`;

 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.classList.add('relations');
 svg.innerHTML='<defs><marker id="overview-arrow" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b"/></marker></defs>';
 const highlight=(lines:Set<Element>,cards:Set<string>)=>{
  svg.querySelectorAll('.relation-line').forEach(line=>{line.classList.toggle('is-highlighted',lines.has(line));line.classList.toggle('is-muted',!lines.has(line));});
  world.querySelectorAll<HTMLElement>('.screen-card').forEach(card=>{const on=cards.has(card.dataset.screen!);card.classList.toggle('is-highlighted',on);card.classList.toggle('is-muted',!on);});
 };
 const clear=()=>world.querySelectorAll('.relation-line,.screen-card').forEach(node=>node.classList.remove('is-highlighted','is-muted'));
 for(const [ordinal,relation] of flows.entries()){
  if(!visible(relation.from)||!visible(relation.to))continue;
  const line=document.createElementNS(svg.namespaceURI,'path') as SVGPathElement,target=positions.get(relation.to)!;
  line.setAttribute('d',overviewRoute(positions,relation,ordinal).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
  line.setAttribute('class','relation-line');line.setAttribute('marker-end','url(#overview-arrow)');
  line.dataset.from=relation.from;line.dataset.to=relation.to;
  line.setAttribute('tabindex','0');line.setAttribute('role','button');
  line.setAttribute('aria-label',`${index.nodes.get(relation.from)!.name} → ${index.nodes.get(relation.to)!.name}`);
  const tooltip=relationTooltip(index,payload,relation);
  tooltip.hidden=true;tooltip.style.position='absolute';tooltip.style.left=`${target.x}px`;tooltip.style.top=`${target.y+140}px`;
  const show=()=>{highlight(new Set([line]),new Set([relation.from,relation.to]));tooltip.hidden=false;};
  const hide=()=>{clear();tooltip.hidden=true;};
  line.addEventListener('mouseenter',show);line.addEventListener('focus',show);
  line.addEventListener('mouseleave',hide);line.addEventListener('blur',hide);
  line.addEventListener('click',()=>onFocus(relation.to));
  line.addEventListener('keydown',event=>{if((event as KeyboardEvent).key==='Enter')onFocus(relation.to);});
  svg.append(line);world.append(tooltip);
 }
 world.append(svg);

 for(const screen of index.screens){
  if(!visible(screen.id))continue;
  const p=positions.get(screen.id)!,card=element('button',undefined,'screen-card'),route=index.routes.get(screen.id)?.[0]||text.noUrl;
  card.dataset.screen=screen.id;card.style.left=`${p.x}px`;card.style.top=`${p.y}px`;card.title=`${screen.name}\n${route}`;
  card.classList.toggle('search-match',!!query&&matches.has(screen.id));
  const thumb=payload.preview.screens?.find(s=>s.graphScreenId===screen.id)?.thumbnail;
  if(thumb?.startsWith('data:image/')){const img=element('img',undefined,'card-preview');img.src=thumb;img.alt=screen.name;if(index.screens.length>150){img.loading='lazy';img.decoding='async';}card.append(img);}
  else{const missing=element('div',undefined,'card-preview missing-preview');missing.append(element('span',text.noPreview));card.append(missing);}
  const caption=element('div',undefined,'screen-caption');const routeLabel=element('span',route,'screen-route');routeLabel.title=route;caption.append(element('strong',screen.name),routeLabel);card.append(caption);
  const status=options.screenStatus?.(screen.id);
  if(status==='KEEP'||status==='REMOVE'){
   card.dataset.screenStatus=status;
   const mark=icon(status==='KEEP'?'check':'close');mark.classList.add('review-status-icon');mark.setAttribute('role','img');mark.setAttribute('aria-label',status==='KEEP'?text.keep:text.remove);card.append(mark);
  }
  const linked=()=>{const lines=new Set<Element>(),cards=new Set([screen.id]);svg.querySelectorAll<SVGPathElement>('.relation-line').forEach(line=>{if(line.dataset.from===screen.id||line.dataset.to===screen.id){lines.add(line);cards.add(line.dataset.from!);cards.add(line.dataset.to!);}});highlight(lines,cards);};
  card.onmouseenter=card.onfocus=linked;card.onmouseleave=card.onblur=clear;
  card.onclick=()=>onFocus(screen.id);
  world.append(card);
 }

 viewport.addEventListener('keydown',event=>{
  if(event.target!==viewport)return;
  const step=50;
  if(event.key==='+'||event.key==='=')change(1.2);else if(event.key==='-')change(1/1.2);
  else if(event.key==='ArrowLeft')x+=step;else if(event.key==='ArrowRight')x-=step;
  else if(event.key==='ArrowUp')y+=step;else if(event.key==='ArrowDown')y-=step;else return;
  event.preventDefault();update();
 });
 let dragging:{x:number;y:number}|undefined;
 viewport.addEventListener('pointerdown',event=>{if((event.target as Element).closest('button,.relation-line'))return;dragging={x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);});
 viewport.addEventListener('pointermove',event=>{if(!dragging)return;x+=event.clientX-dragging.x;y+=event.clientY-dragging.y;dragging={x:event.clientX,y:event.clientY};update();});
 for(const name of ['pointerup','pointercancel'])viewport.addEventListener(name,()=>{dragging=undefined;});
 viewport.addEventListener('wheel',event=>{event.preventDefault();change(event.deltaY<0?1.1:1/1.1);},{passive:false});
 viewport.append(world,controls);update();
 let observed:{width:number;height:number}|undefined;
 new ResizeObserver(entries=>{const box=entries[0]?.contentRect;if(!box)return;const changed=!!observed&&(box.width!==observed.width||box.height!==observed.height);observed={width:box.width,height:box.height};if(changed&&!options.transform)fit();}).observe(viewport);
 requestAnimationFrame(()=>{if(options.transform){viewport.dataset.fitted='true';update();}else fit();});
 return viewport;
}

/** File structure view of the screens, grouped by their source folders. */
export function fileTree(index:Index,query:string,onFocus:(id:string)=>void,options:{visible?:Set<string>;current?:string;decorate?:(id:string,row:HTMLElement)=>void}={}):HTMLElement{
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
  const row=element('div',undefined,'file-row'),button=element('button',undefined,'file-entry');
  button.dataset.screen=item.screenId;button.dataset.screenList=item.screenId;
  button.setAttribute('aria-current',options.current===item.screenId?'page':'false');
  button.append(element('strong',parts.at(-1)!),element('span',index.nodes.get(item.screenId)!.name));
  button.onclick=()=>onFocus(item.screenId);
  row.append(button);options.decorate?.(item.screenId,row);parent.append(row);
 }
 if(!root.childElementCount)root.append(element('p','沒有符合的畫面','empty-list'));
 return root;
}
