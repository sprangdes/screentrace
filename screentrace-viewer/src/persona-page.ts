import {Index} from './map';
import {element,text} from './text';
import {PersonaView,reachLabel,reachHelp,reachSummary,personaDescription,factLabel,flowGroups,reachShares,reachCountsLabel,stepCounts} from './personas';
import {proportionBar} from './proportion';

export interface PersonaOverlap {key:string;label:string;screens:string[]}
/**
 * The screens this persona reaches, split by which other personas also reach them: its own screens first, then
 * screens shared with more personas before fewer, in persona order.
 */
export function personaOverlap(index:Index,views:PersonaView[],view:PersonaView):PersonaOverlap[]{
 const others=views.filter(other=>other!==view),order=new Map(views.map((v,i)=>[v.persona.id,i]));
 const name=(id:string)=>index.nodes.get(id)?.name||id;
 const groups=new Map<string,{with:PersonaView[];screens:string[]}>();
 for(const screen of index.screens){
  if(!view.depth.has(screen.id))continue;
  const sharing=others.filter(other=>other.depth.has(screen.id)),key=sharing.map(other=>other.persona.id).join('+')||'only';
  const group=groups.get(key)||groups.set(key,{with:sharing,screens:[]}).get(key)!;group.screens.push(screen.id);
 }
 const rank=(list:PersonaView[])=>list.map(v=>order.get(v.persona.id)!);
 const compare=(a:number[],b:number[])=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;};
 const byStep=(a:string,b:string)=>view.depth.get(a)!-view.depth.get(b)!||name(a).localeCompare(name(b),'zh-Hant')||(a<b?-1:a>b?1:0);
 return [...groups].sort(([ka,a],[kb,b])=>Number(kb==='only')-Number(ka==='only')||b.with.length-a.with.length||compare(rank(a.with),rank(b.with)))
  .map(([key,group])=>({key,label:key==='only'?'只有這個角色':group.with.length===others.length?'所有角色共用':`和${group.with.map(v=>v.persona.name).join('、')}共用`,screens:group.screens.sort(byStep)}));
}

/** A group's share of the persona's screens as a bar length, rounded to a whole percent and never below 1. */
export const overlapPercent=(count:number,total:number)=>total>0&&count>0?Math.max(1,Math.round(count/total*100)):0;

/** What the page keeps while the report is open: leaving for a screen and coming back finds the same persona. */
const memory={selected:undefined as string|undefined};

export interface PersonaPageOptions {selected?:string;onOpen:(screenId:string,personaId:string)=>void;onPersona:(personaId:string)=>void}

