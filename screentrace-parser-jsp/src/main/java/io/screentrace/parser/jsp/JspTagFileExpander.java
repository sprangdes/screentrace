package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.AnalysisEvidence;
import io.screentrace.core.ApplicationGraph.ResolutionStatus;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Expands statically addressed JSP tag files without evaluating JSP expressions. */
final class JspTagFileExpander {
  static final int MAX_DEPTH = 12;
  record Result(String text, Map<Integer,List<AnalysisEvidence>> definitionEvidence, List<String> diagnostics) { }
  private record Expanded(String text, List<AnalysisEvidence> definitions, List<String> diagnostics) { }
  private static final Pattern VARIABLE = Pattern.compile("\\$\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*}");
  private static final Set<String> BUILTIN = Set.of("jsp", "html", "form", "spring", "c", "fn", "fmt", "tiles", "logic", "bean");

  Result expand(Path root, String pagePath, String text) {
    Expanded expanded = expandText(root, pagePath, text, new ArrayDeque<>(), 0, Map.of(), 0);
    Map<Integer,List<AnalysisEvidence>> byLine = new TreeMap<>();
    for (MarkupTag tag : MarkupTag.scan(text)) {
      if (tag.closing()) continue;
      String file = tagFile(root, pagePath, text, tag.name());
      if (file == null) continue;
      byLine.put(tag.line(), expanded.definitions().stream().distinct().toList());
    }
    return new Result(expanded.text(), byLine, expanded.diagnostics());
  }

  private Expanded expandText(Path root, String sourcePath, String text, Deque<String> stack, int depth,
                              Map<String,String> inheritedPrefixes, int lineOffset) {
    Map<String,String> prefixes = new HashMap<>(inheritedPrefixes);prefixes.putAll(prefixes(text));
    List<MarkupTag> tags = MarkupTag.scan(text);
    StringBuilder out = new StringBuilder();
    List<AnalysisEvidence> evidence = new ArrayList<>();
    List<String> diagnostics = new ArrayList<>();
    int cursor = 0;
    for (int i=0;i<tags.size();i++) {
      MarkupTag open = tags.get(i);
      if (open.closing()) continue;
      String definition = tagFile(root, sourcePath, prefixes, open.name());
      if (definition == null) continue;
      int start = text.lastIndexOf('<', open.end());
      int after = open.end()+1;
      String body = "";
      if (text.charAt(open.end()-1)!='/') {
        int nesting=1, closeIndex=-1;
        for(int j=i+1;j<tags.size();j++) {
          MarkupTag next=tags.get(j);
          if(!next.name().equalsIgnoreCase(open.name()))continue;
          if(next.closing()&&--nesting==0){closeIndex=j;break;}
          if(!next.closing()&&text.charAt(next.end()-1)!='/')nesting++;
        }
        if(closeIndex<0) continue;
        MarkupTag close=tags.get(closeIndex);
        int closeStart=text.lastIndexOf('<',close.end());
        body=text.substring(open.end()+1,closeStart);
        after=close.end()+1;
        i=closeIndex;
      }
      if(start<cursor)continue;
      out.append(text,cursor,start);
      SourceLocation call = new SourceLocation(sourcePath,open.line()+lineOffset);
      if(depth>=MAX_DEPTH || stack.contains(definition)) {
        diagnostics.add((depth>=MAX_DEPTH?"JSP_TAG_DEPTH_LIMIT":"JSP_TAG_CYCLE")+" at "+sourcePath+":"+open.line());
        out.append("\n".repeat(newlines(text.substring(start,after))));
        cursor=after;
        continue;
      }
      try {
        String tagText=SafeProjectFiles.readUtf8Limited(root,root.resolve(definition),SafeProjectFiles.MAX_JSP_FILE_BYTES);
        Map<String,String> attributes=open.attributes();
        // Isolate caller body from the tag template: flatten template lines only,
        // then restore body lines so caller definitions/use sites retain their positions.
        String marker="\u0000ST_BODY\u0000";
        while(tagText.contains(marker)||body.contains(marker))marker+="\u0000";
        tagText=substitute(tagText,attributes).replaceAll("(?is)<jsp:doBody\\s*/>",Matcher.quoteReplacement(marker));
        int definitionLine=definitionLine(root,definition,tagText);
        stack.push(definition);
        Expanded nested=expandText(root,definition,tagText,stack,depth+1,Map.of(),0);
        Expanded callerBody=nested.text().contains(marker)?expandText(root,sourcePath,body,stack,depth+1,prefixes,
            lineOffset+open.line()-1+newlines(text.substring(start,open.end()+1))):new Expanded("",List.of(),List.of());
        stack.pop();
        String replacement=nested.text().replace('\n',' ').replace('\r',' ').replace(marker,
            "\n".repeat(newlines(text.substring(start,open.end()+1)))+callerBody.text());
        out.append(replacement);
        out.append("\n".repeat(Math.max(0,newlines(text.substring(start,after))-newlines(replacement))));
        evidence.add(new AnalysisEvidence(call,"JspTagFileExpander",ResolutionStatus.CONFIRMED,"自訂標籤呼叫位置"));
        evidence.add(new AnalysisEvidence(new SourceLocation(definition,definitionLine),"JspTagFileExpander",ResolutionStatus.CONFIRMED,"標籤定義位置"));
        evidence.addAll(nested.definitions());evidence.addAll(callerBody.definitions());
        diagnostics.addAll(nested.diagnostics());diagnostics.addAll(callerBody.diagnostics());
      } catch(IOException|SecurityException ex) {
        diagnostics.add("JSP_TAG_UNRESOLVED at "+sourcePath+":"+open.line());
        out.append("\n".repeat(newlines(text.substring(start,after))));
      }
      cursor=after;
    }
    out.append(text.substring(cursor));
    return new Expanded(out.toString(),evidence.stream().distinct().toList(),diagnostics.stream().distinct().sorted().toList());
  }

