import {Node} from './contracts';
export interface NameHint {title?:string;heading?:string}
const clean=(value?:string)=>String(value||'').replace(/\$\{[^{}]*\}|#\{[^{}]*\}|<%[\s\S]*?%>/g,'動態內容').replace(/\s+/g,' ').trim();
export function humanizeName(value:string):string {
 const filename=value.split(/[\\/]/).at(-1)!.replace(/\.[^.]+$/,'');
 return clean(filename.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/[_-]+/g,' ')).replace(/\b[a-z]/g,s=>s.toUpperCase())||'未命名畫面';
}
/** Display-only names; graph IDs, evidence and exported source-derived names stay intact. */
export function screenNames(screens:Node[],hints:Map<string,NameHint>,routes:Map<string,string[]>):Map<string,string>{
 const sorted=[...screens].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),counts=new Map<string,number>();
 for(const screen of sorted)for(const value of new Set([clean(hints.get(screen.id)?.title),clean(hints.get(screen.id)?.heading)].filter(Boolean)))counts.set(value,(counts.get(value)||0)+1);
 const names=new Map<string,string>();
 for(const screen of sorted){const hint=hints.get(screen.id)||{},title=clean(hint.title),heading=clean(hint.heading),duplicate=!!title&&counts.get(title)!>1;
 const fallback=screen.attributes.view||screen.attributes.viewIdentifier||screen.source?.file||screen.name;
 names.set(screen.id,title&&counts.get(title)===1?title:heading&&counts.get(heading)===1?heading:duplicate||screen.attributes.view?humanizeName(fallback):clean(screen.attributes.screenName||screen.name)||humanizeName(fallback));}
 const groups=new Map<string,string[]>();for(const [id,name]of names)groups.set(name,[...(groups.get(name)||[]),id]);
 for(const [name,ids]of groups)if(ids.length>1)for(const id of ids)names.set(id,`${name}（${routes.get(id)?.[0]||'沒有已知 URL'}）`);
 const used=new Set<string>();for(const [id,base]of names){let name=base,n=1;while(used.has(name))name=`${base}（${++n}）`;used.add(name);names.set(id,name);}
 return names;
}
