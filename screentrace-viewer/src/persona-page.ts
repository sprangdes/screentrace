import {Index} from './map';
import {element,text} from './text';
import {PersonaView,reachLabel,reachHelp,reachText,reachSummary,personaDescription,factLabel} from './personas';

/** What a comparison cell says: the step it is reached at, 走不到, or a quiet dash when the screen does not apply. */
export const personaCellText=(view:PersonaView,id:string)=>view.reach.get(id)==='EXCLUDED'?'—':reachText(view,id);

/** Screens in flow order: the earliest step any persona reaches them at, then name; screens no persona reaches come last. */
export function comparisonOrder(index:Index,views:PersonaView[],screens:string[]):string[]{
 const first=(id:string)=>Math.min(...views.map(view=>view.depth.get(id)??Infinity));
 const name=(id:string)=>index.nodes.get(id)?.name||id;
 return [...screens].sort((a,b)=>first(a)-first(b)||name(a).localeCompare(name(b),'zh-Hant')||(a<b?-1:a>b?1:0));
}
/** True when personas see the screen differently, so the row is worth a look. */
export const differs=(views:PersonaView[],id:string)=>new Set(views.map(view=>personaCellText(view,id))).size>1;

/** Every screen against every persona: where it sits in that persona's flow. */
export function personaPage(index:Index,views:PersonaView[],options:{screens:string[];onOpen:(screenId:string,personaId:string)=>void}):HTMLElement{
 const root=element('section',undefined,'persona-page');root.dataset.personaPage='true';
 const heading=element('div',undefined,'persona-heading');
 heading.append(element('h1','角色比較'),element('p',`每個角色從起點網址開始，第幾步會走到哪個畫面。${reachLabel.REACHABLE}：${reachHelp.REACHABLE}；${reachLabel.POSSIBLE}：${reachHelp.POSSIBLE}；${reachLabel.UNREACHED}：${reachHelp.UNREACHED}；—：${reachLabel.EXCLUDED}，${reachHelp.EXCLUDED}。`,'muted'));
 const facts=element('div',undefined,'persona-facts');
 for(const view of views){
  const card=element('div',undefined,'persona-fact-card');card.dataset.personaFacts=view.persona.id;
  card.append(element('strong',view.persona.name),element('p',personaDescription(view.persona)),element('p',reachSummary(view),'muted'));
  if(view.unevaluated)card.append(element('p',`${view.unevaluated} 個導覽的條件程式無法判定`,'muted'));
  const conditions=element('details',undefined,'persona-conditions');conditions.append(element('summary','判定條件'),element('p',view.persona.facts.map(factLabel).join('、')||'（沒有條件）'));card.append(conditions);
  facts.append(card);
 }
 const onlyDiff=element('label',undefined,'persona-toggle'),diffBox=element('input');diffBox.type='checkbox';diffBox.dataset.personaDiff='true';
 onlyDiff.append(diffBox,element('span','只看各角色不同的畫面'));
 heading.append(facts,onlyDiff);
 const scroll=element('div',undefined,'persona-table-scroll'),table=element('table',undefined,'persona-table'),head=element('thead'),headRow=element('tr'),body=element('tbody');
 headRow.append(element('th','畫面'));
 for(const view of views){const th=element('th',view.persona.name);th.dataset.personaColumn=view.persona.id;headRow.append(th);}
 head.append(headRow);
 const rows:{row:HTMLTableRowElement;differs:boolean}[]=[];
 for(const id of comparisonOrder(index,views,options.screens)){
  const screen=index.nodes.get(id);if(!screen)continue;
  const row=element('tr');row.dataset.personaRow=id;
  const name=element('th');name.scope='row';name.append(element('strong',screen.name),element('code',index.routes.get(id)?.[0]||text.noUrl));row.append(name);
  for(const view of views){
   const reach=view.reach.get(id)!,cell=element('td'),button=element('button',personaCellText(view,id),'persona-cell');
   button.dataset.reach=reach;button.dataset.persona=view.persona.id;button.title=`${reachLabel[reach]}：${reachHelp[reach]}。點一下以「${view.persona.name}」開啟「${screen.name}」`;
   button.onclick=()=>options.onOpen(id,view.persona.id);
   cell.append(button);row.append(cell);
  }
  rows.push({row,differs:differs(views,id)});body.append(row);
 }
 diffBox.onchange=()=>{for(const {row,differs:changes} of rows)row.hidden=diffBox.checked&&!changes;};
 table.append(head,body);scroll.append(table);root.append(heading,scroll);
 return root;
}
