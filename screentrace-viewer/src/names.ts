import {Node} from './contracts';
export interface NameHint {title?:string;heading?:string}
const unsafeSourceMarkup=/(?:data-st-|<\/?[a-z][\w.-]*:[^>]*>|<\/?[a-z][\w.-]*\b[^>]*\bdata-st-[^>]*>)/iu;
// The static preview shows unproven text as this sample value; it never names a screen.
const SAMPLE_TEXT='示例值';
const clean=(value?:string)=>{const text=String(value||'');if(unsafeSourceMarkup.test(text)||text.includes(SAMPLE_TEXT))return '';return text.replace(/\$\{[^{}]*\}|#\{[^{}]*\}|<%[\s\S]*?%>/g,'動態內容').replace(/\s+/g,' ').trim();};
export function humanizeName(value:string):string {
 if(unsafeSourceMarkup.test(value))return '未命名畫面';
 const filename=value.split(/[\\/]/).at(-1)!.replace(/\.[^.]+$/,'');
 return clean(filename.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/[_-]+/g,' ')).replace(/\b[a-z]/g,s=>s.toUpperCase())||'未命名畫面';
}
// A heading shared by a few screens still names each of them (the route tells them apart); one shared by
// more is a layout heading, not a page title.
const SHARED_HEADING_LIMIT=5;
/** Display-only names; graph IDs, evidence and exported source-derived names stay intact. */
export function screenNames(screens:Node[],hints:Map<string,NameHint>,routes:Map<string,string[]>):Map<string,string>{
 const sorted=[...screens].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),counts=new Map<string,number>();
 for(const screen of sorted)for(const value of new Set([clean(hints.get(screen.id)?.title),clean(hints.get(screen.id)?.heading)].filter(Boolean)))counts.set(value,(counts.get(value)||0)+1);
 const names=new Map<string,string>();
 for(const screen of sorted){const hint=hints.get(screen.id)||{},title=clean(hint.title),heading=clean(hint.heading),duplicate=!!title&&counts.get(title)!>1;
 const fallback=screen.attributes.view||screen.attributes.viewIdentifier||screen.source?.file||screen.name;
 const tileName=screen.attributes.tilesDefinition==='true'?clean(screen.attributes.screenName||screen.name):'';
 names.set(screen.id,tileName|| (title&&counts.get(title)===1?title:heading&&counts.get(heading)!<=SHARED_HEADING_LIMIT?heading:duplicate||screen.attributes.view?humanizeName(fallback):clean(screen.attributes.screenName||screen.name)||humanizeName(fallback)));}
 // A route that only forwards elsewhere is named after where it goes.
 for(const screen of sorted){const targets=screen.attributes.redirectTargets;if(targets===undefined)continue;const first=targets.split('|').filter(Boolean)[0],target=first&&first!==screen.id?names.get(first):undefined,wildcard=(routes.get(screen.id)||[]).some(route=>route.includes('*'));
  names.set(screen.id,target?`${wildcard?'其他網址':''}轉址到「${target}」`:'轉址頁');}
 const byId=new Map(screens.map(screen=>[screen.id,screen])),groups=new Map<string,string[]>();for(const [id,name]of names)groups.set(name,[...(groups.get(name)||[]),id]);
 for(const [name,ids]of groups)if(ids.length>1){
  const candidates=new Map(ids.map(id=>{const screen=byId.get(id),source=screen?.attributes.screenNameSourcePath||screen?.attributes.view||screen?.source?.file;return[id,[routes.get(id)?.[0],clean(screen?.attributes.tilesDefinitionName).replace(/^\.+/,''),sourceFileName(source),sourceDirectoryName(source)]];}));
  for(const id of ids){const available=candidates.get(id)!.filter(Boolean),unique=available.find(value=>ids.filter(other=>candidates.get(other)!.includes(value)).length===1);if(unique)names.set(id,`${name}（${unique}）`);}
 }
 return names;
}
function sourceDirectoryName(path?:string):string {
 const parts=String(path||'').replaceAll('\\','/').split('/').filter(Boolean);if(parts.length<2)return '';
 const directory=parts.at(-2)!;return directory==='views'||directory==='jsp'||directory==='webapp'?'':humanizeName(directory);
}
function sourceFileName(path?:string):string {
 const filename=String(path||'').replaceAll('\\','/').split('/').filter(Boolean).at(-1)||'';
 return filename?humanizeName(filename):'';
}
