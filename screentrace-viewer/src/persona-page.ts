import {Index} from './map';
import {element,text} from './text';
import {PersonaView,REACH_ORDER,reachLabel,reachText,factLabel} from './personas';

/** Every screen against every persona: where it sits in that persona's flow. */
export function personaPage(index:Index,views:PersonaView[],options:{screens:string[];onOpen:(screenId:string,personaId:string)=>void}):HTMLElement{
 const root=element('section',undefined,'persona-page');root.dataset.personaPage='true';
 const heading=element('div',undefined,'persona-heading');
 heading.append(element('h1','角色比較'),element('p','每個角色從起點網址依序可走到的畫面。確定可達：一路的條件都成立；可能可達：途中有無法判定的條件；未到達：適用但走不到；不適用：條件和角色矛盾。','muted'));
 const facts=element('div',undefined,'persona-facts');
 for(const view of views){
  const card=element('div',undefined,'persona-fact-card');card.dataset.personaFacts=view.persona.id;
  card.append(element('strong',view.persona.name),element('p',view.persona.facts.map(factLabel).join('、')||'（沒有條件）'));
  card.append(element('p',REACH_ORDER.map(r=>`${reachLabel[r]} ${view.counts[r]}`).join(' · '),'muted'));
  if(view.unevaluated)card.append(element('p',`${view.unevaluated} 個導覽的條件無法判定`,'muted'));
  facts.append(card);
 }
 heading.append(facts);
 const scroll=element('div',undefined,'persona-table-scroll'),table=element('table',undefined,'persona-table'),head=element('thead'),headRow=element('tr'),body=element('tbody');
 headRow.append(element('th','畫面'));
 for(const view of views){const th=element('th',view.persona.name);th.dataset.personaColumn=view.persona.id;headRow.append(th);}
 head.append(headRow);
 for(const id of options.screens){
  const screen=index.nodes.get(id);if(!screen)continue;
  const row=element('tr');row.dataset.personaRow=id;
  const name=element('th');name.scope='row';name.append(element('strong',screen.name),element('code',index.routes.get(id)?.[0]||text.noUrl));row.append(name);
  for(const view of views){
   const cell=element('td'),button=element('button',reachText(view,id),'persona-cell');
   button.dataset.reach=view.reach.get(id)!;button.dataset.persona=view.persona.id;button.title=`以「${view.persona.name}」開啟「${screen.name}」`;
   button.onclick=()=>options.onOpen(id,view.persona.id);
   cell.append(button);row.append(cell);
  }
  body.append(row);
 }
 table.append(head,body);scroll.append(table);root.append(heading,scroll);
 return root;
}
