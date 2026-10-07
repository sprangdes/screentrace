import {Index} from './map';
import {FEATURE_GROUPING_LABELS,FEATURE_GROUPING_ORDER,FeatureGroupingStrategy,FeatureRegion} from './feature-regions';
import {callSources} from './usage';
import {isAction,kindName} from './labels';
import {ReviewState,componentDecision,screenDecision} from './shared/review';
import {element} from './text';

export function featureRegionView(index:Index,regions:FeatureRegion[],state:ReviewState,review:boolean,strategy:FeatureGroupingStrategy,onGroupingChange:(strategy:FeatureGroupingStrategy)=>void,onSelect:(key:string)=>void,onFocus:(screenId:string)=>void,onShowAll:()=>void):HTMLElement{
 const root=element('section',undefined,'feature-region-list');root.append(element('h2','功能區域'));
 const chooser=element('label','分組依據'),select=element('select');select.setAttribute('aria-label','功能區域分組依據');for(const key of FEATURE_GROUPING_ORDER){const option=element('option',FEATURE_GROUPING_LABELS[key]);option.value=key;select.append(option);}select.value=strategy;select.onchange=()=>onGroupingChange(select.value as FeatureGroupingStrategy);chooser.append(select);root.append(chooser);
 const all=element('button','顯示全部','feature-region-all');all.onclick=onShowAll;root.append(all);
 const apiByScreen=new Map<string,Set<string>>();for(const [api,callers]of callSources(index.graph))for(const caller of callers){const set=apiByScreen.get(caller.screenId)||new Set<string>();set.add(api);apiByScreen.set(caller.screenId,set);}
 for(const region of regions){
  const ids=region.screenIds,components=ids.flatMap(screenId=>[...(index.owners.entries())].filter(([,owners])=>owners.includes(screenId)).filter(([id])=>{const node=index.nodes.get(id);return node?isAction(index,node):false}).map(([componentId])=>({screenId,componentId}))),total=ids.length+components.length,confirmed=ids.filter(id=>screenDecision(state,id)!=='UNDECIDED').length+components.filter(key=>componentDecision(state,key.screenId,key.componentId)!=='UNDECIDED').length,apis=new Set(ids.flatMap(id=>[...(apiByScreen.get(id)||[])]));
  const card=element('article',undefined,'feature-region-card');card.dataset.featureRegion=region.key;card.append(element('h3',region.name),element('small',region.basis,'feature-region-basis'),element('p',`畫面 ${ids.length} 個 · 按鈕 ${components.length} 個 · 使用 API ${apis.size} 個`));
  const progress=element('div',`確認進度 ${confirmed}／${total}`,'feature-region-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuenow',String(confirmed));progress.setAttribute('aria-valuemax',String(total));const bar=element('span');bar.style.width=`${total?confirmed/total*100:0}%`;progress.append(bar);card.append(progress);
  const select=element('button',`只看「${region.name}」區域`,'feature-region-select');select.dataset.selectRegion=region.key;select.onclick=()=>onSelect(region.key);card.append(select);
  const list=element('ul');for(const id of ids){const screen=index.nodes.get(id)!,route=index.routes.get(id)?.[0]||'沒有已知 URL',row=element('li'),path=[screen.source?.file,screen.attributes.view].map(value=>String(value||'').replaceAll('\\','/')).find(value=>/\.jspx?$/i.test(value)),suffix=strategy==='jsp-directory'&&!path?'無對應 JSP 檔':route;const button=element('button',`${screen.name} · ${suffix}`);button.dataset.regionScreen=id;button.onclick=()=>onFocus(id);row.append(button);list.append(row);}card.append(list);root.append(card);}
 return root;
}
