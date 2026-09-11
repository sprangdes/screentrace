package io.screentrace.adapter.spring;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/** AST-based Spring mapping parser; React extraction is deliberately limited to declared route/link/API literals. */
public final class SpringBootAnalyzer {
  private static final Set<String> MAPPINGS = Set.of("RequestMapping","GetMapping","PostMapping","PutMapping","DeleteMapping","PatchMapping");
  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    var nodes = new ArrayList<GraphNode>(); var edges = new ArrayList<Relationship>(); var diagnostics = new ArrayList<Diagnostic>();
    Map<String,String> endpointByRoute = new HashMap<>();
    for (Path file : inventory.javaFiles()) parseController(inventory.root(), file, nodes, edges, endpointByRoute, diagnostics);
    for (Path file : inventory.reactFiles()) parseReact(inventory.root(), file, nodes, edges, endpointByRoute);
    connectReactGraph(nodes, edges);
    return new ApplicationGraph(new ApplicationGraph.Application(inventory.root().getFileName().toString(), inventory.root().toString(), inventory.technologies()), nodes, edges, diagnostics);
  }
  private void parseController(Path root, Path file, List<GraphNode> nodes, List<Relationship> edges, Map<String,String> endpointByRoute, List<Diagnostic> diagnostics) {
    try {
      var unit = StaticJavaParser.parse(file); String relative = root.relativize(file).toString();
      for (ClassOrInterfaceDeclaration type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
        boolean controller = annotation(type, "Controller") != null || annotation(type, "RestController") != null;
        if (!controller) continue;
        boolean rest = annotation(type, "RestController") != null;
        List<String> bases = paths(annotation(type, "RequestMapping")); if (bases.isEmpty()) bases = List.of("");
        for (MethodDeclaration method : type.getMethods()) {
          AnnotationExpr mapping = method.getAnnotations().stream().filter(a -> MAPPINGS.contains(a.getNameAsString())).findFirst().orElse(null);
          if (mapping == null) continue;
          String http = methodFor(mapping.getNameAsString()); List<String> methodPaths = paths(mapping); if (methodPaths.isEmpty()) methodPaths = List.of("");
          if (mapping.getNameAsString().equals("RequestMapping")) { String candidate = named(mapping, "method"); if (candidate != null) http = candidate.replace("RequestMethod.", ""); }
          int line = method.getBegin().map(p -> p.line).orElse(1); SourceLocation loc = new SourceLocation(relative, line);
          String handlerName = type.getNameAsString() + "." + method.getNameAsString() + "()";
          String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + handlerName + ":" + line);
          addNode(nodes, new GraphNode(handlerId, NodeType.HANDLER, handlerName, Map.of("class", type.getNameAsString(), "method", method.getNameAsString()), loc, Confidence.CONFIRMED));
          String result = returnLiteral(method); boolean redirect = result != null && result.startsWith("redirect:");
          for (String base : bases) for (String child : methodPaths) {
            String path = join(base, child); String label = http + " " + path;
            String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, label + ":" + handlerId);
            Map<String,String> attrs = new TreeMap<>(); attrs.put("httpMethod", http); attrs.put("path", path); attrs.put("category", rest ? "REST_API" : redirect ? "REDIRECT" : "MVC_SCREEN");
            addNode(nodes, new GraphNode(endpointId, NodeType.ENDPOINT, label, attrs, loc, Confidence.CONFIRMED)); endpointByRoute.putIfAbsent(path, endpointId);
            edge(edges, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, loc);
            if (!rest && result != null && !redirect) { String viewId = screen(root, result, nodes, loc); edge(edges, EdgeType.RENDERS, handlerId, viewId, Confidence.CONFIRMED, loc); }
          }
        }
      }
    } catch (Exception e) { diagnostics.add(new Diagnostic("Unable to parse Java source: " + e.getMessage(), Confidence.UNRESOLVED, new SourceLocation(root.relativize(file).toString(), 1))); }
  }
  private void parseReact(Path root, Path file, List<GraphNode> nodes, List<Relationship> edges, Map<String,String> endpointByRoute) throws IOException {
    String text = Files.readString(file); String rel = root.relativize(file).toString();
    Map<String,String> imports = imports(root, file, text);
    Matcher routes = Pattern.compile("(?s)<Route\\s+path\\s*=\\s*[\\\"'](/[^\\\"']*)[\\\"'].*?element\\s*=\\s*\\{(.*?)\\}\\s*/?>").matcher(text);
    while(routes.find()) { String route = routes.group(1); Matcher viewMatcher=Pattern.compile("<([A-Z][A-Za-z0-9_]*)").matcher(routes.group(2)); String view="Route"; while(viewMatcher.find()) view=viewMatcher.group(1); String name = route.equals("/") ? "Home" : route.substring(1); String id = ApplicationGraph.id(NodeType.SCREEN, rel + ":" + route); String viewSource=sourceForView(text, view, imports, rel); Map<String,String> attrs=new TreeMap<>();attrs.put("route",route);attrs.put("view",view);attrs.put("viewSource",viewSource);attrs.put("viewSources",String.join("|",sourceClosure(root,viewSource,new LinkedHashSet<>()))); addNode(nodes,new GraphNode(id,NodeType.SCREEN,name,attrs,new SourceLocation(rel,line(text,routes.start())),Confidence.CONFIRMED)); }
    Matcher links = Pattern.compile("<(?:Link|NavLink)\\b[^>]*\\bto\\s*=\\s*(?:\\{)?[\\\"'](/[^\\\"'}]+)").matcher(text);
    while(links.find()) component(nodes, edges, rel, text, links.start(), "LINK", links.group(1), "NAVIGATION", null, endpointByRoute);
    Matcher navigations = Pattern.compile("\\bnavigate\\s*\\(\\s*[\\\"'](/[^\\\"')]+)").matcher(text);
    while(navigations.find()) component(nodes, edges, rel, text, navigations.start(), "BUTTON", navigations.group(1), "NAVIGATION", null, endpointByRoute);
    Matcher api = Pattern.compile("[\\\"'](/api/[^\\\"'?` }]+)").matcher(text);
    while(api.find()) component(nodes, edges, rel, text, api.start(), "API_CALL", api.group(1), "REQUEST", api.group(1), endpointByRoute);
  }
  private static Map<String,String> imports(Path root, Path file, String text) {
    Map<String,String> result=new HashMap<>(); Matcher imports=Pattern.compile("import\\s+(?:\\{\\s*)?([A-Z][A-Za-z0-9_]*).*?from\\s+[\\\"']([^\\\"']+)[\\\"']").matcher(text);
    while(imports.find()) { Path base=file.getParent().resolve(imports.group(2)); for(String suffix:List.of(".tsx",".jsx",".ts",".js","/index.tsx")) { Path candidate=Path.of(base.toString()+suffix); if(Files.exists(candidate)){result.put(imports.group(1),root.relativize(candidate).toString());break;} } } return result;
  }
  private static String sourceForView(String text, String view, Map<String,String> imports, String fallback) {
    String direct = imports.get(view); if (direct != null) return direct;
    Matcher function = Pattern.compile("(?s)function\\s+" + Pattern.quote(view) + "\\b.*?(?=\\nfunction\\s+|\\nexport\\s+|\\z)").matcher(text);
    if (function.find()) { Matcher rendered = Pattern.compile("<([A-Z][A-Za-z0-9_]*)").matcher(function.group()); while (rendered.find()) { String source = imports.get(rendered.group(1)); if (source != null) return source; } }
    return fallback;
  }
  private static Set<String> sourceClosure(Path root, String relative, Set<String> visited) {
    if (!visited.add(relative)) return visited;
    Path file=root.resolve(relative); if (!Files.isRegularFile(file)) return visited;
    try { String text=Files.readString(file); Map<String,String> children=imports(root,file,text); Matcher rendered=Pattern.compile("<([A-Z][A-Za-z0-9_]*)").matcher(text); while(rendered.find()) { String child=children.get(rendered.group(1)); if(child!=null) sourceClosure(root,child,visited); } } catch (IOException ignored) { }
    return visited;
  }
  private static void connectReactGraph(List<GraphNode> nodes,List<Relationship> edges) {
    Map<String,GraphNode> screensByRoute=new HashMap<>(); for(GraphNode n:nodes)if(n.type()==NodeType.SCREEN&&n.attributes().containsKey("route"))screensByRoute.put(n.attributes().get("route"),n);
    for(GraphNode screen:nodes.stream().filter(n->n.type()==NodeType.SCREEN).toList()) { String value=screen.attributes().get("viewSources"); if(value==null)continue; Set<String> sources=Set.of(value.split("\\|")); for(GraphNode component:nodes.stream().filter(n->n.type()==NodeType.COMPONENT&&n.source()!=null&&sources.contains(n.source().file())&&"NAVIGATION".equals(n.attributes().get("action"))).toList()) { edge(edges,EdgeType.CONTAINS,screen.id(),component.id(),Confidence.CONFIRMED,component.source()); String target=component.attributes().get("target"); GraphNode next=screensByRoute.get(target); if(next!=null)edge(edges,EdgeType.NAVIGATES_TO,component.id(),next.id(),Confidence.CONFIRMED,component.source()); } }
  }
  private void component(List<GraphNode> nodes,List<Relationship> edges,String rel,String text,int offset,String type,String target,String kind,String endpoint,Map<String,String> known) {
    int ln=line(text,offset); String id=ApplicationGraph.id(NodeType.COMPONENT,rel+":"+ln+":"+target); SourceLocation loc=new SourceLocation(rel,ln);
    addNode(nodes,new GraphNode(id,NodeType.COMPONENT,target,Map.of("componentType",type,"action",kind,"target",target),loc,Confidence.CONFIRMED));
    if(endpoint != null) { String targetId=known.get(endpoint); if(targetId != null) edge(edges,EdgeType.TRIGGERS,id,targetId,Confidence.CONFIRMED,loc); }
  }
  private static String screen(Path root,String view,List<GraphNode> nodes,SourceLocation loc) { String id=ApplicationGraph.id(NodeType.SCREEN,view); addNode(nodes,new GraphNode(id,NodeType.SCREEN,view,Map.of("view",view),loc,Confidence.CONFIRMED)); return id; }
  private static void addNode(List<GraphNode> n,GraphNode node) { if(n.stream().noneMatch(x->x.id().equals(node.id())))n.add(node); }
  private static void edge(List<Relationship> edges,EdgeType type,String from,String to,Confidence confidence,SourceLocation source) {
    String id=ApplicationGraph.id(NodeType.COMPONENT,type+":"+from+":"+to);
    if(edges.stream().noneMatch(edge->edge.id().equals(id))) edges.add(new Relationship(id,type,from,to,confidence,source));
  }
  private static AnnotationExpr annotation(NodeWithAnnotations<?> n,String name) { return n.getAnnotations().stream().filter(a->a.getNameAsString().equals(name)).findFirst().orElse(null); }
  private static List<String> paths(AnnotationExpr a) { if(a==null)return List.of(); List<String> out=new ArrayList<>(); if(a instanceof SingleMemberAnnotationExpr s) literals(s.getMemberValue(),out); else if(a instanceof NormalAnnotationExpr n) n.getPairs().stream().filter(p->Set.of("value","path").contains(p.getNameAsString())).forEach(p->literals(p.getValue(),out)); return out; }
  private static void literals(Expression e,List<String> out) { if(e.isStringLiteralExpr())out.add(e.asStringLiteralExpr().asString()); else if(e.isArrayInitializerExpr())e.asArrayInitializerExpr().getValues().forEach(x->literals(x,out)); }
  private static String named(AnnotationExpr a,String name) { if(a instanceof NormalAnnotationExpr n) return n.getPairs().stream().filter(p->p.getNameAsString().equals(name)).map(p->p.getValue().toString()).findFirst().orElse(null); return null; }
  private static String methodFor(String a) { return Map.of("GetMapping","GET","PostMapping","POST","PutMapping","PUT","DeleteMapping","DELETE","PatchMapping","PATCH").getOrDefault(a,"ANY"); }
  private static String join(String a,String b) { String x=(a+"/"+b).replaceAll("/{2,}","/"); return x.isEmpty()?"/":x.startsWith("/")?x:"/"+x; }
  private static String returnLiteral(MethodDeclaration m) { return m.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class).stream().map(r->r.getExpression().filter(Expression::isStringLiteralExpr).map(e->e.asStringLiteralExpr().asString()).orElse(null)).filter(Objects::nonNull).findFirst().orElse(null); }
  private static int line(String s,int offset) { return 1+(int)s.substring(0,offset).chars().filter(c->c=='\n').count(); }
}
