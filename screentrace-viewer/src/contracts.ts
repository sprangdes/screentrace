export interface Source {file:string;line:number;className?:string;methodName?:string}
export interface Node {id:string;type:string;name:string;attributes:Record<string,string>;source?:Source;confidence:string;evidence?:unknown[]}
export interface Edge {id:string;type:string;from:string;to:string;source?:Source;confidence:string}
export interface Evidence {source?:Source;parser:string;resolution:string;detail?:string}
export interface Rule {id:string;kind:string;fields:string[];message?:string;layer:string;parameters:Record<string,string>;evidence:Evidence[]}
export interface Contract {endpointId:string;request?:unknown;responses?:unknown[];source?:Source;confidence:string}
export interface Behavior {id:string;triggerId?:string;parentId?:string;type:string;event?:string;targetId?:string;expression?:string;condition?:string;guard?:string;attributes?:Record<string,string>;source?:Source;confidence?:string;evidence?:Evidence[]}
export interface Graph {schemaVersion:string;application:{name:string;path?:string;technologies?:string[]};nodes:Node[];relationships?:Edge[];behaviors?:Behavior[];diagnostics?:unknown[];validationRules?:Rule[];apiContracts?:Contract[]}
export interface ElementRecord {unmappedReason?:import('./simulation').UnmappedReason;expansionAnchor?:string;matchBasis?:'ANCHOR'|'HEURISTIC';graphScreenId:string;path:string;tag:string;id?:string;name?:string;className?:string;text:string;bounds:{x:number;y:number;width:number;height:number};styleId:string;defaultId:string;graphComponentId?:string;graphComponentCandidates?:string[];componentResolution?:string;conditions?:string[];source?:Source}
export interface PreviewScreen {graphScreenId:string;width:number;height:number;rendering?:{mode:string;diagnostic?:string};dynamicExpressions?:string[];thumbnail?:string;diagnostics?:{code:string;message:string}[]}
export interface Preview {version:string;screens?:PreviewScreen[];elements?:ElementRecord[];styles?:Record<string,Record<string,string>>;defaults?:Record<string,Record<string,string>>;diagnostics?:unknown[]}
export interface Payload {componentLibrary?:import("./shared/library").Library;graph:Graph;preview:Preview;documents:Record<string,string>;manifest:Record<string,unknown>;fingerprint:string;toolVersion?:string}
export function requireGraph(graph:Graph):Graph {if(graph?.schemaVersion!=='2.2')throw Error(`檢視器只接受 schema 2.2，收到 ${graph?.schemaVersion??'未設定'}`);return graph;}

export function requirePreview(preview:Preview,graph:Graph):Preview {
 for(const e of preview.elements||[]){
  if(e.unmappedReason!=null&&(!['NO_GRAPH_COMPONENT','AMBIGUOUS_CANDIDATES','ANCHOR_MISSING','DYNAMIC_OR_UNRESOLVED_SOURCE','OTHER'].includes(e.unmappedReason)||!['a','button','form','select','input','textarea'].includes(e.tag)||!['UNRESOLVED','AMBIGUOUS'].includes(e.componentResolution||'')||e.graphComponentId))throw Error('Invalid preview unmappedReason');
  if(e.matchBasis!=null&&!['ANCHOR','HEURISTIC'].includes(e.matchBasis))throw Error('Invalid preview matchBasis');
  if(e.matchBasis==='ANCHOR'){
   const owned=new Set((graph.relationships||[]).filter(r=>r.type==='CONTAINS'&&r.from===e.graphScreenId).map(r=>r.to));
   const expected=graph.nodes.filter(n=>n.type==='COMPONENT'&&owned.has(n.id)&&e.expansionAnchor&&n.attributes?.expansionAnchor===e.expansionAnchor).map(n=>n.id).sort();
   const actual=[...(e.graphComponentCandidates||[])].sort();
   if(!expected.length||JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Invalid preview anchor candidates');
   if(e.componentResolution!==(expected.length===1?'INFERRED':'AMBIGUOUS')||(expected.length===1?e.graphComponentId!==expected[0]:e.graphComponentId!=null))throw Error('Invalid preview anchor resolution');
  }
 }
 return preview;
}
