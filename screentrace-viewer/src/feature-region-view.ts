import {Index} from './map';
import {FeatureRegion} from './feature-regions';
import {callSources} from './usage';
import {isAction,kindName} from './labels';
import {ReviewState,componentDecision,screenDecision} from './shared/review';
import {element} from './text';

export function featureRegionView(index:Index,regions:FeatureRegion[],state:ReviewState,review:boolean,onSelect:(key:string)=>void,onFocus:(screenId:string)=>void,onShowAll:()=>void):HTMLElement{
 const root=element('section',undefined,'feature-region-list');root.append(element('h2','功能區域'));
 const all=element('button','顯示全部','feature-region-all');all.onclick=onShowAll;root.append(all);
 const apiByScreen=new Map<string,Set<string>>();for(const [api,callers]of callSources(index.graph))for(const caller of callers){const set=apiByScreen.get(caller.screenId)||new Set<string>();set.add(api);apiByScreen.set(caller.screenId,set);}
 for(const region of regions){
  const ids=region.screenIds,components=ids.flatMap(screenId=>[...(index.owners.entries())].filter(([,owners])=>owners.includes(screenId)).filter(([id])=>{const node=index.nodes.get(id);return node?isAction(index,node):false}).map(([componentId])=>({screenId,componentId}))),total=ids.length+components.length,confirmed=review?ids.filter(id=>screenDecision(state,id)!=='UNDECIDED').length+components.filter(key=>componentDecision(state,key.screenId,key.componentId)!=='UNDECIDED').length:0,apis=new Set(ids.flatMap(id=>[...(apiByScreen.get(id)||[])]));
  const card=element('article',undefined,'feature-region-card');card.dataset.featureRegion=region.key;card.append(element('h3',region.name),element('small',region.basis,'feature-region-basis'),element('p',`畫面 ${ids.length} 個 · 按鈕 ${components.length} 個 · 使用 API ${apis.size} 個`));
  const progress=element('div',review?`確認進度 ${confirmed}／${total}`:`確認進度 ${confirmed}／${total}（開啟確認模式查看）`,'feature-region-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuenow',String(confirmed));progress.setAttribute('aria-valuemax',String(total));progress.classList.toggle('is-grayscale',!review);const bar=element('span');bar.style.width=`${total?confirmed/total*100:0}%`;progress.append(bar);card.append(progress);
  const select=element('button',`只看「${region.name}」區域`,'feature-region-select');select.dataset.selectRegion=region.key;select.onclick=()=>onSelect(region.key);card.append(select);
  const list=element('ul');for(const id of ids){const screen=index.nodes.get(id)!,route=index.routes.get(id)?.[0]||'沒有已知 URL',row=element('li');const button=element('button',`${screen.name} · ${route}`);button.dataset.regionScreen=id;button.onclick=()=>onFocus(id);row.append(button);list.append(row);}card.append(list);root.append(card);
 }
 return root;
}
