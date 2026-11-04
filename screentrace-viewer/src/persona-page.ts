import {Index} from './map';
import {element,text} from './text';
import {PersonaView,Reach,reachLabel,reachHelp,reachText,reachSummary,personaDescription,factLabel} from './personas';

/** What a comparison cell shows: the step number when reached, × when never reached, nothing when it does not apply. */
export const personaCellText=(view:PersonaView,id:string)=>{const step=view.depth.get(id);if(step!==undefined)return String(step);return view.reach.get(id)==='UNREACHED'?'×':'';};

/** Screens in flow order: the earliest step any persona reaches them at, then name; screens no persona reaches come last. */
export function comparisonOrder(index:Index,views:PersonaView[],screens:string[]):string[]{
 const first=(id:string)=>Math.min(...views.map(view=>view.depth.get(id)??Infinity));
 const name=(id:string)=>index.nodes.get(id)?.name||id;
 return [...screens].sort((a,b)=>first(a)-first(b)||name(a).localeCompare(name(b),'zh-Hant')||(a<b?-1:a>b?1:0));
}

export interface ComparisonSection {key:string;label:string;personas:string[];screens:string[];folded:boolean}
/**
 * Screens grouped by which personas reach them (會走到 or 可能走到): screens shared by more personas first, then each
 * persona's own screens in persona order, then screens no persona reaches, folded.
 */
export function comparisonSections(index:Index,views:PersonaView[],screens:string[]):ComparisonSection[]{
 const ids=views.map(view=>view.persona.id),names=new Map(views.map(view=>[view.persona.id,view.persona.name]));
 const byKey=new Map<string,{personas:string[];screens:string[]}>();
 for(const id of comparisonOrder(index,views,screens)){
  const personas=views.filter(view=>view.depth.has(id)).map(view=>view.persona.id),key=personas.join('+')||'none';
  const section=byKey.get(key)||byKey.set(key,{personas,screens:[]}).get(key)!;section.screens.push(id);
 }
 const rank=(personas:string[])=>personas.map(id=>ids.indexOf(id));
 const compare=(a:number[],b:number[])=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;};
 return [...byKey].sort(([ka,a],[kb,b])=>Number(ka==='none')-Number(kb==='none')||b.personas.length-a.personas.length||compare(rank(a.personas),rank(b.personas)))
  .map(([key,section])=>{
   const who=section.personas.map(id=>names.get(id)!);
   const label=!who.length?'沒有角色走得到':who.length===1?`只有${who[0]}`:who.length===ids.length?'所有角色共用':`${who.join('、')}共用`;
   return {key,label,personas:section.personas,screens:section.screens,folded:!who.length};
  });
}

/** One legend mark per state, drawn like the cells. */
function legend():HTMLElement{
 const row=element('div',undefined,'persona-legend-row');
 const items:[Reach,string,string][]=[['REACHABLE','2',`${reachLabel.REACHABLE}（第 2 步）`],['POSSIBLE','2',`${reachLabel.POSSIBLE}（第 2 步）`],['UNREACHED','×',reachLabel.UNREACHED],['EXCLUDED','',`空白：${reachLabel.EXCLUDED}`]];
 for(const [reach,mark,label] of items){const item=element('span',undefined,'persona-legend-item'),dot=element('span',mark,'persona-step');dot.dataset.reach=reach;item.title=reachHelp[reach];item.append(dot,element('span',label));row.append(item);}
 return row;
}

/** Every screen against every persona, grouped by who reaches it; each cell is the step it is reached at. */
export function personaPage(index:Index,views:PersonaView[],options:{screens:string[];thumbnail?:(id:string)=>string|undefined;onOpen:(screenId:string,personaId?:string)=>void;onPersona:(personaId:string)=>void}):HTMLElement{
 const root=element('section',undefined,'persona-page');root.dataset.personaPage='true';
 const heading=element('div',undefined,'persona-heading');
 heading.append(element('h1','角色比較'),element('p','每個畫面在各角色從起點網址開始的第幾步出現；依「哪些角色走得到」分組。點角色名稱看該角色的流程圖，點格子以該角色開啟畫面。','muted'),legend());
 const scroll=element('div',undefined,'persona-table-scroll'),table=element('table',undefined,'persona-table'),head=element('thead'),headRow=element('tr');
 headRow.append(element('th','畫面'));
 for(const view of views){
  const th=element('th');th.dataset.personaColumn=view.persona.id;
  const open=element('button',view.persona.name,'persona-column-name');open.dataset.personaFlow=view.persona.id;open.title=`在畫布上看「${view.persona.name}」的流程`;open.onclick=()=>options.onPersona(view.persona.id);
  const conditions=view.persona.facts.map(factLabel).join('、')||'（沒有條件）';
  const about=element('span',personaDescription(view.persona),'persona-column-about');about.title=`判定條件：${conditions}`;
  th.append(open,about,element('span',reachSummary(view),'persona-column-counts'));
  if(view.unevaluated)th.append(element('span',`${view.unevaluated} 個條件無法判定`,'persona-column-counts'));
  headRow.append(th);
 }
 head.append(headRow);table.append(head);
 for(const section of comparisonSections(index,views,options.screens)){
  const body=element('tbody');body.dataset.personaSection=section.key;
  const titleRow=element('tr',undefined,'persona-section-row'),titleCell=element('th'),toggle=element('button',undefined,'persona-section-toggle');
  titleCell.colSpan=views.length+1;titleCell.scope='rowgroup';
  toggle.append(element('span',section.label,'persona-section-label'),element('span',`${section.screens.length} 個畫面`,'persona-section-count'));
  toggle.setAttribute('aria-expanded',String(!section.folded));titleCell.append(toggle);titleRow.append(titleCell);body.append(titleRow);
  const rows:HTMLTableRowElement[]=[];
  for(const id of section.screens){
   const screen=index.nodes.get(id);if(!screen)continue;
   const row=element('tr');row.dataset.personaRow=id;row.hidden=section.folded;
   const name=element('th');name.scope='row';
   const screenButton=element('button',undefined,'persona-screen');screenButton.title=`開啟「${screen.name}」`;screenButton.onclick=()=>options.onOpen(id);
   const thumb=options.thumbnail?.(id);
   if(thumb){const img=element('img',undefined,'persona-thumb');img.src=thumb;img.alt='';img.loading='lazy';screenButton.append(img);}
   else screenButton.append(element('span',undefined,'persona-thumb missing'));
   const label=element('span',undefined,'persona-screen-text');label.append(element('strong',screen.name),element('code',index.routes.get(id)?.[0]||text.noUrl));screenButton.append(label);
   name.append(screenButton);row.append(name);
   for(const view of views){
    const reach=view.reach.get(id)!,cell=element('td');cell.dataset.reach=reach;cell.dataset.persona=view.persona.id;
    const description=`${view.persona.name}：${reachText(view,id)}`;
    if(reach==='EXCLUDED'){cell.title=description;cell.setAttribute('aria-label',description);}
    else{const button=element('button',personaCellText(view,id),'persona-step');button.dataset.reach=reach;button.setAttribute('aria-label',description);button.title=`${description}（${reachHelp[reach]}）。點一下以「${view.persona.name}」開啟`;button.onclick=()=>options.onOpen(id,view.persona.id);cell.append(button);}
    row.append(cell);
   }
   rows.push(row);body.append(row);
  }
  toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));for(const row of rows)row.hidden=!open;};
  table.append(body);
 }
 scroll.append(table);root.append(heading,scroll);
 return root;
}
