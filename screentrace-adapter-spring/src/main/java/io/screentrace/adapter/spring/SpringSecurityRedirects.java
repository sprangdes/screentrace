package io.screentrace.adapter.spring;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.expr.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.StringReader;
import java.nio.file.Path;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.xml.sax.InputSource;

/** Extracts literal Spring Security automatic page redirects without loading application code. */
final class SpringSecurityRedirects {
 private SpringSecurityRedirects() { }
 private record Redirect(String path,String attribute,SourceLocation source,List<String> patterns) { }
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
  List<Redirect> redirects=new ArrayList<>();List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  for(Path file:inventory.files()) {
   String relative=inventory.root().relativize(file).toString().replace('\\','/');
   try {String text=SafeProjectFiles.readUtf8Limited(inventory.root(),file,file.toString().endsWith(".xml")?SafeProjectFiles.MAX_XML_FILE_BYTES:SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
    if(file.toString().endsWith(".xml")&&(text.contains("form-login")||text.contains("access-denied-page")))parseXml(text,relative,redirects,diagnostics);
    if(file.toString().endsWith(".java")&&(text.contains("loginPage")||text.contains("accessDeniedPage")))parseJava(text,relative,redirects,diagnostics);
   } catch(Exception error){diagnostics.add(new Diagnostic("Spring Security 設定無法安全解析",Confidence.UNRESOLVED,new SourceLocation(relative,1),"SPRING_SECURITY_PARSE",List.of()));}
  }
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));List<Relationship> edges=graph.relationships();
  for(Redirect redirect:redirects) {
   Set<String> screens=new TreeSet<>();
   for(Relationship handled:edges)if(handled.type()==EdgeType.HANDLED_BY)for(Relationship rendered:edges)if(rendered.type()==EdgeType.RENDERS&&rendered.from().equals(handled.to())){GraphNode endpoint=nodes.get(handled.from()),screen=nodes.get(rendered.to());if(endpoint!=null&&screen!=null&&redirect.path().equals(endpoint.attributes().get("path")))screens.add(screen.id());}
   if(screens.size()!=1){diagnostics.add(new Diagnostic("Spring Security 自動導向目標無法唯一對應畫面",Confidence.UNRESOLVED,redirect.source(),"SPRING_SECURITY_TARGET_UNRESOLVED",List.of(new AnalysisEvidence(redirect.source(),"SpringSecurityStaticAnalyzer",ResolutionStatus.UNRESOLVED,"路徑="+redirect.path()+"；候選畫面="+screens))));continue;}
   String id=screens.iterator().next();GraphNode old=nodes.get(id);Map<String,String> attrs=new TreeMap<>(old.attributes());String previous=attrs.putIfAbsent("autoRedirect",redirect.attribute());if(previous!=null&&!previous.equals(redirect.attribute())){diagnostics.add(new Diagnostic("同一畫面有多種 Spring Security 自動導向設定",Confidence.AMBIGUOUS,redirect.source(),"SPRING_SECURITY_REDIRECT_AMBIGUOUS",List.of(new AnalysisEvidence(redirect.source(),"SpringSecurityStaticAnalyzer",ResolutionStatus.AMBIGUOUS,"候選="+previous+","+redirect.attribute()))));continue;}
   List<AnalysisEvidence> proof=new ArrayList<>(old.evidence());proof.add(new AnalysisEvidence(redirect.source(),"SpringSecurityStaticAnalyzer",ResolutionStatus.CONFIRMED,"設定鍵="+redirect.attribute()+"；路徑="+redirect.path()+"；受保護路徑="+redirect.patterns()));nodes.put(id,new GraphNode(old.id(),old.type(),old.name(),attrs,old.source(),old.confidence(),proof.stream().distinct().sorted().toList()));
  }
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),graph.relationships(),diagnostics.stream().distinct().toList(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
 private static void parseXml(String text,String file,List<Redirect> out,List<Diagnostic> diagnostics)throws Exception {
  var factory=DocumentBuilderFactory.newInstance();factory.setNamespaceAware(true);factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");factory.setExpandEntityReferences(false);var doc=factory.newDocumentBuilder().parse(new InputSource(new StringReader(text)));
  List<String> protectedPaths=new ArrayList<>();var all=doc.getElementsByTagName("*");for(int i=0;i<all.getLength();i++){var element=(org.w3c.dom.Element)all.item(i);String name=element.getLocalName()==null?element.getTagName().replaceFirst("^.*:",""):element.getLocalName();if(name.equals("intercept-url")&&element.hasAttribute("pattern"))protectedPaths.add(element.getAttribute("pattern"));}
  for(int i=0;i<all.getLength();i++){var element=(org.w3c.dom.Element)all.item(i);String name=element.getLocalName()==null?element.getTagName().replaceFirst("^.*:",""):element.getLocalName();if(name.equals("form-login"))addXml(text,file,element,"login-page","LOGIN_PAGE",protectedPaths,out,diagnostics);if(name.equals("access-denied-handler"))addXml(text,file,element,"error-page","ACCESS_DENIED",protectedPaths,out,diagnostics);if(name.equals("http"))addXml(text,file,element,"access-denied-page","ACCESS_DENIED",protectedPaths,out,diagnostics);}
 }
 private static void addXml(String text,String file,org.w3c.dom.Element element,String key,String kind,List<String> patterns,List<Redirect> out,List<Diagnostic> diagnostics){if(!element.hasAttribute(key))return;String value=element.getAttribute(key);int line=line(text,value);SourceLocation source=new SourceLocation(file,line);if(dynamic(value)){diagnostics.add(new Diagnostic("Spring Security 導向值不是可證明的字面路徑",Confidence.UNRESOLVED,source,"SPRING_SECURITY_DYNAMIC_REDIRECT",List.of(new AnalysisEvidence(source,"SpringSecurityStaticAnalyzer",ResolutionStatus.UNRESOLVED,"設定鍵="+key+"；原始值="+value))));return;}out.add(new Redirect(value,key.equals("login-page")?"LOGIN_PAGE":"ACCESS_DENIED",source,List.copyOf(patterns)));}
 private static void parseJava(String text,String file,List<Redirect> out,List<Diagnostic> diagnostics){try{var unit=StaticJavaParser.parse(text);List<String> patterns=new ArrayList<>();for(MethodCallExpr call:unit.findAll(MethodCallExpr.class))if(Set.of("requestMatchers","antMatchers","mvcMatchers").contains(call.getNameAsString()))for(Expression arg:call.getArguments())if(arg.isStringLiteralExpr())patterns.add(arg.asStringLiteralExpr().asString());
  for(MethodCallExpr call:unit.findAll(MethodCallExpr.class))if(Set.of("loginPage","accessDeniedPage").contains(call.getNameAsString())){SourceLocation source=new SourceLocation(file,call.getBegin().map(p->p.line).orElse(1));String kind=call.getNameAsString().equals("loginPage")?"LOGIN_PAGE":"ACCESS_DENIED";if(call.getArguments().size()!=1||!call.getArgument(0).isStringLiteralExpr()){diagnostics.add(new Diagnostic("Spring Security 導向值不是可證明的字面路徑",Confidence.UNRESOLVED,source,"SPRING_SECURITY_DYNAMIC_REDIRECT",List.of(new AnalysisEvidence(source,"SpringSecurityStaticAnalyzer",ResolutionStatus.UNRESOLVED,"設定鍵="+call.getNameAsString()+"；原始值="+call.getArguments()))));continue;}out.add(new Redirect(call.getArgument(0).asStringLiteralExpr().asString(),kind,source,List.copyOf(patterns)));}
 }catch(RuntimeException error){diagnostics.add(new Diagnostic("Spring Security Java 設定無法解析",Confidence.UNRESOLVED,new SourceLocation(file,1),"SPRING_SECURITY_PARSE",List.of()));}}
 private static boolean dynamic(String value){return value.contains("${")||value.contains("<%")||value.contains("#{")||value.contains("+");}
 private static int line(String text,String value){int offset=text.indexOf(value);return offset<0?1:1+(int)text.substring(0,offset).chars().filter(c->c=='\n').count();}
}
