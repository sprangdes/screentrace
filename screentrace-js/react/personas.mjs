import {parseExpression} from '@babel/parser';
import {atoms, unique, contradicts, leaves, implied} from './audience.mjs';

const literal=n=>['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type);
function parts(leaf){try{const n=parseExpression(leaf,{plugins:['typescript']});if(n.type==='BinaryExpression'&&n.operator==='==='&&literal(n.right))return [leaf.slice(n.left.start,n.left.end),leaf.slice(n.right.start,n.right.end)];return [leaf,null];}catch{return null;}}
export function personaDimensions(screens,routeRedirects){
 const sources=[];const add=(expression,source)=>{if(expression)sources.push({expression,source});};
 for(const screen of screens){for(const atom of screen.audience??[])add(atom.raw??atom.text,atom.source);for(const e of screen.load)if(e.type==='NAVIGATE')add(e.guard,e.source);for(const c of screen.components){add(c.guard,{file:c.file,line:c.line});for(const e of c.behaviors)if(e.type==='NAVIGATE')add(e.guard,e.source);}}
 for(const r of routeRedirects)add(r.effect.guard,r.effect.source);
 const map=new Map();for(const {expression,source} of sources)for(const leaf of leaves(expression)){const part=parts(leaf);if(!part)continue;const [text,value]=part;let d=map.get(text);if(!d){d={text,values:new Set(),truthy:false,source};map.set(text,d);}if(value===null)d.truthy=true;else d.values.add(value);if(source&&(source.file<d.source.file||(source.file===d.source.file&&source.line<d.source.line)))d.source=source;}
 const all=[...map.values()].sort((a,b)=>a.text<b.text?-1:a.text>b.text?1:0).map(d=>({...d,values:[...d.values].sort()}));
 const dimensions=all.slice(0,64),diagnostics=all.length>64?[{code:'PERSONA_DIMENSIONS_TRUNCATED',message:'身分維度超過 64 個，只列出前 64 個',source:dimensions[0].source}]:[];return {dimensions,diagnostics};
}
export function normalizePersonas(personas,dimensions){
 const result=[],diagnostics=[];
 for(const persona of personas){const source={file:'workspace:config.json',line:persona.line};const facts=unique(persona.facts.flatMap(f=>atoms(f.truth?f.text:'!('+f.text+')',source)));
  if(contradicts(facts)){diagnostics.push({code:'PERSONA_CONTRADICTORY',message:`角色 ${persona.id} 的條件互相矛盾，已略過`,source});continue;}
  for(const fact of facts)for(const leaf of leaves(fact.text)){const part=parts(leaf);if(!dimensions.some(d=>d.text===leaf||(part&&d.text===part[0]&&d.values.includes(part[1]))))diagnostics.push({code:'PERSONA_FACT_UNMATCHED',message:`角色 ${persona.id} 的條件 ${leaf} 未出現在任何畫面或導覽條件中`,source});}
  result.push({id:persona.id,name:persona.name,startPaths:persona.startPaths,facts});
 }return {personas:result,diagnostics};
}

const expressionOf=a=>a.truth?(a.raw??a.text):`!(${a.raw??a.text})`;
/** APPLIES when every condition is proven, EXCLUDED when one contradicts the persona, otherwise UNKNOWN. */
export function verdict(facts,audience,conditions){
 if(contradicts([...facts,...audience]))return 'EXCLUDED';
 let unknown=audience.some(a=>implied(facts,expressionOf(a))!==true);
 for(const condition of conditions){
  if(!condition)continue;
  const value=implied([...facts,...audience],condition);
  if(value===false)return 'EXCLUDED';
  if(value===null)unknown=true;
 }
 return unknown?'UNKNOWN':'APPLIES';
}

export function applyPersonas(personas,screens,routeRedirects){
 for(const persona of personas){
  for(const screen of screens){
   (screen.personas??={})[persona.id]=verdict(persona.facts,screen.audience??[],[]);
   for(const effect of screen.load)if(effect.type==='NAVIGATE')(effect.personas??={})[persona.id]=verdict(persona.facts,[],[effect.guard]);
   for(const component of screen.components)for(const effect of component.behaviors)
    if(effect.type==='NAVIGATE')(effect.personas??={})[persona.id]=verdict(persona.facts,[],[component.guard,effect.guard]);
  }
  for(const redirect of routeRedirects)if(redirect.effect.type==='NAVIGATE')(redirect.effect.personas??={})[persona.id]=verdict(persona.facts,[],[redirect.effect.guard]);
 }
}
