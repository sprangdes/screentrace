import path from 'node:path';
import {readUtf8Limited,resolveExistingFileWithin} from './safe-files.mjs';
import {markupTokens,markupAttributes} from './preview-markup.mjs';

const DEFAULT_CONFIG='/WEB-INF/menu-config.xml';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

/**
 * struts-menu: the MenuPlugIn's menuConfig (default /WEB-INF/menu-config.xml) declares <Menu name> with <Item title location|page>.
 * Mirrors io.screentrace.parser.jsp.StrutsMenus; a menu defined twice is left unexpanded.
 */
export async function loadStrutsMenus(projectRoot,webRoot){
 let config;try{config=await readUtf8Limited(projectRoot,await resolveExistingFileWithin(projectRoot,path.join(webRoot,'WEB-INF/struts-config.xml')),4*1024*1024);}catch{return new Map();}
 const declared=[];let inPlugin=false,pending=null;
 for(const token of markupTokens(config)){
  if(token.name==='plug-in'){if(inPlugin)declared.push(pending??DEFAULT_CONFIG);inPlugin=!token.closing&&!token.selfClosing&&String(markupAttributes(token.text).classname??'').endsWith('MenuPlugIn');pending=null;
   if(!token.closing&&token.selfClosing&&String(markupAttributes(token.text).classname??'').endsWith('MenuPlugIn'))declared.push(DEFAULT_CONFIG);}
  else if(inPlugin&&token.name==='set-property'&&!token.closing){const a=markupAttributes(token.text);if(a.property==='menuConfig')pending=a.value;}
 }
 if(inPlugin)declared.push(pending??DEFAULT_CONFIG);
 const menus=new Map(),duplicated=new Set();
 for(const value of declared){const clean=String(value).trim();if(!clean.startsWith('/')||clean.includes('..'))continue;
  let text;try{text=await readUtf8Limited(projectRoot,await resolveExistingFileWithin(projectRoot,path.join(webRoot,clean)),4*1024*1024);}catch{continue;}
  let items=null;
  for(const token of markupTokens(text)){
   if(token.name==='menu'&&token.closing){items=null;continue;}if(token.closing)continue;
   const a=markupAttributes(token.text);
   if(token.name==='menu'&&a.name){if(menus.has(a.name))duplicated.add(a.name);items=[];menus.set(a.name,items);}
   else if(token.name==='item'&&items)items.push({title:a.title??'',href:a.location??a.page??null});
  }
 }
 for(const name of duplicated)menus.delete(name);
 return menus;
}

/** Replaces <prefix:displayMenu name="…"/> of a declared menu with its items as links; the prefix must be bound to the struts-menu taglib. */
export function expandStrutsMenus(source,menus){
 if(!menus.size||!/displaymenu/i.test(source))return source;
 const prefixes=new Set();for(const match of source.matchAll(/<%@\s*taglib\b([\s\S]*?)%>/g)){const a=markupAttributes('<x '+match[1]+'>');if(a.prefix&&String(a.uri??'').includes('struts-menu'))prefixes.add(a.prefix);}
 if(!prefixes.size)return source;
 return markupTokens(source).map(token=>{
  const [prefix,local]=String(token.originalName??'').split(':');
  if(token.closing||!local||!prefixes.has(prefix)||local.toLowerCase()!=='displaymenu')return token.text;
  const items=menus.get(markupAttributes(token.text).name);if(!items)return token.text;
  return items.map(item=>item.href==null?`<span>${escape(item.title)}</span>`:`<a href="${escape(item.href)}">${escape(item.title)}</a>`).join('');
 }).join('');
}
