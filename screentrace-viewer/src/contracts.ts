export interface Source {file:string;line:number;className?:string;methodName?:string}
export interface Node {id:string;type:string;name:string;attributes:Record<string,string>;source?:Source;confidence:string;evidence?:unknown[]}
export interface Edge {id:string;type:string;from:string;to:string;source?:Source;confidence:string}
export interface Evidence {source?:Source;parser:string;resolution:string;detail?:string}
export interface Rule {id:string;kind:string;fields:string[];message?:string;layer:string;parameters:Record<string,string>;evidence:Evidence[]}
export interface Contract {endpointId:string;request?:unknown;responses?:unknown[];source?:Source;confidence:string}
export interface Behavior {id:string;triggerId?:string;parentId?:string;type:string;event?:string;targetId?:string;expression?:string;condition?:string;guard?:string;attributes?:Record<string,string>;source?:Source;confidence?:string;evidence?:Evidence[]}
export interface Graph {schemaVersion:string;application:{name:string;technologies?:string[]};nodes:Node[];relationships?:Edge[];behaviors?:Behavior[];validationRules?:Rule[];apiContracts?:Contract[]}
export interface ElementRecord {graphScreenId:string;path:string;tag:string;id?:string;name?:string;className?:string;text:string;bounds:{x:number;y:number;width:number;height:number};styleId:string;defaultId:string;graphComponentId?:string;graphComponentCandidates?:string[];componentResolution?:string;conditions?:string[];source?:Source}
export interface PreviewScreen {graphScreenId:string;width:number;height:number;rendering?:{mode:string;diagnostic?:string};dynamicExpressions?:string[];thumbnail?:string;diagnostics?:{code:string;message:string}[]}
export interface Preview {version:string;screens?:PreviewScreen[];elements?:ElementRecord[];styles?:Record<string,Record<string,string>>;defaults?:Record<string,Record<string,string>>}
export interface Payload {graph:Graph;preview:Preview;documents:Record<string,string>;manifest:Record<string,unknown>;fingerprint:string}
export function requireGraph(graph:Graph):Graph {if(graph?.schemaVersion!=='2.2')throw Error(`檢視器只接受 schema 2.2，收到 ${graph?.schemaVersion??'未設定'}`);return graph;}
