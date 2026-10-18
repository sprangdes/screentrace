package io.screentrace.parser.jsp;

import java.util.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Bounded source transformation: preserves template attributes and source lines.
 * No expression evaluation. Only application-relative @{...} URL shapes are projected. */
public final class ThymeleafMarkup {
 private ThymeleafMarkup() {}
 public static String normalize(String source) {
  StringBuilder result=new StringBuilder();int cursor=0;
  for(var tag:MarkupTag.scan(source)) {
   if(tag.closing())continue;
   StringBuilder attributes=new StringBuilder();
   String opening=source.substring(tag.start(),tag.end()+1);
   for(String key:List.of("href","action")) {
    String expression=tag.attribute("th:"+key);if(expression==null)continue;
    // A runtime template overrides its static fallback. Unsupported expressions stay unresolved.
    if(tag.attribute(key)!=null)opening=renameFallback(opening,key);
    String target=url(expression);
    attributes.append(' ').append(key).append("=\"").append(escape(target==null?"${unresolvedTemplateTarget}":target)).append('"');
   }
   if(attributes.isEmpty())continue;
   int end=opening.length()-1;if(opening.charAt(end-1)=='/')end--;
   result.append(source,cursor,tag.start()).append(opening,0,end).append(attributes).append(opening.substring(end));cursor=tag.end()+1;
  }
  return result.append(source,cursor,source.length()).toString();
 }
 private static String renameFallback(String tag,String key) {
  StringBuilder result=new StringBuilder();int cursor=0,i=1;
  while(i<tag.length()&&!Character.isWhitespace(tag.charAt(i)))i++;
  while(i<tag.length()) {
   while(i<tag.length()&&Character.isWhitespace(tag.charAt(i)))i++;
   int start=i;while(i<tag.length()&&!Character.isWhitespace(tag.charAt(i))&&"=/>".indexOf(tag.charAt(i))<0)i++;
   if(start==i){i++;continue;}
   if(tag.substring(start,i).equalsIgnoreCase(key)){result.append(tag,cursor,start).append("data-st-template-fallback-").append(key);cursor=i;}
   while(i<tag.length()&&Character.isWhitespace(tag.charAt(i)))i++;
   if(i<tag.length()&&tag.charAt(i)=='='){i++;while(i<tag.length()&&Character.isWhitespace(tag.charAt(i)))i++;if(i<tag.length()&&(tag.charAt(i)=='\''||tag.charAt(i)=='"')){char quote=tag.charAt(i++);while(i<tag.length()&&tag.charAt(i)!=quote)i++;i++;}else while(i<tag.length()&&!Character.isWhitespace(tag.charAt(i))&&tag.charAt(i)!='>')i++;}
  }
  return result.append(tag,cursor,tag.length()).toString();
 }
 public static String url(String expression) {
  if(!expression.startsWith("@{")||!expression.endsWith("}"))return null;
  String body=expression.substring(2,expression.length()-1).strip();
  int open=body.indexOf('(');String route=open<0?body:body.substring(0,open).strip();
  if(!route.startsWith("/")||route.startsWith("//")||route.contains("${")||route.contains("#{")||!route.matches("/[A-Za-z0-9_./{}-]*"))return null;
  if(open<0)return route;
  if(!body.endsWith(")"))return null;
  List<String> query=new ArrayList<>();
  for(String parameter:split(body.substring(open+1,body.length()-1))) {
   int equals=parameter.indexOf('=');if(equals<1)return null;
   String name=parameter.substring(0,equals).strip(),value=parameter.substring(equals+1).strip();
   if(!name.matches("[A-Za-z_][A-Za-z0-9_]*"))return null;
   boolean dynamic=value.matches("\\$\\{[A-Za-z_][A-Za-z0-9_.]*}");
   if(!dynamic) {
    if(value.length()>=2&&value.startsWith("'")&&value.endsWith("'"))value=value.substring(1,value.length()-1);
    else if(!value.matches("[0-9]+|true|false"))return null;
   }
   if(route.contains("{"+name+"}")) {
    if(!dynamic)route=route.replace("{"+name+"}",encode(value));
   } else query.add(name+"="+(dynamic?"{"+name+"}":encode(value)));
  }
  return route+(query.isEmpty()?"":"?"+String.join("&",query));
 }
 private static List<String> split(String text) {
  List<String> parts=new ArrayList<>();int start=0,depth=0;char quote=0;
  for(int i=0;i<text.length();i++){char c=text.charAt(i);if(quote!=0){if(c==quote)quote=0;}else if(c=='\''||c=='"')quote=c;else if(c=='{')depth++;else if(c=='}')depth--;else if(c==','&&depth==0){parts.add(text.substring(start,i));start=i+1;}}
  parts.add(text.substring(start));return parts;
 }
 private static String encode(String value){return URLEncoder.encode(value,StandardCharsets.UTF_8).replace("+","%20");}
 private static String escape(String value){return value.replace("&","&amp;").replace("\"","&quot;").replace("<","&lt;");}
}
