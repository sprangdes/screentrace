package io.screentrace.parser.jsp;

import java.util.*;
import java.util.regex.*;

/** Temporary out-of-band bookmarks: removed before identity, labels or rules are parsed. */
final class AnchorBookmarks {
 private final String prefix="\u0000ST_ANCHOR_"+UUID.randomUUID()+"_";
 private final Map<String,String> values=new HashMap<>();
 private final Pattern markers=Pattern.compile(Pattern.quote(prefix)+"[0-9]+\\u0000");
 record Clean(String text,Map<Integer,String> anchors) { }
 static Map<Integer,String> positions(String path,String source) {
  var tags=MarkupTag.scanForAnchors(source).stream().filter(t->!t.closing()&&!t.name().startsWith("@")).toList();
  Map<String,Integer> counts=new HashMap<>(),ordinals=new HashMap<>();Map<Integer,String> positions=new TreeMap<>();
  for(var tag:tags)counts.merge(tag.name().toLowerCase(Locale.ROOT)+":"+tag.line(),1,Integer::sum);
  for(var tag:tags){String key=tag.name().toLowerCase(Locale.ROOT)+":"+tag.line();int ordinal=ordinals.merge(key,1,Integer::sum);
   positions.put(tag.start(),path.replace('\\','/')+":"+tag.line()+(counts.get(key)>1?"#"+ordinal:""));}
  return positions;
 }
 String mark(String source,String path,String parent) {
  StringBuilder out=new StringBuilder();int cursor=0;
  for(var entry:positions(path,source).entrySet()){
   out.append(source,cursor,entry.getKey());String marker=prefix+values.size()+"\u0000";
   values.put(marker,parent.isEmpty()?entry.getValue():parent+" > "+entry.getValue());out.append(marker);cursor=entry.getKey();
  }
  return out.append(source.substring(cursor)).toString();
 }
 String at(String text,int start) {
  int begin=text.lastIndexOf(prefix,start);if(begin<0)return "";
  String marker=text.substring(begin,start);return values.getOrDefault(marker,"");
 }
 Clean clean(String source) {
  var matcher=markers.matcher(source);StringBuilder text=new StringBuilder();Map<Integer,String> anchors=new TreeMap<>();int cursor=0;
  while(matcher.find()){text.append(source,cursor,matcher.start());anchors.put(text.length(),values.get(matcher.group()));cursor=matcher.end();}
  text.append(source.substring(cursor));return new Clean(text.toString(),Map.copyOf(anchors));
 }
}
