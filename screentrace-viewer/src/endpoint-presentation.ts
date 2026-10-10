import {Node} from './contracts';import {Index} from './map';
export type EndpointGroup='API'|'SCREEN'|'UNCLASSIFIED'|'ALL';
export function endpointGroup(node:Node,index?:Index):EndpointGroup{const category=node.attributes.category;if(!category?.trim())return'UNCLASSIFIED';if(category==='MVC_SCREEN')return'SCREEN';if(category==='ACTION'&&index){const seen=new Set<string>(),walk=(id:string):boolean=>{if(seen.has(id))return false;seen.add(id);const current=index.nodes.get(id);if(current?.type==='SCREEN')return true;return(index.graph.relationships||[]).filter(e=>e.from===id&&['HANDLED_BY','RENDERS','FORWARDS_TO','REDIRECTS_TO','NAVIGATES_TO'].includes(e.type)).some(e=>walk(e.to));};if(walk(node.id))return'SCREEN';}return'API';}
export function endpointAction(index:Index,node:Node,type:string,triggerId?:string):string{
 const path=node.attributes.path||node.attributes.route||node.name,method=node.attributes.httpMethod||node.attributes.method||'ANY';
 if(type==='SUBMIT_FORM')return `送出表單 → ${path}`;
 if(type==='NAVIGATE'||(type!=='CALL_API'&&endpointGroup(node,index)==='SCREEN')){
  const screens=new Set<Node>(),seen=new Set<string>();const walk=(id:string)=>{if(seen.has(id))return;seen.add(id);const current=index.nodes.get(id);if(current?.type==='SCREEN'){screens.add(current);return;}for(const e of index.graph.relationships||[])if(e.from===id&&['HANDLED_BY','RENDERS','FORWARDS_TO','NAVIGATES_TO','REDIRECTS_TO'].includes(e.type))walk(e.to);};walk(node.id);
  return `${screens.size?[...screens].sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`前往「${s.name}」`).join('、'):'前往頁面'} · ${path}`;
 }
 return `呼叫 API：${method} ${path}`;
}
