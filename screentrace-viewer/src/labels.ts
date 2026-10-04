import {Node} from './contracts';import {Index} from './map';
export const kindNames:Record<string,string>={BUTTON:'按鈕',LINK:'連結',SUBMIT:'表單送出',FORM:'表單',SELECT:'下拉選單',MULTI_SELECT:'多選欄位',CHECKBOX:'核取方塊',RADIO:'單選欄位',DATE_PICKER:'日期欄位',TEXT_INPUT:'文字欄位',TEXTAREA:'文字區域',FILE_INPUT:'檔案欄位',TABLE:'資料表',MODAL:'彈窗',OTHER:'其他項目'};
export function kindName(node:Node):string{return kindNames[node.attributes.kind]||kindNames[node.attributes.tag?.toUpperCase()]||'其他項目';}
export function componentLabel(node:Node,fallback=1):string{
 const a=node.attributes,visible=a.label||a.text||(!['TEXT_INPUT','CHECKBOX','RADIO'].includes(a.kind)?a.value:undefined)||node.name;
 const acceptable=(value?:string)=>value&&value!==node.id&&!/\$\{|#\{|<%/.test(value)&&!['a','button','input','page','open','notempty'].includes(value.trim().toLowerCase());
 for(const value of [(node as Node&{displayLabel?:string}).displayLabel,visible,a.title,a.name,a.id])if(acceptable(value))return value!.trim();
 return `${kindName(node)} ${fallback}`;
}
export function isAction(index:Index,node:Node):boolean{
 if(['TEXT_INPUT','TEXTAREA','CHECKBOX','RADIO','FILE_INPUT','TABLE','FORM'].includes(node.attributes.kind))return false;
 if(['BUTTON','LINK','SUBMIT','SELECT','MULTI_SELECT','DATE_PICKER','MODAL'].includes(node.attributes.kind))return true;
 return (index.graph.behaviors||[]).some(b=>b.triggerId===node.id&&['NAVIGATE','CALL_API','OPEN_DIALOG','SELECT_CHANGE','SUBMIT_FORM'].includes(b.type));
}
