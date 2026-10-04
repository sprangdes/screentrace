import {element,text} from './text';
export const diagnosticNames:Record<string,string>={
 ANALYSIS_DIAGNOSTIC:'一般分析診斷',UNKNOWN:'未分類診斷',UNKNOWN_CALL:'未知函式呼叫',UNSUPPORTED_FRAMEWORK:'不支援的框架',
 ASSET_UNRESOLVED:'無法載入預覽資源',CONTEXT_PATH_UNSPECIFIED:'未設定部署前綴',CONTEXT_CONFIG_UNRESOLVED:'部署前綴設定未解析',
 FRAMEWORK_DETECTION_UNRESOLVED:'框架偵測未完成',JAVA_PARSE_UNRESOLVED:'Java 語法未完整解析',SOURCE_LIMIT:'來源檔案超過安全限制',
 JSP_ROUTE_AMBIGUOUS:'畫面路由有多個候選',JSP_ROUTE_UNRESOLVED:'畫面路由未解析',JSP_TAG_CYCLE:'標籤檔循環',JSP_TAG_DEPTH_LIMIT:'標籤檔展開達深度上限',JSP_TAG_UNRESOLVED:'標籤檔未解析',JSP_UNRESOLVED:'畫面目標未解析',
 JS_ANALYZER_FAILURE:'JavaScript 分析失敗',JS_CALL_CYCLE:'函式呼叫循環',JS_DEPTH_LIMIT:'函式追蹤達深度上限',JS_MODULE_REFERENCE:'JavaScript 模組來源未解析',JS_RECOVERY_FAILED:'JavaScript 語法容錯失敗',JS_SCREEN_OWNER:'JavaScript 所屬畫面未解析',JS_SCRIPT_REFERENCE:'JavaScript 檔案引用未解析',JS_SOURCE_LIMIT:'JavaScript 來源超過上限',JS_SOURCE_READ:'JavaScript 來源不可讀',JS_SYNTAX_ERROR:'JavaScript 語法錯誤',JS_TRIGGER_UNRESOLVED:'事件觸發來源未解析',
 MESSAGE_RESOURCE_UNRESOLVED:'訊息資源未解析',MODEL_SOURCE_UNRESOLVED:'表單模型來源未解析',PREVIEW_CAPTURE_FAILED:'預覽擷取失敗',PREVIEW_SOURCE_UNAVAILABLE:'缺少可重建的畫面來源',SCREENSHOT_DIMENSION_LIMIT:'預覽截圖超過安全尺寸',
 SERVER_VALIDATION_CYCLE:'伺服器檢核循環',SERVER_VALIDATION_SOURCE:'伺服器檢核來源未解析',SERVER_VALIDATION_TYPE:'伺服器檢核型別未解析',SERVER_VALIDATOR_UNRESOLVED:'伺服器檢核器未解析',
 SPRING_BEAN_UNRESOLVED:'Spring 元件未解析',SPRING_RETURN_AMBIGUOUS:'處理器導向有多個候選',SPRING_RETURN_UNRESOLVED:'處理器回傳未解析',SPRING_XML_CONTROLLER_UNRESOLVED:'XML 處理器未解析',SPRING_XML_UNRESOLVED:'Spring XML 設定未解析',SPRING_XML_VIEW_UNRESOLVED:'XML 畫面未解析',
 STRUTS_CONFIG_MISSING:'缺少 Struts 設定',STRUTS_CONFIG_UNRESOLVED:'Struts 設定未解析',STRUTS_DISPATCH_UNRESOLVED:'分派方法未解析',STRUTS_FORWARD_EXPRESSION:'導向包含動態運算式',STRUTS_FORWARD_UNRESOLVED:'Struts 導向未解析',STRUTS_ROUTE_UNRESOLVED:'Struts 路由未解析',STRUTS_TARGET_UNRESOLVED:'Struts 目標未解析',
 STYLE_BYTE_LIMIT:'樣式資料達大小上限',STYLE_ELEMENT_LIMIT:'樣式擷取達項目上限',TILES_AMBIGUOUS:'版型定義有多個候選',TILES_CYCLE:'版型繼承循環',TILES_PARENT_UNRESOLVED:'父版型未解析',TILES_REFERENCE_UNRESOLVED:'版型引用未解析',TILES_UNRESOLVED:'版型設定未解析',
 URL_MAPPING_UNRESOLVED:'Servlet 路由映射未解析',URL_METHOD_MISMATCH:'請求方法不符',URL_UNRESOLVED:'URL 未解析',VALIDATOR_RULES_UNRESOLVED:'檢核規則未解析'
};
export function diagnosticName(code:string):string{return diagnosticNames[code.split(':')[0]]||'未分類診斷（需補中文名稱）';}
export function diagnosticsPanel(records:unknown[]):HTMLElement {
 const box=element('details',undefined,'analysis-diagnostics'),groups=new Map<string,any[]>();
 for(const item of records){const record=typeof item==='object'&&item?item as any:{code:String(item)},code=String(record.code||'UNKNOWN').split(':')[0];groups.set(code,[...(groups.get(code)||[]),record]);}
 box.append(element('summary',`${text.diagnostics}（${records.length} 項、${groups.size} 類）`));
 for(const [code,items]of [...groups].sort(([a],[b])=>a<b?-1:1)){
  const group=element('details',undefined,'diagnostic-group');group.dataset.diagnosticCode=code;group.append(element('summary',`${diagnosticName(code)} ×${items.length}`));
  for(const record of items){const item=element('article',undefined,'diagnostic-item');if(record.message)item.append(element('p',String(record.message)));const file=record.source?.file||record.file,line=record.source?.line||record.line;if(file)item.append(element('p',`來源：${file}${line?`:${line}`:''}`));const technical=element('details',undefined,'diagnostic-technical');technical.append(element('summary','技術明細'),element('p',`診斷代碼：${record.code||code}`));item.append(technical);group.append(item);}box.append(group);
 }
 return box;
}
