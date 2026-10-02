package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.*;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ast.expr.*;
import java.nio.file.*;
import java.io.IOException;
import java.util.*;
import java.util.regex.Pattern;

/** Source collection only. Never loads target classes or JavaScript modules. */
public final class ScriptSources {
  public record Script(String file,int line,String code,boolean module,String event,String componentId,String ownerFile,String status,String expression,List<AnalysisEvidence> evidence) { }
  public record Reference(SourceLocation source,String expression,String status,List<String> candidates,List<AnalysisEvidence> evidence) { }
  public record Result(List<Script> scripts,List<Reference> references,List<Diagnostic> diagnostics,List<Map<String,Object>> dom) { }
  private record Definition(String file,String value,int end,SourceLocation source,boolean scopeProven) { }
  private static final Set<String> VOID=Set.of("input","img","br","hr","meta","link","area","base","col","embed","param","source","track","wbr");
  private static final Pattern PREFIX=Pattern.compile("^\\$\\{([A-Za-z_][A-Za-z0-9_]*|pageContext\\.(?:request|servletContext)\\.contextPath)\\}(/[^$#<]*)$");
  private ScriptSources() { }
  public static Result collect(ProjectScanner.ProjectInventory inventory) {
    Map<String,String> markup=new TreeMap<>();Map<String,List<Definition>> defs=new TreeMap<>();List<Diagnostic> diagnostics=new ArrayList<>();boolean unknownDefinitions=false;
    List<Path> files=inventory.files().stream().sorted().toList();
    for(var file:files) {
      String path=inventory.root().relativize(file).toString().replace('\\','/');
      if(!(path.endsWith(".jsp")||path.endsWith(".jspf")||path.endsWith(".html")||path.endsWith(".htm")||path.endsWith(".xml")||path.endsWith(".java")))continue;
      String source;try{source=SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);}catch(IOException|SecurityException error){diagnostics.add(diag(path,1,"JS_SOURCE_READ",error.getMessage()));unknownDefinitions=true;continue;}
      if(path.endsWith(".java")) {
        var parsed=new JavaParser().parse(source);if(!parsed.isSuccessful()){unknownDefinitions=true;continue;}
        for(var call:parsed.getResult().orElseThrow().findAll(MethodCallExpr.class)) if(Set.of("setAttribute","addAttribute","addObject").contains(call.getNameAsString())) {
          if(call.getArguments().size()<2||!call.getArgument(0).isStringLiteralExpr()){unknownDefinitions=true;continue;}
          String name=call.getArgument(0).asStringLiteralExpr().asString();String value=call.getArgument(1).isStringLiteralExpr()?call.getArgument(1).asStringLiteralExpr().asString():null;
          defs.computeIfAbsent(name,k->new ArrayList<>()).add(new Definition(path,value,Integer.MAX_VALUE,new SourceLocation(path,call.getBegin().map(p->p.line).orElse(1)),false));
        }
        continue;
      }
      if(!path.endsWith(".xml"))markup.put(path,source);
      List<String> scopes=new ArrayList<>();
      for(var tag:MarkupTag.scan(source)) {
        String name=tag.name().toLowerCase(Locale.ROOT);
        if(tag.closing()){if(!scopes.isEmpty())scopes.remove(scopes.size()-1);continue;}
        if(tag.attribute("var")!=null) {
          String variable=tag.attribute("var");if(MarkupAnalysis.dynamic(variable))unknownDefinitions=true;
          defs.computeIfAbsent(variable,k->new ArrayList<>()).add(new Definition(path,tag.attribute("value"),tag.end(),new SourceLocation(path,tag.line()),scopes.stream().noneMatch(t->MarkupAnalysis.isConditional(t)||t.equals("c:foreach")||t.equals("logic:iterate"))));
        }
        if(!VOID.contains(name)&&source.charAt(tag.end()-1)!='/')scopes.add(name);
      }
      if(source.contains("<%")&&!source.replaceAll("(?s)<%--.*?--%>|<%@.*?%>","").contains("<%"))continue;
      if(source.replaceAll("(?s)<%--.*?--%>|<%@.*?%>","").contains("<%"))unknownDefinitions=true;
    }
    List<Script> scripts=new ArrayList<>();List<Reference> references=new ArrayList<>();List<Map<String,Object>> dom=new ArrayList<>();
    for(var entry:markup.entrySet()) {
      String path=entry.getKey(),source=entry.getValue();var analysis=MarkupAnalysis.parse(path,source);Map<Integer,MarkupAnalysis.Component> components=new HashMap<>();analysis.components().forEach(c->components.put(c.source().line(),c));
      // Attribute identity and occurrence disambiguate multiple components on one source line.
      Map<String,Deque<MarkupAnalysis.Component>> byTag=new HashMap<>();analysis.components().forEach(c->byTag.computeIfAbsent(c.tag()+c.attributes(),k->new ArrayDeque<>()).add(c));
      List<Map<String,Object>> stack=new ArrayList<>();int ordinal=0;var resolver=new UrlVariableResolver(path,source);
      for(var tag:MarkupTag.scan(source)) {
        String name=tag.name().toLowerCase(Locale.ROOT);
        if(tag.closing()){for(int i=stack.size()-1;i>=0;i--)if(stack.get(i).get("tag").equals(name)){stack.subList(i,stack.size()).clear();break;}continue;}
        String id="dom:"+path+":"+ordinal++;Map<String,Object> element=new TreeMap<>();element.put("id",id);element.put("tag",name);element.put("attrs",tag.attributes());element.put("ownerFile",path);if(!stack.isEmpty())element.put("parent",stack.get(stack.size()-1).get("id"));
        var queue=byTag.get(name+new TreeMap<>(tag.attributes()));var component=queue==null?null:queue.poll();if(component!=null)element.put("componentId",component.id());dom.add(element);
        if(name.equals("script")) {
          if(tag.attribute("src")!=null) {
            String raw=tag.attribute("src"),target=raw,status="CONFIRMED";List<AnalysisEvidence> evidence=new ArrayList<>();boolean eligible=true;
            var resolution=resolver.resolve(raw,tag);if(!resolution.definitions().isEmpty()){target=resolution.value();evidence.addAll(resolution.definitions());}
            else if(MarkupAnalysis.dynamic(raw)) {
              var prefix=PREFIX.matcher(raw);
              if(prefix.matches()) {
                String variable=prefix.group(1);var definitions=defs.getOrDefault(variable,List.of());
                if(definitions.isEmpty()&&!unknownDefinitions){target=prefix.group(2);status="INFERRED";}
                else if(definitions.size()==1) {
                  var d=definitions.get(0);evidence.add(proof(d.source(),"UNRESOLVED","script src 變數定義"));
                  if(d.file().equals(path)&&d.end()<tag.end()&&d.scopeProven()&&d.value()!=null&&!MarkupAnalysis.dynamic(d.value())){target=d.value()+prefix.group(2);evidence.clear();evidence.add(proof(d.source(),"CONFIRMED","script src 同來源字面定義"));}
                  else eligible=false;
                } else {eligible=false;definitions.forEach(d->evidence.add(proof(d.source(),"UNRESOLVED","衝突／重複變數定義")));}
              } else eligible=false;
            }
            if(target.startsWith("http:")||target.startsWith("https:")||target.startsWith("//")||MarkupAnalysis.dynamic(target))eligible=false;
            List<String> candidates=eligible?candidates(inventory,path,target):List.of();
            if(candidates.size()>1)status="AMBIGUOUS";else if(candidates.isEmpty())status="UNRESOLVED";
            var location=new SourceLocation(path,tag.attributeLine("src"));evidence.add(proof(location,status,"原始 script src："+raw+"；候選："+candidates));
            references.add(new Reference(location,raw,status,candidates,List.copyOf(evidence)));
            if(candidates.size()==1) {
              String file=candidates.get(0);try{scripts.add(new Script(file,1,SafeProjectFiles.readUtf8Limited(inventory.root(),inventory.root().resolve(file),SafeProjectFiles.MAX_SOURCE_FILE_BYTES),"module".equals(tag.attribute("type")),"",null,path,status,raw,List.copyOf(evidence)));}
              catch(IOException|SecurityException error){diagnostics.add(diag(path,tag.line(),"JS_SOURCE_READ",error.getMessage()));}
            } else diagnostics.add(diag(path,tag.line(),"JS_SCRIPT_REFERENCE","script src 無法唯一解析；原文："+raw+"；候選："+candidates));
          } else {
            int end=source.toLowerCase(Locale.ROOT).indexOf("</script",tag.end()+1);String type=tag.attribute("type");
            if(end>=0&&(type==null||Set.of("module","text/javascript","application/javascript").contains(type)))scripts.add(new Script(path,tag.line(),source.substring(tag.end()+1,end),"module".equals(type),"",null,path,"CONFIRMED","inline script",List.of(proof(new SourceLocation(path,tag.line()),"CONFIRMED","inline script"))));
          }
        }
        for(var attr:tag.attributes().entrySet()) {
          String event=null,code=attr.getValue();if(attr.getKey().startsWith("on")&&attr.getKey().length()>2)event=attr.getKey().substring(2);
          else if(Set.of("href","action").contains(attr.getKey())&&code.stripLeading().toLowerCase(Locale.ROOT).startsWith("javascript:")){event=attr.getKey().equals("action")?"submit":"click";code=code.stripLeading().substring(11);}
          if(event!=null)scripts.add(new Script(path,tag.attributeLine(attr.getKey()),code,false,event,component==null?null:component.id(),path,"CONFIRMED",attr.getValue(),List.of(proof(new SourceLocation(path,tag.attributeLine(attr.getKey())),"CONFIRMED","JS 事件屬性／javascript URL"))));
        }
        if(!VOID.contains(name)&&source.charAt(tag.end()-1)!='/')stack.add(element);
      }
    }
    return new Result(List.copyOf(scripts),List.copyOf(references),List.copyOf(diagnostics),List.copyOf(dom));
  }
  private static List<String> candidates(ProjectScanner.ProjectInventory inventory,String owner,String target) {
    String clean=target.split("[?#]",2)[0];Set<String> candidates=new TreeSet<>();
    if(clean.startsWith("//")||clean.contains(":")||Arrays.asList(clean.split("/")).contains(".."))return List.of();
    for(var file:inventory.files()) {
      String relative=inventory.root().relativize(file).toString().replace('\\','/');
      if(clean.startsWith("/")) {
        for(String root:List.of("src/main/webapp/","WebContent/","WebRoot/","webapp/","web/")) {
          int offset=relative.indexOf(root);if(offset>=0&&(offset==0||relative.charAt(offset-1)=='/')&&relative.substring(offset+root.length()).equals(clean.substring(1)))candidates.add(relative);
        }
      } else if(Path.of(owner).getParent()!=null&&Path.of(owner).getParent().resolve(clean).normalize().toString().replace('\\','/').equals(relative))candidates.add(relative);
    }
    return List.copyOf(candidates);
  }
  private static AnalysisEvidence proof(SourceLocation source,String status,String detail){return new AnalysisEvidence(source,"ScriptSourceCollector",ResolutionStatus.valueOf(status),detail);}
  private static Diagnostic diag(String path,int line,String code,String message){var source=new SourceLocation(path,line);return new Diagnostic("JavaScript 來源："+message,Confidence.UNRESOLVED,source,code,List.of(proof(source,"UNRESOLVED",message)));}
}
