import {markupTokens,markupAttributes,annotateSource} from './preview-markup.mjs';
import {templatePreview} from './template-preview.mjs';
/** Reads only fragments already proved by the graph. No template engine or source expression execution. */
export async function expandGraphFragments(source,owner,screen,graph,read){
 let refs;try{refs=JSON.parse(screen.attributes?.templateFragments||'[]');}catch{return source;}
 const tokens=markupTokens(source);let result='',cursor=0;
 for(let i=0;i<tokens.length;i++){
  const tag=tokens[i];if(!tag.name||tag.closing)continue;const attrs=markupAttributes(tag.text);if(!attrs['th:replace'])continue;
  const matches=refs.filter(r=>r.ownerFile===owner&&r.line===Number(attrs['data-st-source-line']||tag.line));if(!matches.length)continue;
  const groups=new Set(matches.map(r=>r.file+'#'+r.fragment));if(groups.size!==1)continue;
  const ref=matches[0];if(!Number.isInteger(ref.start)||!Number.isInteger(ref.end)||ref.start<0||ref.end<=ref.start||ref.end-ref.start>8*1024*1024)continue;
  let end=tag.start+tag.text.length;
  if(!tag.selfClosing){let depth=1,closing=-1;for(let j=i+1;j<tokens.length;j++)if(tokens[j].name===tag.name){if(tokens[j].closing)depth--;else if(!tokens[j].selfClosing)depth++;if(!depth){closing=j;break;}}if(closing<0)continue;end=tokens[closing].start+tokens[closing].text.length;i=closing;}
  const original=await read(ref.file);if(ref.end>original.length)continue;
  const values={};for(const [key,value]of Object.entries(ref.parameters||{}))if(matches.every(r=>r.parameters?.[key]===value))values[key]=value;
  let fragment='\n'.repeat(ref.startLine-1)+original.slice(ref.start,ref.end);
  fragment=markupTokens(fragment).map(t=>{
   if(!t.name||t.closing)return t.text;const a=markupAttributes(t.text),test=a['th:if']?.match(/^\$\{([A-Za-z_][\w]*)\s*==\s*'([^']*)'}$/);
   if(test&&Object.hasOwn(values,test[1])&&values[test[1]]!==test[2])return Object.hasOwn(a,'hidden')?t.text:t.text.replace(/\/?>$/,' hidden$&');return t.text;
  }).join('');
  fragment=templatePreview(fragment,{...screen,attributes:{...screen.attributes,view:ref.file}},graph.nodes,graph.relationships);
  fragment=annotateSource(fragment,ref.file,graph.nodes);result+=source.slice(cursor,tag.start)+fragment;cursor=end;
 }
 return result+source.slice(cursor);
}
