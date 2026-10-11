/** Neutralize fetching attributes before DOMParser: even detached HTML documents may
 * preload images. This lexical pass only renames attributes; DOMParser still owns
 * HTML parsing. Fetching values are restored solely for embedded allowed data URIs. */
export function inertDocument(html:string):Document {
 const fetching=new Set(['src','srcset','href','poster','data','srcdoc','action','formaction','background','xlink:href','http-equiv']);let result='',i=0;
 while(i<html.length){if(html.startsWith('<!--',i)){const end=html.indexOf('-->',i+4),next=end<0?html.length:end+3;result+=html.slice(i,next);i=next;continue;}if(html[i]!=='<'||!/[a-z]/i.test(html[i+1]||'')){result+=html[i++];continue;}result+=html[i++];while(i<html.length&&!/[\s/>]/.test(html[i]))result+=html[i++];
  while(i<html.length&&html[i]!=='>'){if(/[\s/]/.test(html[i])){result+=html[i++];continue;}const start=i;while(i<html.length&&!/[\s=/>]/.test(html[i]))i++;if(i===start){result+=html[i++];continue;}const name=html.slice(start,i),lower=name.toLowerCase();result+=fetching.has(lower)?'data-st-inert-'+lower.replace(':','-'):name;while(i<html.length&&/\s/.test(html[i]))result+=html[i++];if(html[i]==='='){result+=html[i++];while(i<html.length&&/\s/.test(html[i]))result+=html[i++];const quote=html[i];if(quote==='"'||quote==="'"){result+=html[i++];while(i<html.length&&html[i]!==quote)result+=html[i++];if(i<html.length)result+=html[i++];}else while(i<html.length&&!/[\s>]/.test(html[i]))result+=html[i++];}}
  if(html[i]==='>')result+=html[i++];
 }
 const doc=new DOMParser().parseFromString(result,'text/html');for(const node of doc.querySelectorAll('*'))for(const attr of [...node.attributes])if(attr.name.startsWith('data-st-inert-')){const key=attr.name.slice(14),value=attr.value;node.removeAttribute(attr.name);if((key==='href'&&['A','AREA'].includes(node.tagName))||['action','formaction'].includes(key))node.setAttribute(key,value);else if(['src','poster','background'].includes(key)&&/^data:image\/[\w+.-]+[;,]/i.test(value))node.setAttribute(key,value);else if(key==='href'&&node.tagName==='LINK'&&/^data:text\/css;base64,/i.test(value))node.setAttribute(key,value);}
 return doc;
}
