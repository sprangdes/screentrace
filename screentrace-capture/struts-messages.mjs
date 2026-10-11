import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {readUtf8Limited,resolveExistingFileWithin} from './safe-files.mjs';

const attrs = source => Object.fromEntries([...source.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(match=>[match[1],match[3]]));
const decode = value => value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function propertyMap(source){const result=new Map();for(const line of source.split(/\r?\n/)){if(!line.trim()||/^\s*[#!]/.test(line))continue;const match=line.match(/^\s*((?:\\.|[^:=\s])+)[\s:=]+(.*)$/);if(match)result.set(match[1].replace(/\\([ :=])/g,'$1'),match[2].replace(/\\n/g,'\n').replace(/\\([ :=])/g,'$1'));}return result;}

export async function loadStrutsMessageCatalog(projectRoot,webRoot){
 const resources=[];let webXml='';try{webXml=await readUtf8Limited(projectRoot,path.join(webRoot,'WEB-INF/web.xml'),4*1024*1024);}catch{}
 const configs=new Set([path.join(webRoot,'WEB-INF/struts-config.xml')]);for(const match of webXml.matchAll(/<param-name>\s*config(?:\/[^<]*)?\s*<\/param-name>\s*<param-value>\s*([^<]+)\s*<\/param-value>/gi)){const value=decode(match[1]).trim();if(value.startsWith('/')&&!value.includes('..'))configs.add(path.join(webRoot,value));}
 for(const file of [...configs].sort())try{const source=await readUtf8Limited(projectRoot,await resolveExistingFileWithin(projectRoot,file),4*1024*1024);for(const match of source.matchAll(/<message-resources\b([^>]*?)\/?\s*>/gi)){const item=attrs(match[1]),parameter=(item.parameter||'').replaceAll('.','/');if(parameter)resources.push({key:item.key||'',parameter});}}catch{}
 const bundles=new Map();for(const resource of resources){if(bundles.has(resource.parameter))continue;const candidates=[path.join(webRoot,'WEB-INF/classes',`${resource.parameter}.properties`),path.join(projectRoot,'src/main/resources',`${resource.parameter}.properties`),path.join(projectRoot,'src/main/java',`${resource.parameter}.properties`),path.join(projectRoot,'src/main/webapp/WEB-INF/classes',`${resource.parameter}.properties`)];let values=new Map();for(const candidate of candidates)try{values=propertyMap(await readUtf8Limited(projectRoot,await resolveExistingFileWithin(projectRoot,candidate),4*1024*1024));break;}catch{}bundles.set(resource.parameter,values);}
 return{resources,bundles,defaultBundle:resources.find(resource=>!resource.key)?.parameter||null};
}

export function renderStrutsMessages(source,catalog){
 return source.replace(/<(bean|s):message\b([^>]*?)(?:\/>|>(?:\s*<\/\1:message\s*>)?)/gi,(_tag,_prefix,attributeText)=>{
  const item=attrs(attributeText),key=item.key;if(!key)return '（訊息 key：（未提供））';const selected=item.bundle?catalog.resources.find(resource=>resource.key===item.bundle)?.parameter||item.bundle.replaceAll('.','/'):catalog.defaultBundle;let value=selected?catalog.bundles.get(selected)?.get(key):null;if(value==null)value=`（訊息 key：${key}）`;
  for(let i=0;i<10;i++){const arg=item[`arg${i}`];if(arg!=null)value=value.replaceAll(`{${i}}`,arg.includes('${')||arg.includes('<%')?'示意值':arg);}
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 });
}