  private static int newlines(String text) {return (int)text.chars().filter(c->c=='\n').count();}

  private static String substitute(String text,Map<String,String> attributes) {
    Map<String,String> normalized=new HashMap<>();attributes.forEach((key,value)->normalized.put(key.toLowerCase(Locale.ROOT),value));
    Matcher matcher=VARIABLE.matcher(text);StringBuffer out=new StringBuffer();
    while(matcher.find()) {
      String value=normalized.get(matcher.group(1).toLowerCase(Locale.ROOT));
      matcher.appendReplacement(out,Matcher.quoteReplacement(value==null?matcher.group():value));
    }
    matcher.appendTail(out);return out.toString();
  }

  private static int definitionLine(Path root,String sourcePath,String text) {
    for(MarkupTag tag:MarkupTag.scan(text))if(!tag.closing()&&
        (MarkupAnalysis.kind(tag.name().toLowerCase(Locale.ROOT),tag.attributes())!=null||tagFile(root,sourcePath,text,tag.name())!=null))return tag.line();
    return 1;
  }

  private static Map<String,String> prefixes(String text) {
    Map<String,String> result=new HashMap<>();
    for(MarkupTag tag:MarkupTag.scan(text))if((tag.name().equalsIgnoreCase("@taglib")||tag.name().equals("@")&&tag.attribute("taglib")!=null)&&tag.attribute("prefix")!=null&&tag.attribute("tagdir")!=null)
      result.put(tag.attribute("prefix"),tag.attribute("tagdir"));
    return result;
  }

  private static String tagFile(Path root,String sourcePath,String text,String tagName) {
    return tagFile(root,sourcePath,prefixes(text),tagName);
  }
  private static String tagFile(Path root,String sourcePath,Map<String,String> prefixes,String tagName) {
    int colon=tagName.indexOf(':');if(colon<1)return null;
    String prefix=tagName.substring(0,colon);if(BUILTIN.contains(prefix))return null;
    String tagdir=prefixes.get(prefix);if(tagdir==null)return null;
    String name=tagName.substring(colon+1);
    List<Path> candidates=new ArrayList<>();
    if(tagdir.startsWith("/")) {candidates.add(root.resolve("src/main/webapp").resolve(tagdir.substring(1)).resolve(name+".tag"));candidates.add(root.resolve(tagdir.substring(1)).resolve(name+".tag"));}
    else {Path parent=root.resolve(sourcePath).getParent();if(parent!=null)candidates.add(parent.resolve(tagdir).resolve(name+".tag"));}
    return candidates.stream().map(Path::normalize).filter(p->p.startsWith(root.normalize())&&java.nio.file.Files.isRegularFile(p))
        .map(p->root.relativize(p).toString().replace('\\','/')).findFirst().orElse(null);
  }
}
