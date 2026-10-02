package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import java.util.regex.Pattern;

/** Resolves only the explicitly authorized same-source URL variable exception; never evaluates EL. */
public final class UrlVariableResolver {
  public record Resolution(String value, String originalExpression, List<AnalysisEvidence> definitions) { }
  private record Definition(String value, int end, SourceLocation source, List<Integer> scopes, boolean valid) { }
  private record Scope(String tag, int id, boolean loop) { }
  private static final Pattern VARIABLE=Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
  private static final Set<String> CONTROL=Set.of("c:if","c:when","c:otherwise","c:foreach","logic:iterate","logic:present","logic:notpresent","logic:equal","logic:notequal","logic:empty","logic:notempty","logic:greaterthan","logic:lessthan");
  private final Map<String,List<Definition>> definitions=new TreeMap<>();
  private final Set<String> writes=new HashSet<>();
  private final Map<Integer,List<Integer>> scopes=new HashMap<>();
  private final String path;
  private boolean unknownWrite;

  public UrlVariableResolver(String path,String text) {
    this(path,text,Set.of());
  }
  public UrlVariableResolver(String path,String text,Set<String> includedWrites) {
    this.path=path;writes.addAll(includedWrites);unknownWrite=includedWrites.contains("*");List<Scope> stack=new ArrayList<>();
    for(MarkupTag tag:MarkupTag.scan(text)) {
      String name=tag.name().toLowerCase(Locale.ROOT);
      if(tag.closing()) {
        for(int i=stack.size()-1;i>=0;i--) if(stack.get(i).tag().equals(name)) {stack.subList(i,stack.size()).clear();break;}
        continue;
      }
      List<Integer> scope=stack.stream().map(Scope::id).toList();scopes.put(tag.end(),scope);
      if(Set.of("c:url","spring:url").contains(name) && tag.attribute("var")!=null) {
        String value=tag.attribute("value"), declaredScope=tag.attribute("scope");
        if(MarkupAnalysis.dynamic(tag.attribute("var")))unknownWrite=true;
        boolean valid=value!=null&&!MarkupAnalysis.dynamic(value) && (declaredScope==null||declaredScope.equals("page")) && stack.stream().noneMatch(Scope::loop);
        definitions.computeIfAbsent(tag.attribute("var"),k->new ArrayList<>()).add(new Definition(value,tag.end(),new SourceLocation(path,tag.line()),scope,valid));
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
    return new Resolution(definition.value(),raw,List.of(new AnalysisEvidence(definition.source(),"JspUrlVariableResolver",ResolutionStatus.CONFIRMED,"同來源、使用前、單一定義且作用域可證明；原始運算式："+raw+"；param 不解析")));
  }
}