/** The persona page, laid out like the API page: personas on the left, the chosen persona's flow on the right. */
export function personaPage(index:Index,views:PersonaView[],options:PersonaPageOptions):HTMLElement{
 const byId=new Map(views.map(view=>[view.persona.id,view]));
 let selected=[options.selected,memory.selected,views[0]?.persona.id].find(id=>!!id&&byId.has(id));
 const root=element('section',undefined,'api-page persona-page'),master=element('div',undefined,'api-master'),detail=element('aside',undefined,'api-detail');
 root.dataset.personaPage='true';detail.setAttribute('aria-label','角色詳情');
 const head=element('div',undefined,'api-heading'),title=element('h1','角色');
 title.append(element('span',String(views.length),'api-total'));
 head.append(title,element('p','每個角色從起點網址開始，依步數會走到的畫面。','api-intro'));
 const list=element('div',undefined,'api-list');list.setAttribute('role','listbox');list.setAttribute('aria-label','角色清單');
 master.append(head,list);root.append(master,detail);
 const name=(id:string)=>index.nodes.get(id)?.name||id;
 const route=(id:string)=>index.routes.get(id)?.[0]||text.noUrl;

 const select=(id:string,focus=false)=>{
  selected=id;memory.selected=id;
  for(const row of list.querySelectorAll<HTMLElement>('.persona-row')){const on=row.dataset.personaRow===id;row.setAttribute('aria-selected',String(on));row.tabIndex=on?0:-1;if(on&&focus)row.focus();}
  renderDetail();
 };
 for(const view of views){
  const row=element('button',undefined,'api-row persona-row');row.type='button';row.setAttribute('role','option');row.dataset.personaRow=view.persona.id;
  const label=element('span',undefined,'persona-row-text');label.append(element('strong',view.persona.name),element('span',personaDescription(view.persona),'persona-row-about'),proportionBar(reachShares(view),reachCountsLabel(view),'persona-reach-bar',true));
  row.append(label,element('span',reachSummary(view),'api-screen-count'));
  row.onclick=()=>select(view.persona.id);list.append(row);
 }
 list.addEventListener('keydown',event=>{
  const ids=views.map(v=>v.persona.id),at=ids.indexOf(selected||'');
  const target=event.key==='ArrowDown'?ids[Math.min(ids.length-1,at+1)]:event.key==='ArrowUp'?ids[Math.max(0,at-1)]:event.key==='Home'?ids[0]:event.key==='End'?ids.at(-1):undefined;
  if(!target)return;event.preventDefault();select(target,true);
 });

 const section=(heading:string,key:string)=>{const box=element('section',undefined,'api-section');box.dataset.personaSection=key;box.append(element('h3',heading));return box;};
 /** A screen in the flow: its name opens it as this persona; a mark says when reaching it is not certain. */
 const screenLine=(view:PersonaView,id:string)=>{
  const line=element('div',undefined,'persona-screen-line'),link=element('button',name(id),'api-screen-link');link.type='button';link.dataset.personaScreen=id;
  link.onclick=()=>options.onOpen(id,view.persona.id);line.append(link,element('code',route(id),'api-source'));
  const reach=view.reach.get(id)!;
  if(reach==='POSSIBLE'){const mark=element('span',reachLabel.POSSIBLE,'persona-pill');mark.dataset.reach=reach;mark.title=reachHelp.POSSIBLE;line.append(mark);}
  return line;
 };
 /** Screens per step as columns, certain below and possible on top; a column scrolls to its step in the list. */
 const stepChart=(view:PersonaView,flowBox:HTMLElement)=>{
  const chart=element('div',undefined,'persona-step-chart');chart.setAttribute('role','group');chart.setAttribute('aria-label','每一步的畫面數');
  const counts=stepCounts(view),most=Math.max(...counts.map(c=>c.reachable+c.possible));
  for(const count of counts){
   const total=count.reachable+count.possible,key=`step-${count.step}`,label=`第 ${count.step} 步：${reachLabel.REACHABLE} ${count.reachable}、${reachLabel.POSSIBLE} ${count.possible}`;
   const column=element('button',undefined,'persona-step-column');column.type='button';column.dataset.personaStepColumn=key;column.title=label;column.setAttribute('aria-label',label);
   const track=element('span',undefined,'persona-step-track'),stack=element('span',undefined,'persona-step-stack');stack.style.height=`${Math.round(total/most*100)}%`;
   for(const [share,value] of [['POSSIBLE',count.possible],['REACHABLE',count.reachable]] as const)if(value){const part=element('span',undefined,'proportion-part');part.dataset.share=share;part.style.flexGrow=String(value);stack.append(part);}
   track.append(stack);column.append(track,element('span',String(total),'persona-step-count'),element('span',`第 ${count.step} 步`,'persona-step-name'));
   column.onclick=()=>flowBox.querySelector(`[data-persona-step="${key}"]`)?.scrollIntoView({block:'start'});
   chart.append(column);
  }
  return chart;
 };
 /** Screens as compact chips, for the comparison and the screens outside the flow. */
 const chips=(view:PersonaView,ids:string[])=>{const box=element('div',undefined,'api-caller-list');for(const id of ids){const chip=element('button',name(id),'api-caller');chip.type='button';chip.dataset.personaScreen=id;chip.title=route(id);chip.onclick=()=>options.onOpen(id,view.persona.id);box.append(chip);}return box;};
 const fold=(label:string,count:number,key:string,body:HTMLElement)=>{const box=element('details',undefined,'api-shared');box.dataset.personaFold=key;const summary=element('summary');summary.append(element('span',label,'api-shared-name'),element('span',`${count} 個畫面`,'muted'));box.append(summary,body);return box;};

 const renderDetail=()=>{
  detail.replaceChildren();
  const view=selected?byId.get(selected):undefined;
  if(!view){detail.append(element('p','沒有角色','empty-list'));return;}
  const inner=element('div',undefined,'api-detail-inner');inner.dataset.personaDetail=view.persona.id;
  const heading=element('div',undefined,'api-detail-title'),flow=element('button','在畫布上看流程','persona-flow-button');
  flow.type='button';flow.dataset.personaFlow=view.persona.id;flow.onclick=()=>options.onPersona(view.persona.id);
  heading.append(element('h2',view.persona.name,'persona-detail-name'),flow);
  inner.append(heading,element('p',`${personaDescription(view.persona)}。${reachSummary(view)}。`,'api-reason'));

  const conditions=section('判定條件','conditions');
  for(const fact of view.persona.facts){const chip=element('code',factLabel(fact),'persona-fact');chip.dataset.truth=String(fact.truth);conditions.append(chip);}
  if(!view.persona.facts.length)conditions.append(element('p','（沒有條件）','muted'));
  const starts=section('起點','starts');starts.append(element('code',(view.persona.startPaths||[]).join('、')||'/','persona-fact'));
  inner.append(conditions,starts);

  const groups=flowGroups(index,view),steps=groups.filter(g=>g.key.startsWith('step-'));
  const flowBox=section(`流程 ${view.depth.size} 個畫面`,'flow');
  if(!steps.length)flowBox.append(element('p','這個角色從起點走不到任何畫面；請確認設定中的起點網址與條件。','muted'));
  if(view.unevaluated)flowBox.append(element('p',`有 ${view.unevaluated} 個導覽的條件程式無法判定，經過它們的畫面標為「${reachLabel.POSSIBLE}」。`,'muted'));
  if(steps.length>1)flowBox.append(stepChart(view,flowBox));
  for(const group of steps){const step=element('div',undefined,'api-caller-screen persona-step-group');step.dataset.personaStep=group.key;step.append(element('h4',`${group.title} · ${group.screens.length}`,'persona-step-title'));for(const id of group.screens)step.append(screenLine(view,id));flowBox.append(step);}
  inner.append(flowBox);

  if(views.length>1&&view.depth.size){
   const compare=section('和其他角色比較','compare');
   // Each group's bar is as long as its share of this persona's screens, so the groups compare at a glance.
   for(const overlap of personaOverlap(index,views,view)){
    const box=fold(overlap.label,overlap.screens.length,overlap.key,chips(view,overlap.screens));
    const bar=element('span',undefined,'persona-overlap-bar'),fill=element('span',undefined,'persona-overlap-fill');
    bar.setAttribute('aria-hidden','true');bar.dataset.overlap=overlap.key==='only'?'only':'shared';fill.style.width=`${overlapPercent(overlap.screens.length,view.depth.size)}%`;bar.append(fill);
    box.querySelector('summary')!.insertBefore(bar,box.querySelector('summary .muted'));compare.append(box);
   }
   inner.append(compare);
  }
  const outside=groups.filter(g=>g.reach==='UNREACHED'||g.reach==='EXCLUDED');
  if(outside.length){
   const rest=section('流程以外','outside');
   for(const group of outside){const box=fold(group.title,group.screens.length,group.key,chips(view,group.screens));box.title=reachHelp[group.reach];rest.append(box);}
   inner.append(rest);
  }
  detail.append(inner);detail.scrollTop=0;
 };
 if(selected)select(selected);else renderDetail();
 return root;
}
