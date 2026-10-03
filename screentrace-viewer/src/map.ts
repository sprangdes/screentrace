import {Graph,Node,Behavior,requireGraph} from './contracts';
export interface Relation {from:string;to:string;triggers:string[];behaviorIds:string[]}
export interface Index {graph:Graph;nodes:Map<string,Node>;screens:Node[];owners:Map<string,string[]>;routes:Map<string,string[]>;relations:Relation[];behaviors:Map<string,Behavior>}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function indexGraph(input:Graph):Index {
 const graph=requireGraph(input),nodes=new Map(graph.nodes.map(n=>[n.id,n])),screens=graph.nodes.filter(n=>n.type==='SCREEN').sort((a,b)=>order(a.id,b.id));
 const edges=graph.relationships||[],owners=new Map<string,string[]>(),routes=new Map(screens.map(s=>[s.id,new Set<string>()]));
 for(const e of edges)if(e.type==='CONTAINS'&&nodes.get(e.from)?.type==='SCREEN'){const list=owners.get(e.to)||[];list.push(e.from);owners.set(e.to,list);}
 for(const [id,ids]of owners)owners.set(id,[...new Set(ids)].sort(order));
 const destinations=(id:string):string[]=>{const result=new Set<string>(),seen=new Set<string>(),queue=[id];for(let i=0;i<queue.length;i++){const current=queue[i];if(seen.has(current))continue;seen.add(current);if(nodes.get(current)?.type==='SCREEN'){result.add(current);continue;}for(const e of edges)if(e.from===current&&['HANDLED_BY','RENDERS','FORWARDS_TO','NAVIGATES_TO'].includes(e.type))queue.push(e.to);}return [...result].sort(order);};
 for(const screen of screens)for(const value of [screen.attributes.route,screen.attributes.url,screen.attributes.path])if(value)routes.get(screen.id)!.add(value);
 for(const n of graph.nodes)if(['ENDPOINT','ENTRY_POINT'].includes(n.type))for(const id of destinations(n.id))for(const value of [n.attributes.path,n.attributes.route,n.attributes.url])if(value)routes.get(id)!.add(value);
 const pairs=new Map<string,Relation>();
 const add=(trigger:string,target:string,behavior?:string)=>{const sources=nodes.get(trigger)?.type==='SCREEN'?[trigger]:owners.get(trigger)||[];for(const from of sources)for(const to of destinations(target)){const key=JSON.stringify([from,to]),r=pairs.get(key)||{from,to,triggers:[],behaviorIds:[]};if(nodes.get(trigger)?.type!=='SCREEN')r.triggers.push(trigger);if(behavior)r.behaviorIds.push(behavior);pairs.set(key,r);}};
 for(const e of edges)if(['NAVIGATES_TO','TRIGGERS','FORWARDS_TO'].includes(e.type))add(e.from,e.to);
 const behaviors=new Map((graph.behaviors||[]).map(b=>[b.id,b]));
 for(const b of behaviors.values())if(b.targetId&&['NAVIGATE','SUBMIT_FORM'].includes(b.type)){let parent=b;const seen=new Set<string>();while(!parent.triggerId&&parent.parentId&&behaviors.has(parent.parentId)&&!seen.has(parent.id)){seen.add(parent.id);parent=behaviors.get(parent.parentId)!;}if(parent.triggerId)add(parent.triggerId,b.targetId,b.id);}
 const relations=[...pairs.values()].sort((a,b)=>order(a.from,b.from)||order(a.to,b.to));for(const r of relations){r.triggers=[...new Set(r.triggers)].sort(order);r.behaviorIds=[...new Set(r.behaviorIds)].sort(order);}
 return {graph,nodes,screens,owners,routes:new Map([...routes].map(([id,set])=>[id,[...set].sort(order)])),relations,behaviors};
}
export interface Position {x:number;y:number}
/** Tarjan SCC condensation, then stable longest-path layers; cycles occupy one layer. */
export function layeredLayout(index:Index):Map<string,Position>{
 const ids=index.screens.map(s=>s.id),links=new Map(ids.map(id=>[id,index.relations.filter(r=>r.from===id).map(r=>r.to).sort(order)]));
 let sequence=0;const numbers=new Map<string,number>(),low=new Map<string,number>(),stack:string[]=[],active=new Set<string>(),groups:string[][]=[];
 const visit=(id:string)=>{numbers.set(id,sequence);low.set(id,sequence++);stack.push(id);active.add(id);for(const to of links.get(id)||[]){if(!numbers.has(to)){visit(to);low.set(id,Math.min(low.get(id)!,low.get(to)!));}else if(active.has(to))low.set(id,Math.min(low.get(id)!,numbers.get(to)!));}if(low.get(id)===numbers.get(id)){const group:string[]=[];let item:string;do{item=stack.pop()!;active.delete(item);group.push(item);}while(item!==id);groups.push(group.sort(order));}};
 for(const id of ids)if(!numbers.has(id))visit(id);groups.sort((a,b)=>order(a[0],b[0]));
 const membership=new Map<string,number>();groups.forEach((g,i)=>g.forEach(id=>membership.set(id,i)));const successors=groups.map(()=>new Set<number>()),indegree=groups.map(()=>0),rank=groups.map(()=>0);
 for(const r of index.relations){const a=membership.get(r.from)!,b=membership.get(r.to)!;if(a!==b&&!successors[a].has(b)){successors[a].add(b);indegree[b]++;}}
 const queue=groups.map((_,i)=>i).filter(i=>!indegree[i]);while(queue.length){queue.sort((a,b)=>a-b);const i=queue.shift()!;for(const j of successors[i]){rank[j]=Math.max(rank[j],rank[i]+1);if(--indegree[j]===0)queue.push(j);}}
 const rows=new Map<number,number>(),positions=new Map<string,Position>();for(const id of ids){const layer=rank[membership.get(id)!],row=rows.get(layer)||0;positions.set(id,{x:40+layer*320,y:40+row*190});rows.set(layer,row+1);}return positions;
}
export function routeMatches(pattern:string,input:string):boolean{const path=input.split(/[?#]/)[0];if(pattern.startsWith('*.'))return path.endsWith(pattern.slice(1));let expression='^';for(let i=0;i<pattern.length;i++){const ch=pattern[i];if(ch==='{'){const end=pattern.indexOf('}',i);if(end>i){expression+='[^/]+';i=end;continue;}}if(ch==='*'){if(pattern[i+1]==='*'){expression+='.*';i++;}else expression+='[^/]*';}else expression+=ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}return new RegExp(expression+'$').test(path);}
export function searchScreens(index:Index,query:string):Set<string>{const q=query.trim().toLowerCase();return new Set(index.screens.filter(s=>!q||[s.name,s.source?.file||'',...(index.routes.get(s.id)||[])].some(value=>value.toLowerCase().includes(q))||(index.routes.get(s.id)||[]).some(route=>routeMatches(route,query.trim()))).map(s=>s.id));}
export function fileEntries(index:Index):{path:string;screenId:string}[]{return index.screens.map(s=>({path:s.attributes.view||s.source?.file||s.name,screenId:s.id})).sort((a,b)=>order(a.path,b.path)||order(a.screenId,b.screenId));}
