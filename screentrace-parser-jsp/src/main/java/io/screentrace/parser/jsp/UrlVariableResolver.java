package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import java.util.regex.Pattern;

/** Resolves only the explicitly authorized same-source URL variable exception; never evaluates EL. */
public final class UrlVariableResolver {
  public record Resolution(String value, String originalExpression, List<AnalysisEvidence> definitions) { }
  private record Definition(String value, int end, SourceLocation source, List<Integer> scopes, List<Integer> loops, boolean valid) { }
  private record Scope(String tag, int id, boolean loop) { }
  private static final Pattern VARIABLE=Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
  private static final Set<String> CONTROL=Set.of("c:if","c:when","c:otherwise","c:foreach","logic:iterate","logic:present","logic:notpresent","logic:equal","logic:notequal","logic:empty","logic:notempty","logic:greaterthan","logic:lessthan");
  private final Map<String,List<Definition>> definitions=new TreeMap<>();
  private final Set<String> writes=new HashSet<>();
  private final Map<Integer,List<Integer>> scopes=new HashMap<>();
  private final Map<Integer,List<Integer>> loops=new HashMap<>();
  private final Set<Integer> closedLoops=new HashSet<>();
  private final String path;
  private boolean unknownWrite;

  public UrlVariableResolver(String path,String text) {
    this(path,text,Set.of());
  }
  public UrlVariableResolver(String path,String text,Set<String> includedWrites) {
    this.path=path;writes.addAll(includedWrites);unknownWrite=includedWrites.contains("*");List<Scope> stack=new ArrayList<>();
    List<MarkupTag> tokens=MarkupTag.scan(text);Map<Integer,Integer> completed=completedDefinitions(tokens,text);
    for(MarkupTag tag:tokens) {
      String name=tag.name().toLowerCase(Locale.ROOT);
      if(tag.closing()) {
        for(int i=stack.size()-1;i>=0;i--) if(stack.get(i).tag().equals(name)) {
          if(i==stack.size()-1&&stack.get(i).loop())closedLoops.add(stack.get(i).id());
          stack.subList(i,stack.size()).clear();break;
        }
        continue;
      }
      List<Integer> scope=stack.stream().map(Scope::id).toList();scopes.put(tag.end(),scope);
      List<Integer> loopScope=stack.stream().filter(Scope::loop).map(Scope::id).toList();loops.put(tag.end(),loopScope);
      if(Set.of("c:url","spring:url").contains(name) && tag.attribute("var")!=null) {
        String value=tag.attribute("value"), declaredScope=tag.attribute("scope");
        if(MarkupAnalysis.dynamic(tag.attribute("var")))unknownWrite=true;
        // OQ-013 permits spring:url only in statically known loop scopes. Unknown custom
        // scopes and c:url keep ADR 0005's original single-assignment restriction.
        boolean authorizedLoop=name.equals("spring:url") && stack.stream().filter(Scope::loop)
            .allMatch(s->s.tag().equals("c:foreach")||s.tag().equals("logic:iterate"));
        boolean valid=value!=null&&!MarkupAnalysis.dynamic(value) && (declaredScope==null||declaredScope.equals("page"))
            && (loopScope.isEmpty()||authorizedLoop);
        definitions.computeIfAbsent(tag.attribute("var"),k->new ArrayList<>()).add(new Definition(value,completed.getOrDefault(tag.end(),Integer.MAX_VALUE),new SourceLocation(path,tag.line()),scope,loopScope,valid));
      } else if(tag.attribute("var")!=null || name.equals("c:remove")) {
        String variable=name.equals("c:remove")?tag.attribute("var"):tag.attribute("var");
        if(variable==null||MarkupAnalysis.dynamic(variable)) unknownWrite=true; else writes.add(variable);
      }

      boolean selfClosing=text.charAt(tag.end()-1)=='/';
      boolean unknownCustom=name.contains(":")&&!name.startsWith("html:")&&!name.startsWith("form:")&&!Set.of("spring:url","spring:param","c:url","c:param","c:choose").contains(name)&&!CONTROL.contains(name);
      if((CONTROL.contains(name)||unknownCustom)&&!selfClosing) stack.add(new Scope(name,tag.end(),unknownCustom||name.equals("c:foreach")||name.equals("logic:iterate")));
    }
    // Scriptlets can mutate page-scope attributes. Exclude JSP comments before checking the delimiter.
    String withoutComments=text.replaceAll("(?s)<%--.*?--%>","");
    for(int i=withoutComments.indexOf("<%");i>=0;i=withoutComments.indexOf("<%",i+2))
      if(!withoutComments.startsWith("<%@",i)) unknownWrite=true;
  }
  private static Map<Integer,Integer> completedDefinitions(List<MarkupTag> tokens,String text) {
    Map<Integer,Integer> completed=new HashMap<>();List<MarkupTag> open=new ArrayList<>();
    for(var tag:tokens) if(Set.of("c:url","spring:url").contains(tag.name().toLowerCase(Locale.ROOT))) {
      if(tag.closing()) {
        for(int i=open.size()-1;i>=0;i--) if(open.get(i).name().equalsIgnoreCase(tag.name())) {
          completed.put(open.get(i).end(),tag.end());open.subList(i,open.size()).clear();break;
        }
      } else if(text.charAt(tag.end()-1)=='/')completed.put(tag.end(),tag.end());else open.add(tag);
    }
    return completed;
  }
  public Resolution resolve(String raw,MarkupTag use) {
    if(raw==null) return new Resolution(null,null,List.of());
    if(raw.stripLeading().startsWith("<c:url")||raw.stripLeading().startsWith("<spring:url")) {
      List<MarkupTag> nested=MarkupTag.scan(raw);
      if(nested.size()==1 && nested.get(0).attribute("value")!=null&&!MarkupAnalysis.dynamic(nested.get(0).attribute("value")))
        return new Resolution(nested.get(0).attribute("value"),raw,List.of(new AnalysisEvidence(new SourceLocation(path,use.line()),"JspUrlVariableResolver",ResolutionStatus.CONFIRMED,"巢狀 URL 常值定義；param 不解析")));
      return new Resolution(raw,raw,List.of());
    }
    if(!raw.startsWith("${")||!raw.endsWith("}")) return new Resolution(raw,raw,List.of());
    String expression=raw.substring(2,raw.length()-1).trim();
    if(expression.startsWith("fn:escapeXml(")&&expression.endsWith(")")) expression=expression.substring(13,expression.length()-1).trim();
    if(!VARIABLE.matcher(expression).matches()||unknownWrite||writes.contains(expression)) return new Resolution(raw,raw,List.of());
    var values=definitions.getOrDefault(expression,List.of());
    if(values.size()!=1) return new Resolution(raw,raw,List.of());
    Definition definition=values.get(0);var useScopes=scopes.getOrDefault(use.end(),List.of());
    if(!definition.valid()||definition.end()>=use.end()||useScopes.size()<definition.scopes().size()||!useScopes.subList(0,definition.scopes().size()).equals(definition.scopes())) return new Resolution(raw,raw,List.of());
    if(!definition.loops().isEmpty()&&(!definition.loops().equals(loops.getOrDefault(use.end(),List.of()))||!closedLoops.containsAll(definition.loops()))) return new Resolution(raw,raw,List.of());
    String rule=definition.loops().isEmpty()?"同來源、使用前、單一定義且作用域可證明":"OQ-013 spring:url 同來源、使用前、單一靜態定義且位於同一可證明迴圈作用域";
    return new Resolution(definition.value(),raw,List.of(new AnalysisEvidence(definition.source(),"JspUrlVariableResolver",ResolutionStatus.CONFIRMED,rule+"；原始運算式："+raw+"；param 不解析")));
  }
}
