package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.ComponentKind;
import java.util.*;
import java.util.regex.*;

/** Bounded source-label grammar. Never evaluates JSP, expressions or message bundles. */
final class StaticComponentNames {
 private StaticComponentNames() { }
 private static final Set<String> VOID=Set.of("input","img","br","hr","meta","link","area","base","col","embed","param","source","track","wbr");
 private static final Map<ComponentKind,String> KINDS=Map.ofEntries(Map.entry(ComponentKind.BUTTON,"按鈕"),Map.entry(ComponentKind.LINK,"連結"),Map.entry(ComponentKind.SUBMIT,"表單送出"),Map.entry(ComponentKind.FORM,"表單"),Map.entry(ComponentKind.TEXT_INPUT,"文字欄位"),Map.entry(ComponentKind.TEXTAREA,"文字區域"),Map.entry(ComponentKind.SELECT,"下拉選單"),Map.entry(ComponentKind.MULTI_SELECT,"多選欄位"),Map.entry(ComponentKind.CHECKBOX,"核取方塊"),Map.entry(ComponentKind.RADIO,"單選欄位"),Map.entry(ComponentKind.DATE_PICKER,"日期欄位"),Map.entry(ComponentKind.FILE_INPUT,"檔案欄位"),Map.entry(ComponentKind.MODAL,"彈窗"),Map.entry(ComponentKind.TABLE,"資料表"),Map.entry(ComponentKind.OTHER,"其他項目"));
 static MarkupAnalysis annotate(MarkupAnalysis markup,String source) {
  List<MarkupTag> tokens=MarkupTag.scan(source);List<MarkupAnalysis.Component> components=new ArrayList<>();int at=0;Map<ComponentKind,Integer> ordinals=new EnumMap<>(ComponentKind.class);
  for(int i=0;i<tokens.size();i++){
   var token=tokens.get(i);if(token.closing()||MarkupAnalysis.kind(token.name().toLowerCase(Locale.ROOT),token.attributes())==null)continue;
   var c=markup.components().get(at++);var attrs=new TreeMap<>(c.attributes());String visible=null;
   if(c.tag().equals("input")&&Set.of(ComponentKind.BUTTON,ComponentKind.SUBMIT).contains(c.kind()))visible=attrs.get("value")==null?null:decode(attrs.get("value"));
   else if(!VOID.contains(c.tag())&&!selfClosing(source,token)){
    int close=close(tokens,i,source);if(close>=0)visible=visible(source.substring(token.end()+1,source.lastIndexOf('<',tokens.get(close).end())));
   }
   if(acceptable(visible)){attrs.put("visibleText",visible);attrs.put("labelSource","visibleText");}
   int ordinal=ordinals.merge(c.kind(),1,Integer::sum);attrs.put("displayName",name(attrs,c.kind(),ordinal));
   components.add(new MarkupAnalysis.Component(c.id(),c.kind(),c.tag(),attrs,c.source(),c.guard(),c.repeated(),c.formId(),c.model(),c.field(),c.bindingStatus()));
  }
  return new MarkupAnalysis(components,markup.events(),markup.rules(),markup.behaviors());
 }
 static String name(Map<String,String> attrs,ComponentKind kind,int ordinal){
  for(String key:List.of("visibleText","aria-label","title","name","id")){String raw=attrs.get(key),value=raw==null?null:key.equals("visibleText")?raw:decode(raw);if(acceptable(value))return normalize(value);}
  return KINDS.get(kind)+" "+ordinal;
 }
 private static boolean acceptable(String value){return value!=null&&!value.isBlank()&&!MarkupAnalysis.dynamic(value);}
 private static boolean selfClosing(String source,MarkupTag token){return source.charAt(token.end()-1)=='/';}
 private static int close(List<MarkupTag> tokens,int opening,String source){int depth=1;String name=tokens.get(opening).name();for(int i=opening+1;i<tokens.size();i++){var t=tokens.get(i);if(!t.name().equalsIgnoreCase(name))continue;if(t.closing()){if(--depth==0)return i;}else if(!selfClosing(source,t))depth++;}return -1;}
 private static String visible(String input){
  String body=literalExpressions(input.replaceAll("(?s)<!--.*?-->|<%--.*?--%>",""));if(MarkupAnalysis.dynamic(body))return null;
  var tags=MarkupTag.scan(body);StringBuilder text=new StringBuilder();int cursor=0;
  for(int i=0;i<tags.size();i++){
   var tag=tags.get(i);int start=body.indexOf('<',cursor);if(start<0)return null;text.append(body,cursor,start);String name=tag.name().toLowerCase(Locale.ROOT);
   if(!tag.closing()){
    if(Set.of("script","style").contains(name)||tag.attributes().containsKey("hidden")||"true".equalsIgnoreCase(tag.attribute("aria-hidden"))||Objects.toString(tag.attribute("style"),"").matches("(?is).*?(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden).*")){
     if(!selfClosing(body,tag)&&!VOID.contains(name)){int end=close(tags,i,body);if(end<0)return null;cursor=tags.get(end).end()+1;i=end;continue;}
    }else if(name.equals("spring:message")){
     if(tag.attribute("code")!=null||!acceptable(tag.attribute("text")))return null;text.append(tag.attribute("text"));
    }else if(name.contains(":"))return null;
   }
   cursor=tag.end()+1;
  }
  text.append(body,cursor,body.length());String result=decode(text.toString());return result.isBlank()?null:result;
 }
 private static String literalExpressions(String source){
  // Only quoted constants, optionally wrapped in the known escapeXml function.
  Matcher m=Pattern.compile("\\$\\{\\s*(?:fn:escapeXml\\(\\s*(['\"])([^'\"\\\\]*?)\\1\\s*\\)|(['\"])([^'\"\\\\]*?)\\3)\\s*}").matcher(source);StringBuffer out=new StringBuffer();
  while(m.find())m.appendReplacement(out,Matcher.quoteReplacement((m.group(2)==null?m.group(4):m.group(2)).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")));m.appendTail(out);return out.toString();
 }
 static String normalize(String value){String compact=value.strip().replaceAll("(?U)\\s+"," ");int length=compact.codePointCount(0,compact.length());return length>40?compact.substring(0,compact.offsetByCodePoints(0,40))+"…":compact;}
 private static String decode(String value){
  Matcher m=Pattern.compile("&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);").matcher(value);StringBuffer out=new StringBuffer();
  while(m.find()){String entity=m.group(1),decoded=switch(entity){case "amp"->"&";case "lt"->"<";case "gt"->">";case "quot"->"\"";case "apos"->"'";case "nbsp"->" ";default->m.group();};if(entity.startsWith("#"))try{int point=Integer.parseInt(entity.substring(entity.startsWith("#x")?2:1),entity.startsWith("#x")?16:10);if(Character.isValidCodePoint(point)&&!(point>=0xd800&&point<=0xdfff))decoded=new String(Character.toChars(point));}catch(NumberFormatException ignored){}m.appendReplacement(out,Matcher.quoteReplacement(decoded));}m.appendTail(out);return out.toString();
 }
}
