package io.screentrace.adapter.struts;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.w3c.dom.*;

/** Static Struts 1 analysis. No target bytecode or configuration plugins are loaded. */
public final class StrutsProjectAnalyzer {
  private static final String PARSER="StrutsProjectAnalyzer";
  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    State state=new State(inventory);
    inventory=state.inventory;
    var unsupported=StrutsFrameworkDetector.unsupported(inventory);
    if(unsupported.isPresent()) {state.diagnostics.add(unsupported.get());return GraphIntegrityValidator.requireAnalysis(UrlGraphContribution.hidePrivateLocations(state.graph()));}
    for(String message:inventory.diagnostics()) state.diagnostics.add(StrutsSources.diagnostic(message,".",1,"SOURCE_LIMIT"));
    state.types.putAll(StrutsSources.javaTypes(inventory,state.diagnostics));
    readSpringBeans(state);
    readMessages(state);
    readServletMapping(state);
    JspAnalysis jsp=new JspProjectParser().analyze(inventory.root(),inventory.files());
    state.diagnostics.addAll(jsp.diagnostics());
    for(var view:jsp.views()) addView(view,state);
    readTiles(state);
    if(inventory.strutsConfigFiles().isEmpty()) state.diagnostics.add(StrutsSources.diagnostic("找不到 Struts 1 設定檔",".",1,"STRUTS_CONFIG_MISSING"));
    for(Path config:inventory.strutsConfigFiles()) parseConfig(config,state);
    resolveConfiguredForwards(state);
    readWelcomeFiles(state);
    addInteractions(jsp,state);
    pruneUnroutedTilesScreens(state);
    parseValidation(state);
    parseActionForms(state);
    return GraphIntegrityValidator.requireAnalysis(io.screentrace.parser.jsp.UrlGraphContribution.enrich(JavaScriptGraphContribution.enrich(MarkupGraphContribution.enrich(ActionContracts.enrich(state.graph(),inventory),jsp),inventory),inventory));
  }
  private static void addView(JspAnalysis.View view,State state) {
    String viewId=ApplicationGraph.id(NodeType.VIEW,view.path());
    addNode(state,viewId,NodeType.VIEW,view.path(),Map.of("view",view.path()),view.source(),Confidence.CONFIRMED);
    indexView(state.viewIds,view.path(),viewId);
    if(view.kind()==JspAnalysis.ViewKind.JSP) {
      String id=StableGraphIds.screen(view.path());
      addNode(state,id,NodeType.SCREEN,Path.of(view.path()).getFileName().toString().replaceFirst("\\.jsp$",""),Map.of("view",view.path()),view.source(),Confidence.CONFIRMED);
      indexView(state.screens,view.path(),id);
    }
  }
  private static void collectFormProperties(String className,State state,Map<String,String> properties,List<AnalysisEvidence> proof,Set<String> seen) {
    if(className==null||!seen.add(className))return;var type=state.types.get(className);if(type==null)return;
    String parent=type.parent();int separator=type.name().lastIndexOf('.');
    if(!parent.contains(".")&&separator>=0&&state.types.containsKey(type.name().substring(0,separator+1)+parent))parent=type.name().substring(0,separator+1)+parent;
    collectFormProperties(parent,state,properties,proof,seen);
    for(var field:type.declaration().getFields()) for(var variable:field.getVariables()) properties.putIfAbsent("field."+variable.getNameAsString()+".type",variable.getType().asString());
    for(var method:type.declaration().getMethods()) if(method.isPublic()&&method.getParameters().isEmpty()&&method.getNameAsString().startsWith("get")&&method.getNameAsString().length()>3) {
      String raw=method.getNameAsString().substring(3);properties.put("field."+java.beans.Introspector.decapitalize(raw)+".type",method.getType().asString());
    }
    proof.addAll(evidence(type.source(),Confidence.CONFIRMED,"ActionForm 欄位宣告："+className));
  }

  private static void parseConfig(Path config,State state) {
    String path=relative(state,config);
    try {
      Document document=readXml(config,state);
      String module=moduleFor(path,state);
      for(Element form:StrutsSources.elements(document,"form-bean")) {
        String name=form.getAttribute("name"),id=ApplicationGraph.id(NodeType.FORM_MODEL,path+":"+name);
        Map<String,String> attrs=new TreeMap<>(StrutsSources.attributes(form));attrs.put("class",form.getAttribute("type"));
        for(Element property:StrutsSources.elements(form,"form-property")) for(var attribute:StrutsSources.attributes(property).entrySet()) attrs.put("field."+property.getAttribute("name")+"."+attribute.getKey(),attribute.getValue());
        addNode(state,id,NodeType.FORM_MODEL,name,attrs,StrutsSources.source(path,form),Confidence.CONFIRMED);
        var model=state.nodes.get(id);var properties=new TreeMap<>(model.attributes());var proof=new ArrayList<>(model.evidence());
        collectFormProperties(properties.get("class"),state,properties,proof,new HashSet<>());
        state.nodes.put(id,new GraphNode(model.id(),model.type(),model.name(),properties,model.source(),model.confidence(),proof));
        state.forms.put(module+":"+name,id);
      }
      Map<String,String> global=new TreeMap<>();
      for(Element group:StrutsSources.elements(document,"global-forwards")) for(Element forward:StrutsSources.elements(group,"forward")) {
        global.put(forward.getAttribute("name"),forward.getAttribute("path"));
        state.globalForwards.put(module+":"+forward.getAttribute("name"),forward.getAttribute("path"));
        String id=ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,path+":global:"+forward.getAttribute("name"));
        addNode(state,id,NodeType.SOURCE_ARTIFACT,"GLOBAL "+forward.getAttribute("name"),StrutsSources.attributes(forward),StrutsSources.source(path,forward),Confidence.CONFIRMED);
      }
      boolean inputForward=StrutsSources.elements(document,"controller").stream().anyMatch(controller->"true".equalsIgnoreCase(controller.getAttribute("inputForward")));
      state.inputForward.put(module,inputForward);
      for(Element plugin:StrutsSources.elements(document,"plug-in")) {
        Map<String,String> attrs=new TreeMap<>(StrutsSources.attributes(plugin));
        for(Element property:StrutsSources.elements(plugin,"set-property")) attrs.put(property.getAttribute("property"),property.getAttribute("value"));
        addNode(state,ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,path+":plugin:"+plugin.getAttribute("className")),NodeType.SOURCE_ARTIFACT,"設定外掛",attrs,StrutsSources.source(path,plugin),Confidence.CONFIRMED);
      }
      for(Element exception:StrutsSources.elements(document,"exception")) {
        var source=StrutsSources.source(path,exception);
        String id=ApplicationGraph.id(NodeType.HANDLER,path+":exception:"+exception.getAttribute("key")+":"+source.line());
        addNode(state,id,NodeType.HANDLER,"例外處理",StrutsSources.attributes(exception),source,Confidence.CONFIRMED);
        state.pendingForwards.add(new PendingForward(id,module,exception.getAttribute("path"),source));
      }
      for(Element action:StrutsSources.elements(document,"action")) {
        String route=module+action.getAttribute("path");if(action.getAttribute("path").isBlank()) continue;
        String type=state.beans.getOrDefault(action.getAttribute("type"),action.getAttribute("type"));
        var source=StrutsSources.source(path,action);Map<String,String> attrs=new TreeMap<>(StrutsSources.attributes(action));attrs.put("actionType",type);attrs.put("module",module);
        String handlerId=ApplicationGraph.id(NodeType.HANDLER,path+":"+route);
        String family=dispatchFamily(type,state,new HashSet<>());
        boolean executeProven=state.types.containsKey(type)&&state.types.get(type).declaration().getMethodsByName("execute").stream().anyMatch(StrutsProjectAnalyzer::validDispatchSignature);
        Confidence status=family.isBlank()?(type.isBlank()?Confidence.UNRESOLVED:executeProven?Confidence.CONFIRMED:Confidence.INFERRED):Confidence.UNRESOLVED;
        if(!family.isBlank()) attrs.put("dispatchFamily",family);
        addNode(state,handlerId,NodeType.HANDLER,type.isBlank()?"未解析的處理器":type+(family.isBlank()?".execute()":".<dispatch>()"),attrs,source,status);
        String formId=state.forms.get(module+":"+action.getAttribute("name"));
        if(formId!=null) edge(state,EdgeType.DECLARED_BY,handlerId,formId,Confidence.CONFIRMED,source);
        Map<String,String> forwards=new TreeMap<>(global);Map<String,SourceLocation> forwardSources=new TreeMap<>();
        for(Element item:StrutsSources.elements(action,"forward")) {forwards.put(item.getAttribute("name"),item.getAttribute("path"));forwardSources.put(item.getAttribute("name"),StrutsSources.source(path,item));}
        String input=action.getAttribute("input");if(inputForward&&!input.isBlank())input=global.getOrDefault(input,input);
        Map<String,String> localForwards=new TreeMap<>();for(Element item:StrutsSources.elements(action,"forward"))localForwards.put(item.getAttribute("name"),item.getAttribute("path"));
        Mapping mapping=new Mapping(route,type,handlerId,formId,action.getAttribute("parameter"),family,forwards,localForwards,forwardSources,input,module,source);
        state.actionMappings.add(mapping);
        if(state.servletPattern!=null) {
          String publicPath=publicPath(route,state),endpointId=StableGraphIds.endpoint("ANY",route);
          var mappings=state.routes.computeIfAbsent(route,key->new ArrayList<>());mappings.add(mapping);state.endpointIds.put(route,endpointId);
          state.routes.put(publicPath,mappings);state.endpointIds.put(publicPath,endpointId);
          if(mappings.size()>1) diagnostic(state,"路由重複，保留所有處理器候選："+route,source,"DUPLICATE_ROUTE");
          Map<String,String> endpointAttrs=new TreeMap<>();endpointAttrs.put("httpMethod","ANY");endpointAttrs.put("path",publicPath);endpointAttrs.put("category","ACTION");endpointAttrs.put("servletMappingStatus","PROVEN");
          if(!publicPath.equals(route)){endpointAttrs.put("logicalPath",route);endpointAttrs.put("aliases",route);}
          String proof="servlet mapping 已證明："+state.servletPattern.servletClass()+" → "+state.servletPattern.pattern();
          addNode(state,endpointId,NodeType.ENDPOINT,"ANY "+publicPath,endpointAttrs,source,status,proof);
          edge(state,EdgeType.HANDLED_BY,endpointId,handlerId,status,source,proof);
        } else {
          for(String alias:endpointPaths(route)) {
            String endpointId=StableGraphIds.endpoint("ANY",alias);
            var mappings=state.routes.computeIfAbsent(alias,key->new ArrayList<>());mappings.add(mapping);state.endpointIds.put(alias,endpointId);
            if(mappings.size()>1) diagnostic(state,"路由重複，保留所有處理器候選："+alias,source,"DUPLICATE_ROUTE");
            Confidence routeStatus=alias.equals(route)?status:(status==Confidence.CONFIRMED?Confidence.INFERRED:status);
            addNode(state,endpointId,NodeType.ENDPOINT,"ANY "+alias,Map.of("httpMethod","ANY","path",alias,"category","ACTION"),source,routeStatus);
            edge(state,EdgeType.HANDLED_BY,endpointId,handlerId,routeStatus,source);
          }
        }
        for(var entry:forwardSources.entrySet())state.pendingForwards.add(new PendingForward(handlerId,module,forwards.get(entry.getKey()),entry.getValue()));
        if(!input.isBlank())state.pendingForwards.add(new PendingForward(handlerId,module,input,source));
      }
    } catch(Exception error) {diagnostic(state,"Struts 設定無法解析："+error.getMessage(),new SourceLocation(path,1),"STRUTS_CONFIG_UNRESOLVED");}
  }
  private static String moduleFor(String path,State state) {
    for(Path file:state.inventory.files()) if(file.getFileName().toString().equals("web.xml")) try {
      for(Element parameter:StrutsSources.elements(readXml(file,state),"init-param")) {
        var names=StrutsSources.elements(parameter,"param-name");var values=StrutsSources.elements(parameter,"param-value");
        if(names.isEmpty()||values.isEmpty()) continue;
        String name=names.get(0).getTextContent().trim();if(!name.startsWith("config/")) continue;
        for(String value:values.get(0).getTextContent().split(",")) if(path.endsWith(value.trim())) return "/"+name.substring("config/".length());
      }
    } catch(Exception error) {diagnostic(state,"web.xml 模組設定無法解析",new SourceLocation(relative(state,file),1),"MODULE_CONFIG_UNRESOLVED");}
    return "";
  }

  private static void readServletMapping(State state) {
    List<ServletPattern> patterns=new ArrayList<>();boolean sawActionServlet=false;
    for(Path file:state.inventory.files()) if(file.getFileName().toString().equals("web.xml")) try {
      String path=relative(state,file);Document document=readXml(file,state);Set<String> actionNames=new TreeSet<>();
      for(Element servlet:StrutsSources.elements(document,"servlet")) {
        List<Element> names=StrutsSources.elements(servlet,"servlet-name"),classes=StrutsSources.elements(servlet,"servlet-class");
        if(names.isEmpty()||classes.isEmpty())continue;
        String type=classes.get(0).getTextContent().trim();
        if(isActionServlet(type,state,new HashSet<>()))actionNames.add(names.get(0).getTextContent().trim());
      }
      for(String name:actionNames)sawActionServlet=true;
      for(Element mapping:StrutsSources.elements(document,"servlet-mapping")) {
        List<Element> names=StrutsSources.elements(mapping,"servlet-name");if(names.isEmpty()||!actionNames.contains(names.get(0).getTextContent().trim()))continue;
        for(Element pattern:StrutsSources.elements(mapping,"url-pattern")) {
          String value=pattern.getTextContent().trim();if(value.startsWith("*.")&&value.length()>2||value.startsWith("/")&&value.endsWith("/*"))patterns.add(new ServletPattern(value,StrutsSources.source(path,pattern),servletClass(document,names.get(0).getTextContent().trim())));
        }
      }
    } catch(Exception error) {diagnostic(state,"ActionServlet 的 web.xml 設定無法解析",new SourceLocation(relative(state,file),1),"STRUTS_SERVLET_MAPPING_UNRESOLVED");}
    List<ServletPattern> unique=patterns.stream().collect(java.util.stream.Collectors.toMap(ServletPattern::pattern,value->value,(first,second)->first,TreeMap::new)).values().stream().toList();
    if(unique.size()==1)state.servletPattern=unique.get(0);
    else if(unique.size()>1)diagnostic(state,"ActionServlet 有多個 URL mapping，無法唯一判定公開網址；servlet mapping 未證明",unique.get(0).source(),"STRUTS_SERVLET_MAPPING_AMBIGUOUS");
    if(unique.size()!=1&&!state.inventory.strutsConfigFiles().isEmpty()) {
      SourceLocation source=state.inventory.files().stream().filter(file->file.getFileName().toString().equals("web.xml")).findFirst().map(file->new SourceLocation(relative(state,file),1)).orElse(new SourceLocation(".",1));
      String reason=(sawActionServlet?"ActionServlet 沒有唯一可用 servlet-mapping":"找不到可證明的 ActionServlet servlet 宣告與 mapping")+"；servlet mapping 未證明";
      diagnostic(state,reason,source,"STRUTS_SERVLET_MAPPING_UNRESOLVED");
    }
  }

  private static boolean isActionServlet(String className,State state,Set<String> visited) {
    if("org.apache.struts.action.ActionServlet".equals(className))return true;
    if(className==null||className.isBlank()||!visited.add(className))return false;
    StrutsSources.JavaType type=state.types.get(className);return type!=null&&isActionServlet(type.parent(),state,visited);
  }

  private static String servletClass(Document document,String servletName) {
    for(Element servlet:StrutsSources.elements(document,"servlet")) {
      List<Element> names=StrutsSources.elements(servlet,"servlet-name"),classes=StrutsSources.elements(servlet,"servlet-class");
      if(!names.isEmpty()&&!classes.isEmpty()&&servletName.equals(names.get(0).getTextContent().trim()))return classes.get(0).getTextContent().trim();
    }
    return "";
  }

  private static String publicPath(String route,State state) {
    if(state.servletPattern==null)return route;
    String pattern=state.servletPattern.pattern();
    if(pattern.startsWith("*.")) {String suffix=pattern.substring(1);return route.endsWith(suffix)?route:route+suffix;}
    String prefix=pattern.substring(0,pattern.length()-1);
    return route.startsWith(prefix)?route:prefix+(route.startsWith("/")?route.substring(1):route);
  }

  private static String logicalPath(String path,State state) {
    if(state.endpointIds.containsKey(path))return state.routes.containsKey(path)?state.routes.get(path).get(0).route():path;
    if(state.servletPattern==null)return null;
    String pattern=state.servletPattern.pattern();
    if(pattern.startsWith("*.")) {String suffix=pattern.substring(1);return path.endsWith(suffix)?path.substring(0,path.length()-suffix.length()):null;}
    String prefix=pattern.substring(0,pattern.length()-1);
    return path.startsWith(prefix)?"/"+path.substring(prefix.length()):null;
  }

  private static String screenForView(String path,State state,SourceLocation source) {
    String direct=state.screens.get(path);if(direct!=null)return direct;
    String indexed=state.viewIds.get(path);
    if(indexed==null){List<String> candidates=state.viewIds.entrySet().stream().filter(entry->entry.getKey().endsWith(path)).map(Map.Entry::getValue).distinct().toList();if(candidates.size()==1)indexed=candidates.get(0);}
    if(indexed!=null){String viewPath=state.nodes.get(indexed).attributes().get("view");if(viewPath!=null)return ensureJspScreen(viewPath,state);}
    if(!path.startsWith("/"))return null;
    List<String> matches=state.nodes.values().stream().filter(node->node.type()==NodeType.SCREEN&&node.attributes().getOrDefault("view","").endsWith(path)).map(GraphNode::id).distinct().toList();
    if(matches.size()==1)return matches.get(0);
    if(matches.size()>1)diagnostic(state,"forward JSP 路徑對應多個畫面："+path,source,"STRUTS_FORWARD_AMBIGUOUS");
    return null;
  }

  private static String ensureJspScreen(String viewPath,State state) {
    String existing=state.screens.get(viewPath);if(existing!=null)return existing;
    String viewId=state.viewIds.get(viewPath);GraphNode view=viewId==null?null:state.nodes.get(viewId);if(view==null)return null;
    String id=StableGraphIds.screen(viewPath);String name=Path.of(viewPath).getFileName().toString().replaceFirst("\\.jsp$","");
    addNode(state,id,NodeType.SCREEN,name,Map.of("view",viewPath),view.source(),Confidence.CONFIRMED);indexView(state.screens,viewPath,id);return id;
  }

  private static void resolveConfiguredForwards(State state) {
    for(PendingForward pending:state.pendingForwards)forward(pending.target(),pending.ownerId(),pending.module(),pending.source(),state);
    for(Mapping mapping:state.actionMappings)analyzeForwards(mapping,state);
  }

  private static void readWelcomeFiles(State state) {
    for(Path file:state.inventory.files()) if(file.getFileName().toString().equals("web.xml")) try {
      String path=relative(state,file);Document document=readXml(file,state);
      for(Element list:StrutsSources.elements(document,"welcome-file-list"))for(Element welcome:StrutsSources.elements(list,"welcome-file")) {
        String value=welcome.getTextContent().trim();if(value.isBlank())continue;
        var source=StrutsSources.source(path,welcome);String screenId,route="/";
        if(value.endsWith(".do")||value.contains("/do/")) {
          String normalized=logicalPath(value,state);List<Mapping> routes=normalized==null?List.of():state.routes.getOrDefault(normalized,List.of());
          if(routes.size()!=1){diagnostic(state,"welcome-file action 路由無法唯一解析："+value,source,"STRUTS_WELCOME_FILE_UNRESOLVED");continue;}
          List<String> targetScreens=resolveMappingScreens(routes.get(0),state,new LinkedHashSet<>(),0,source);
          if(targetScreens.size()!=1){diagnostic(state,"welcome-file action 目的畫面無法唯一解析："+value,source,"STRUTS_WELCOME_FILE_UNRESOLVED");continue;}
          screenId=targetScreens.get(0);route=publicPath(normalized,state);
        } else {
          List<String> candidatePaths=new ArrayList<>();if(state.screens.containsKey(value))candidatePaths.add(value);
          for(Path sourceFile:state.inventory.files())if(sourceFile.getFileName().toString().equals(Path.of(value).getFileName().toString())) {String candidate=relative(state,sourceFile);if(candidate.endsWith("/"+value)||candidate.equals(value))candidatePaths.add(candidate);}
          List<String> candidates=candidatePaths.stream().distinct().map(candidate->screenForView(candidate,state,source)).filter(Objects::nonNull).distinct().toList();
          if(candidates.size()!=1) {diagnostic(state,candidates.isEmpty()?"welcome-file 未找到唯一 JSP 畫面："+value:"welcome-file 有多個同名 JSP 畫面："+value,source,candidates.isEmpty()?"STRUTS_WELCOME_FILE_UNRESOLVED":"STRUTS_WELCOME_FILE_AMBIGUOUS");continue;}
          screenId=candidates.get(0);
        }
        String handlerId=ApplicationGraph.id(NodeType.HANDLER,path+":welcome-file:"+value),endpointId=StableGraphIds.endpoint("GET",route);
        addNode(state,endpointId,NodeType.ENDPOINT,"GET "+route,Map.of("httpMethod","GET","path",route,"category","MVC_SCREEN","entryBasis","STATIC_URL","entrySource","系統預設首頁（web.xml welcome-file）","welcomeFile",value),source,Confidence.CONFIRMED);
        addNode(state,handlerId,NodeType.HANDLER,"系統預設首頁",Map.of("entrySource","web.xml welcome-file"),source,Confidence.CONFIRMED);
        edge(state,EdgeType.HANDLED_BY,endpointId,handlerId,Confidence.CONFIRMED,source);edge(state,EdgeType.RENDERS,handlerId,screenId,Confidence.CONFIRMED,source);
        GraphNode old=state.nodes.get(screenId);if(old!=null){Map<String,String> attributes=new TreeMap<>(old.attributes());attributes.put("welcomeFile",value);attributes.put("entrySource","系統預設首頁（web.xml welcome-file）");attributes.put("entryBasis","STATIC_URL");List<AnalysisEvidence> evidence=new ArrayList<>(old.evidence());evidence.add(new AnalysisEvidence(source,"StrutsProjectAnalyzer",ResolutionStatus.CONFIRMED,"welcome-file="+value+"；basis=STATIC_URL"));state.nodes.put(screenId,new GraphNode(old.id(),old.type(),old.name(),attributes,old.source(),old.confidence(),evidence.stream().distinct().sorted().toList()));}
      }
    } catch(Exception error) {diagnostic(state,"web.xml welcome-file 無法解析",new SourceLocation(relative(state,file),1),"STRUTS_WELCOME_FILE_UNRESOLVED");}
  }
  private static void readSpringBeans(State state) {
    for(Path file:state.inventory.springXmlFiles()) try {
      for(Element bean:StrutsSources.elements(readXml(file,state),"bean")) {
        String type=bean.getAttribute("class");if(type.isBlank()) continue;
        if(!bean.getAttribute("id").isBlank()) state.beans.put(bean.getAttribute("id"),type);
        for(String name:bean.getAttribute("name").split("[,;\\s]+")) if(!name.isBlank()) state.beans.put(name,type);
      }
    } catch(Exception error) {diagnostic(state,"Spring bean 設定無法解析",new SourceLocation(relative(state,file),1),"SPRING_BEAN_UNRESOLVED");}
  }
  private static String dispatchFamily(String type,State state,Set<String> seen) {
    String shortName=type.substring(type.lastIndexOf('.')+1);
    if(Set.of("DispatchAction","LookupDispatchAction","MappingDispatchAction").contains(shortName)) return shortName;
    if(!seen.add(type)) return "";
    var java=state.types.get(type);if(java==null) return "";
    String parent=java.parent();String direct=dispatchFamily(parent,state,seen);if(!direct.isBlank()) return direct;
    String prefix=type.contains(".")?type.substring(0,type.lastIndexOf('.')+1):"";return dispatchFamily(prefix+parent,state,seen);
  }
  private static void analyzeForwards(Mapping mapping,State state) {
    var type=state.types.get(mapping.type());if(type==null) return;
    for(MethodDeclaration method:type.declaration().getMethods()) for(MethodCallExpr call:method.findAll(MethodCallExpr.class)) {
      if(!call.getNameAsString().equals("findForward")||call.getArguments().size()!=1) continue;
      var source=new SourceLocation(type.source().file(),call.getBegin().map(p->p.line).orElse(type.source().line()));
      if(call.getArgument(0).isStringLiteralExpr()) {
        String target=mapping.forwards().get(call.getArgument(0).asStringLiteralExpr().asString());
        if(target==null) diagnostic(state,"找不到指定 forward："+call.getArgument(0),source,"STRUTS_FORWARD_UNRESOLVED");
        else forward(target,mapping.handlerId(),mapping.module(),source,state);
      } else diagnostic(state,"forward 運算式無法靜態解析："+call.getArgument(0),source,"STRUTS_FORWARD_EXPRESSION");
    }
  }
  private static void forward(String target,String owner,String module,SourceLocation source,State state) {
    if(target==null||target.isBlank())return;
    if(!StrutsSources.literal(target)){diagnostic(state,"forward 無法靜態解析："+target,source,"STRUTS_FORWARD_UNRESOLVED");return;}
    List<String> screens=resolveForwardScreens(target,module,state,new LinkedHashSet<>(),0,source);
    if(screens.isEmpty()){diagnostic(state,"forward 無法對應 JSP / Tiles 畫面："+target,source,"STRUTS_FORWARD_UNRESOLVED");return;}
    for(String screen:screens)edge(state,EdgeType.FORWARDS_TO,owner,screen,Confidence.CONFIRMED,source);
  }
  private static List<String> resolveForwardScreens(String target,String module,State state,Set<String> visited,int depth,SourceLocation source) {
    if(depth>=5){diagnostic(state,"forward 鏈超過 5 層",source,"STRUTS_FORWARD_DEPTH");return List.of();}
    String named=state.globalForwards.get(module+":"+target);if(named!=null&&!named.equals(target))return resolveForwardScreens(named,module,state,visited,depth+1,source);
    if(state.tiles.containsKey(target)){String screen=ensureTileScreen(target,state);return screen==null?List.of():List.of(screen);}
    String direct=screenForView(target,state,source);if(direct!=null)return List.of(direct);
    String logical=logicalPath(target,state);if(logical==null&&target.startsWith("/")&&!target.startsWith("/WEB-INF/")&&!target.contains(".jsp"))logical=module.isBlank()||target.startsWith(module+"/")?target:module+target;
    if(logical==null)logical=target;
    List<Mapping> mappings=state.routes.getOrDefault(logical,List.of());
    if(mappings.isEmpty())return List.of();
    if(mappings.size()>1){diagnostic(state,"forward 目標對應多個 action："+target,source,"STRUTS_FORWARD_AMBIGUOUS");return List.of();}
    Mapping mapping=mappings.get(0);if(!visited.add(mapping.route())){diagnostic(state,"forward action 鏈形成循環："+mapping.route(),source,"STRUTS_FORWARD_CYCLE");return List.of();}
    List<String> result=resolveMappingScreens(mapping,state,visited,depth+1,source);visited.remove(mapping.route());return result.stream().distinct().sorted().toList();
  }
  private static List<String> resolveMappingScreens(Mapping mapping,State state,Set<String> visited,int depth,SourceLocation source) {
    if(depth>=5){diagnostic(state,"forward 鏈超過 5 層",source,"STRUTS_FORWARD_DEPTH");return List.of();}
    List<String> result=new ArrayList<>();
    for(String value:mapping.localForwards().values())result.addAll(resolveForwardScreens(value,mapping.module(),state,visited,depth+1,source));
    if(mapping.input()!=null&&!mapping.input().isBlank())result.addAll(resolveForwardScreens(mapping.input(),mapping.module(),state,visited,depth+1,source));
    List<String> screens=result.stream().distinct().sorted().toList();String alias=publicPath(mapping.route(),state);
    for(String screen:screens)addScreenRouteAlias(screen,alias,state);
    return screens;
  }

  private static void addScreenRouteAlias(String screenId,String alias,State state) {
    GraphNode screen=state.nodes.get(screenId);if(screen==null||alias==null||alias.isBlank())return;
    Set<String> aliases=new TreeSet<>();String existing=screen.attributes().get("routeAliases");if(existing!=null&&!existing.isBlank())aliases.addAll(Arrays.asList(existing.split("\\u001f")));aliases.add(alias);
    Map<String,String> attrs=new TreeMap<>(screen.attributes());attrs.put("routeAliases",String.join("\u001f",aliases));
    state.nodes.put(screenId,new GraphNode(screen.id(),screen.type(),screen.name(),attrs,screen.source(),screen.confidence(),screen.evidence()));
  }

  private static void addInteractions(JspAnalysis jsp,State state) throws IOException {
    Map<String,List<Control>> byView=new TreeMap<>();
    for(Path file:state.inventory.files()) if(file.toString().endsWith(".jsp")||file.toString().endsWith(".jspf")) {
      String path=relative(state,file);List<Control> controls=new ArrayList<>();
      try {
        String text=SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES);
        String action=null,formGroup=null,activeModule=null;Map<String,Integer> occurrences=new HashMap<>();
        for(MarkupTag tag:MarkupTag.scan(text)) {
          String name=tag.name().toLowerCase(Locale.ROOT);
          if(tag.closing()) {if(Set.of("html:form","form","form:form").contains(name)) {action=null;formGroup=null;activeModule=null;}continue;}
          var source=new SourceLocation(path,tag.line());
          if(Set.of("tiles:insert","tiles:put").contains(name)) {
            String target=first(tag,"definition","page","value");String view=target==null?null:state.viewIds.get(target);
            if(view==null&&target!=null)view=state.tileViewIds.get(target);
            Set<String> owners=new TreeSet<>(state.tileFragmentOwners.getOrDefault(path,Set.of()));String directOwner=state.screens.get(path);if(directOwner!=null)owners.add(directOwner);
            if(view!=null)for(String screen:owners)edge(state,EdgeType.INCLUDES,screen,view,Confidence.CONFIRMED,source);
            else if(target!=null) diagnostic(state,"Tiles 標籤目標未解析："+target,source,"TILES_REFERENCE_UNRESOLVED");
          }
          ComponentKind kind=Set.of("logic:redirect","logic:forward","html:rewrite").contains(name)?ComponentKind.LINK:kind(name,tag);
          if(kind==null) continue;
          if(kind==ComponentKind.FORM) action=first(tag,"action");
          String target=kind==ComponentKind.LINK?first(tag,"href","forward","page","action"):first(tag,"formaction");
          if(Set.of("logic:redirect","logic:forward").contains(name))target=first(tag,"forward","page","action","href");
          String module=moduleFor(path,state);if(target!=null&&tag.attribute("forward")!=null&&!target.startsWith("/")&&!target.contains("."))target=state.globalForwards.getOrDefault(module+":"+target,target);
          if(kind==ComponentKind.FORM)activeModule=tag.attribute("module");
          if(target==null&&(kind==ComponentKind.FORM||kind==ComponentKind.SUBMIT)) target=action;
          Map<String,String> attrs=new TreeMap<>(tag.attributes());attrs.put("tag",name);attrs.put("kind",kind.name());attrs.put("componentType",kind==ComponentKind.FORM||kind==ComponentKind.SUBMIT?"FORM_SUBMIT":kind==ComponentKind.LINK?"NAVIGATION":kind.name());
          String moduleValue=tag.attribute("module")!=null?tag.attribute("module"):activeModule;if(moduleValue!=null)attrs.put("module",moduleValue);
          if(target!=null) attrs.put("target",target);
          String occurrenceKey=name+new TreeMap<>(tag.attributes());int occurrence=occurrences.merge(occurrenceKey,1,Integer::sum)-1;
          String id=StableGraphIds.component(path,kind,identityAttributes(tag,name),occurrence);
          var resolved=jsp.interactions().stream().filter(i->id.equals(i.componentId())).findFirst();
          if(resolved.isPresent()&&!resolved.get().submitsCurrentView()) {target=resolved.get().target();attrs.put("target",target);if(resolved.get().originalExpression()!=null)attrs.put("originalExpression",resolved.get().originalExpression());}
          if(kind==ComponentKind.FORM) formGroup=id;
          String label=first(tag,"value","title","id","name","property");if(label==null) label=name;
          controls.add(new Control(id,label,attrs,target,source,first(tag,"property","name"),first(tag,"value"),formGroup));
        }
      } catch(IOException|SecurityException error) {diagnostic(state,"JSP 元件解析受限："+error.getMessage(),new SourceLocation(path,1),"SOURCE_LIMIT");}
      byView.put(path,controls);
    }
    // Reuse proven include projection so a shared fragment keeps one ID with several screen owners.
    Map<String,Set<String>> projected=new TreeMap<>();
    for(var item:jsp.interactions()) projected.computeIfAbsent(item.viewPath(),key->new TreeSet<>()).add(item.source().file());
    for(var view:jsp.views()) if(view.kind()==JspAnalysis.ViewKind.JSP) {
      Set<String> sources=new TreeSet<>(projected.getOrDefault(view.path(),Set.of()));sources.add(view.path());
      collectIncludeSources(view.path(),jsp,state,new HashSet<>(),sources);
      Set<String> owners=new TreeSet<>(state.tileFragmentOwners.getOrDefault(view.path(),Set.of()));String directOwner=state.screens.get(view.path());if(directOwner!=null)owners.add(directOwner);
      for(String owner:owners)for(String path:sources)for(Control control:byView.getOrDefault(path,List.of()))addControl(owner,control,byView.getOrDefault(path,List.of()),state);
    }
  }
  private static void collectIncludeSources(String view,JspAnalysis jsp,State state,Set<String> seen,Set<String> sources) {
    if(!seen.add(view)) return;
    for(var include:jsp.includes()) if(include.sourceViewPath().equals(view)&&StrutsSources.literal(include.targetPath())) {
      String child=include.targetPath().startsWith("/")?"src/main/webapp"+include.targetPath():Path.of(view).getParent().resolve(include.targetPath()).normalize().toString().replace('\\','/');
      if(!sources.add(child)) continue;collectIncludeSources(child,jsp,state,seen,sources);
    }
  }
  private static void addControl(String screen,Control control,List<Control> peers,State state) {
    addNode(state,control.id(),NodeType.COMPONENT,control.label(),control.attributes(),control.source(),Confidence.CONFIRMED);
    edge(state,EdgeType.CONTAINS,screen,control.id(),Confidence.CONFIRMED,control.source());
    if(control.target()==null) return;
    if(!StrutsSources.literal(control.target())) {diagnostic(state,"元件目標運算式未解析："+control.target(),control.source(),"STRUTS_TARGET_UNRESOLVED");unresolvedBehavior(control,state);return;}
    String resolvedTarget=moduleTarget(control,state),path=resolvedTarget.split("[?#]",2)[0];var mappings=state.routes.get(path);
    if(mappings==null) {String target=state.screens.get(path);if(target!=null) {edge(state,EdgeType.NAVIGATES_TO,control.id(),target,Confidence.CONFIRMED,control.source());return;}String logical=logicalPath(path,state);if(logical!=null)mappings=state.routes.get(logical);}
    if(mappings==null) {
      if(path.endsWith(".do")||path.contains("/do/")){String endpoint=unmappedLiteralEndpoint(path,control,state);edge(state,EdgeType.TRIGGERS,control.id(),endpoint,Confidence.UNRESOLVED,control.source());unresolvedBehavior(control,state);return;}
      diagnostic(state,"元件路由未解析："+path,control.source(),"STRUTS_ROUTE_UNRESOLVED");unresolvedBehavior(control,state);return;
    }
    String endpoint=state.endpointIds.getOrDefault(path,state.endpointIds.getOrDefault(publicPath(mappings.get(0).route(),state),StableGraphIds.endpoint("ANY",mappings.get(0).route())));Confidence status=mappings.size()==1?state.nodes.get(endpoint).confidence():Confidence.AMBIGUOUS;
    if(mappings.size()==1) {
      Mapping mapping=mappings.get(0);
      if(mapping.formId()!=null) edge(state,EdgeType.BINDS_TO,control.id(),mapping.formId(),Confidence.CONFIRMED,control.source());
      if(!mapping.family().isBlank()) {
        String value=mapping.family().equals("MappingDispatchAction")?mapping.parameter():requestParameter(control,peers,mapping.parameter());
        String method=resolveMethod(mapping,value,state);
        var type=method==null?null:typeWithMethod(mapping.type(),method,state,new HashSet<>());
        if(type==null) {
          status=Confidence.UNRESOLVED;diagnostic(state,"Dispatch 方法未解析；parameter="+mapping.parameter()+"，值="+Objects.toString(value,"—"),control.source(),"STRUTS_DISPATCH_UNRESOLVED");
        } else {
          String handlerId=ApplicationGraph.id(NodeType.HANDLER,mapping.type()+"#"+method);
          MethodDeclaration declaration=type.declaration().getMethodsByName(method).stream().filter(StrutsProjectAnalyzer::validDispatchSignature).findFirst().orElseThrow();var source=new SourceLocation(type.source().file(),declaration.getBegin().map(p->p.line).orElse(1));
          addNode(state,handlerId,NodeType.HANDLER,mapping.type()+"."+method+"()",Map.of("class",mapping.type(),"method",method),source,Confidence.CONFIRMED);
          endpoint=StableGraphIds.endpoint("ANY",path+"?"+mapping.parameter()+"="+value);
          addNode(state,endpoint,NodeType.ENDPOINT,"ANY "+path+"?"+mapping.parameter()+"="+value,Map.of("httpMethod","ANY","path",path,"parameter",mapping.parameter(),"parameterValue",value),control.source(),status);
          edge(state,EdgeType.HANDLED_BY,endpoint,handlerId,status,source);
          for(MethodCallExpr call:declaration.findAll(MethodCallExpr.class)) if(call.getNameAsString().equals("findForward")&&call.getArguments().size()==1&&call.getArgument(0).isStringLiteralExpr()) forward(mapping.forwards().get(call.getArgument(0).asStringLiteralExpr().asString()),handlerId,mapping.module(),new SourceLocation(type.source().file(),call.getBegin().map(p->p.line).orElse(1)),state);
        }
      }
      if("LINK".equals(control.attributes().get("kind"))){
        Set<String> destinations=new TreeSet<>();
        if("SwitchAction".equals(mapping.type().substring(mapping.type().lastIndexOf('.')+1))){String switchRoute=switchActionTarget(resolvedTarget);if(switchRoute!=null)for(Mapping candidate:state.routes.getOrDefault(switchRoute,List.of()))destinations.addAll(resolveMappingScreens(candidate,state,new LinkedHashSet<>(),0,control.source()));}
        else destinations.addAll(resolveMappingScreens(mapping,state,new LinkedHashSet<>(),0,control.source()));
        for(String destination:destinations){if(status==Confidence.CONFIRMED)addScreenRouteAlias(destination,control.attributes().get("target"),state);edge(state,EdgeType.NAVIGATES_TO,control.id(),destination,status,control.source());}
      }
    }
    edge(state,EdgeType.TRIGGERS,control.id(),endpoint,status,control.source());
    BehaviorType type="LINK".equals(control.attributes().get("kind"))?BehaviorType.NAVIGATE:BehaviorType.SUBMIT_FORM;
    String id=StableGraphIds.behavior(control.id(),"FORM".equals(control.attributes().get("kind"))?"submit":"click",type,control.target(),0);
    String detail=state.servletPattern==null?null:"servlet mapping 已證明："+state.servletPattern.servletClass()+" → "+state.servletPattern.pattern();
    state.behaviors.putIfAbsent(id,new Behavior(id,control.id(),"FORM".equals(control.attributes().get("kind"))?"submit":"click",type,endpoint,null,null,control.target(),evidence(control.source(),status,detail)));
  }
  private static String moduleTarget(Control control,State state) {
    String target=control.target();String explicitModule=control.attributes().get("module");
    if(explicitModule!=null&&!explicitModule.isBlank()&&target.startsWith("/")) {
      String module=explicitModule.endsWith("/")?explicitModule.substring(0,explicitModule.length()-1):explicitModule;
      if(!target.equals(module)&&!target.startsWith(module+"/"))target=module+target;
    }
    String query=target.contains("?")?target.substring(target.indexOf('?')+1):"";
    if(!query.isBlank()) {
      Map<String,String> values=new TreeMap<>();for(String pair:query.split("&")){String[] parts=pair.split("=",2);if(parts.length==2)values.put(parts[0],parts[1]);}
      String prefix=values.get("prefix"),page=values.get("page");if(prefix!=null&&page!=null)return(prefix.endsWith("/")?prefix.substring(0,prefix.length()-1):prefix)+(page.startsWith("/")?page:"/"+page);
    }
    return target;
  }
  private static String switchActionTarget(String target) {String query=target.contains("?")?target.substring(target.indexOf('?')+1):"";Map<String,String> values=new TreeMap<>();for(String pair:query.split("&")){String[] parts=pair.split("=",2);if(parts.length==2)values.put(parts[0],parts[1]);}String prefix=values.get("prefix"),page=values.get("page");return prefix==null||page==null?null:(prefix.endsWith("/")?prefix.substring(0,prefix.length()-1):prefix)+(page.startsWith("/")?page:"/"+page);}
  private static String unmappedLiteralEndpoint(String path,Control control,State state) {
    String id=StableGraphIds.endpoint("ANY",path);addNode(state,id,NodeType.ENDPOINT,"ANY "+path,Map.of("httpMethod","ANY","path",path,"category","ACTION","mappingStatus","UNRESOLVED"),control.source(),Confidence.UNRESOLVED);
    diagnostic(state,"公開網址無法依 web.xml 對應至 ActionServlet mapping："+path,control.source(),"STRUTS_SERVLET_MAPPING_UNRESOLVED");return id;
  }
  private static void unresolvedBehavior(Control control,State state) {
    String id=StableGraphIds.behavior(control.id(),"click",BehaviorType.UNKNOWN,control.target(),0);
    state.behaviors.putIfAbsent(id,new Behavior(id,control.id(),"click",BehaviorType.UNKNOWN,null,null,null,control.target(),evidence(control.source(),Confidence.UNRESOLVED,null)));
  }
  private static String requestParameter(Control control,List<Control> peers,String name) {
    if(control.target().contains("?")) for(String pair:control.target().substring(control.target().indexOf('?')+1).split("&")) {
      String[] values=pair.split("=",2);if(values.length==2&&values[0].equals(name)&&StrutsSources.literal(values[1])) return values[1];
    }
    if(name.equals(control.field())&&control.value()!=null) return control.value();
    Set<String> values=new TreeSet<>();
    for(Control peer:peers) if(Objects.equals(control.formGroup(),peer.formGroup())&&name.equals(peer.field())&&peer.value()!=null&&"html:hidden".equals(peer.attributes().get("tag"))) values.add(peer.value());
    return values.size()==1?values.iterator().next():null;
  }
  private static boolean validDispatchSignature(MethodDeclaration method) {
    if(!method.isPublic() || method.getParameters().size()!=4) return false;
    List<String> expected=List.of("ActionMapping","ActionForm","HttpServletRequest","HttpServletResponse");
    for(int i=0;i<4;i++) {
      String type=method.getParameter(i).getType().asString();
      if(!type.equals(expected.get(i)) && !type.endsWith("."+expected.get(i))) return false;
    }
    return method.getType().asString().equals("ActionForward") || method.getType().asString().endsWith(".ActionForward");
  }
  private static StrutsSources.JavaType typeWithMethod(String name,String method,State state,Set<String> seen) {
    if(!seen.add(name)) return null;
    var type=state.types.get(name);if(type==null) return null;
    var methods=type.declaration().getMethodsByName(method).stream().filter(m -> method.equals("getKeyMethodMap") || validDispatchSignature(m)).toList();
    if(methods.size()==1) return type;
    if(methods.size()>1) return null;
    String parent=type.parent();if(parent.isBlank()) return null;
    String qualified=parent.contains(".")?parent:(name.contains(".")?name.substring(0,name.lastIndexOf('.')+1):"")+parent;
    return typeWithMethod(qualified,method,state,seen);
  }
  private static String resolveMethod(Mapping mapping,String value,State state) {
    if(value==null||!StrutsSources.literal(value)) return null;
    if(!mapping.family().equals("LookupDispatchAction")) return value;
    var type=typeWithMethod(mapping.type(),"getKeyMethodMap",state,new HashSet<>());if(type==null) return null;
    Set<String> methods=new TreeSet<>();
    for(var declaration:type.declaration().getMethodsByName("getKeyMethodMap")) for(MethodCallExpr call:declaration.findAll(MethodCallExpr.class)) if(call.getNameAsString().equals("put")&&call.getArguments().size()==2&&call.getArgument(0).isStringLiteralExpr()&&call.getArgument(1).isStringLiteralExpr()) {
      String key=call.getArgument(0).asStringLiteralExpr().asString();
      if(!call.findAncestor(IfStmt.class).isPresent() && !call.findAncestor(SwitchStmt.class).isPresent() && state.messages.getOrDefault(key,Set.of()).size()==1 && state.messages.getOrDefault(key,Set.of()).contains(value)) methods.add(call.getArgument(1).asStringLiteralExpr().asString());
    }
    return methods.size()==1?methods.iterator().next():null;
  }
  private static ComponentKind kind(String name,MarkupTag tag) {
    return io.screentrace.parser.jsp.MarkupAnalysis.kind(name,tag.attributes());
  }
  private static void parseValidation(State state) {
    Map<String,Map<String,String>> definitions=new TreeMap<>();
    Map<String,Integer> occurrences=new TreeMap<>();
    for(Path file:state.inventory.files()) if(file.getFileName().toString().equals("validator-rules.xml")) try {
      String path=relative(state,file);for(Element rule:StrutsSources.elements(readXml(file,state),"validator")) {
        Map<String,String> attrs=new TreeMap<>(StrutsSources.attributes(rule));attrs.put("definitionSource",path+":"+StrutsSources.source(path,rule).line());
        definitions.put(rule.getAttribute("name"),attrs);
      }
    } catch(Exception error) {diagnostic(state,"validator-rules.xml 無法解析",new SourceLocation(relative(state,file),1),"VALIDATOR_RULES_UNRESOLVED");}
    for(Path file:state.inventory.files()) if(file.getFileName().toString().equals("validation.xml")) try {
      String path=relative(state,file);
      for(Element form:StrutsSources.elements(readXml(file,state),"form")) for(Element field:StrutsSources.elements(form,"field")) {
        String property=field.getAttribute("property");var source=StrutsSources.source(path,field);
        Map<String,String> parameters=new TreeMap<>();
        for(Element variable:StrutsSources.elements(field,"var")) {
          var name=StrutsSources.elements(variable,"var-name");var value=StrutsSources.elements(variable,"var-value");
          if(!name.isEmpty()&&!value.isEmpty()) parameters.put(name.get(0).getTextContent().trim(),value.get(0).getTextContent().trim());
        }
        for(String dependency:field.getAttribute("depends").split(",")) {
          String kind=dependency.trim();if(kind.isBlank()) continue;
          Map<String,String> attrs=new TreeMap<>(parameters);attrs.put("form",form.getAttribute("name"));
          attrs.putAll(definitions.getOrDefault(kind,Map.of()));String message=null;
          for(Element msg:StrutsSources.elements(field,"msg")) if(msg.getAttribute("name").equals(kind)) {
            String key=msg.getAttribute("key");attrs.put("messageKey",key);Set<String> messages=state.messages.getOrDefault(key,Set.of());
            if(messages.size()==1) message=messages.iterator().next();
          }
          ResolutionStatus status=definitions.containsKey(kind)&&StrutsSources.literal(property)?ResolutionStatus.CONFIRMED:ResolutionStatus.UNRESOLVED;
          var identity=new TreeMap<>(attrs);identity.remove("definitionSource");
          String stableKey=path+form.getAttribute("name")+property+kind+identity;
          int occurrence=occurrences.merge(stableKey,1,Integer::sum)-1;
          String id=StableGraphIds.validation(path,form.getAttribute("name")+":"+property,kind,identity.toString(),occurrence);
          state.rules.put(id,new ValidationRule(id,kind,List.of(property),message,ValidationLayer.SERVER,attrs,
              List.of(new AnalysisEvidence(source,PARSER,status,"STRUTS_VALIDATOR; depends="+kind))));
          if(status==ResolutionStatus.UNRESOLVED) diagnostic(state,"檢核規則未解析："+kind,source,"VALIDATION_RULE_UNRESOLVED");
        }
      }
    } catch(Exception error) {diagnostic(state,"validation.xml 無法解析："+error.getMessage(),new SourceLocation(relative(state,file),1),"VALIDATION_UNRESOLVED");}
  }
  private static void parseActionForms(State state) {
    for(var type:state.types.values()) {
      boolean form=type.parent().endsWith("ActionForm")||type.parent().endsWith("ValidatorForm")||state.nodes.values().stream().anyMatch(n->n.type()==NodeType.FORM_MODEL&&type.name().equals(n.attributes().get("class")));
      if(!form) continue;
      for(var method:type.declaration().getMethodsByName("validate")) for(MethodCallExpr call:method.findAll(MethodCallExpr.class)) {
        if(!call.getNameAsString().equals("add")||call.getArguments().size()<2||!call.getArgument(0).isStringLiteralExpr()) continue;
        String scope=call.getScope().map(Object::toString).orElse("");
        boolean errors=method.findAll(com.github.javaparser.ast.body.VariableDeclarator.class).stream().anyMatch(v -> v.getNameAsString().equals(scope) && v.getType().asString().endsWith("ActionErrors"))
            || method.getParameters().stream().anyMatch(p -> p.getNameAsString().equals(scope) && p.getType().asString().endsWith("ActionErrors"));
        if(!errors) continue;
        boolean conditional=call.findAncestor(IfStmt.class).isPresent()||call.findAncestor(SwitchStmt.class).isPresent()||call.findAncestor(ConditionalExpr.class).isPresent()||call.findAncestor(ForStmt.class).isPresent()||call.findAncestor(WhileStmt.class).isPresent()||call.findAncestor(ForEachStmt.class).isPresent()||call.findAncestor(DoStmt.class).isPresent()||call.findAncestor(LambdaExpr.class).isPresent()||call.findAncestor(TryStmt.class).isPresent();
        var source=new SourceLocation(type.source().file(),call.getBegin().map(p->p.line).orElse(1));
        if(conditional) {diagnostic(state,"ActionForm 檢核條件無法靜態確定："+call,source,"ACTION_FORM_CONDITION_UNRESOLVED");continue;}
        String field=call.getArgument(0).asStringLiteralExpr().asString();String key=null;
        if(call.getArgument(1).isObjectCreationExpr()) {
          var creation=call.getArgument(1).asObjectCreationExpr();
          if(!creation.getArguments().isEmpty()&&creation.getArgument(0).isStringLiteralExpr()) key=creation.getArgument(0).asStringLiteralExpr().asString();
        }
        Set<String> messages=key==null?Set.of():state.messages.getOrDefault(key,Set.of());String message=messages.size()==1?messages.iterator().next():null;
        String id=StableGraphIds.validation(type.source().file(),field,"custom",call.toString(),0);
        state.rules.putIfAbsent(id,new ValidationRule(id,"custom",List.of(field),message,ValidationLayer.SERVER,key==null?Map.of():Map.of("messageKey",key),List.of(new AnalysisEvidence(source,PARSER,ResolutionStatus.INFERRED,"ACTION_FORM; "+call))));
      }
    }
  }
  private static void readMessages(State state) {
    Set<String> bundles=new TreeSet<>();
    for(Path config:state.inventory.strutsConfigFiles()) try {
      for(Element resource:StrutsSources.elements(readXml(config,state),"message-resources")) bundles.add(resource.getAttribute("parameter").replace('.', '/'));
    } catch(Exception error) {diagnostic(state,"訊息資源設定未解析",new SourceLocation(relative(state,config),1),"MESSAGE_RESOURCE_UNRESOLVED");}
    for(Path file:state.inventory.files()) if(file.toString().endsWith(".properties") && bundles.stream().anyMatch(bundle -> relative(state,file).endsWith(bundle+".properties") || relative(state,file).contains(bundle+"_"))) try {
      Properties properties=new Properties();properties.load(new StringReader(SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES)));
      for(String key:properties.stringPropertyNames()) state.messages.computeIfAbsent(key,k->new TreeSet<>()).add(properties.getProperty(key));
    } catch(Exception error) {diagnostic(state,"訊息資源無法讀取",new SourceLocation(relative(state,file),1),"MESSAGE_RESOURCE_UNRESOLVED");}
  }
  private static void readTiles(State state) {
    Map<String,Tile> tiles=new TreeMap<>();
    for(Path file:state.inventory.tilesConfigFiles()) try {
      String path=relative(state,file);for(Element definition:StrutsSources.elements(readXml(file,state),"definition")) {
        String name=definition.getAttribute("name"),template=definition.hasAttribute("template")?definition.getAttribute("template"):definition.getAttribute("path");
        Map<String,String> puts=new TreeMap<>();
        for(String tag:List.of("put","put-attribute")) for(Element item:StrutsSources.elements(definition,tag)) puts.put(item.getAttribute("name"),item.getAttribute("value"));
        if(tiles.containsKey(name)) {diagnostic(state,"Tiles 定義重複："+name,StrutsSources.source(path,definition),"TILES_AMBIGUOUS");tiles.remove(name);state.ambiguousTiles.add(name);continue;}
        if(!state.ambiguousTiles.contains(name)) tiles.put(name,new Tile(name,template,definition.getAttribute("extends"),puts,StrutsSources.source(path,definition)));
      }
    } catch(Exception error) {diagnostic(state,"Tiles 設定無法解析",new SourceLocation(relative(state,file),1),"TILES_UNRESOLVED");}
    Map<String,Tile> resolved=new TreeMap<>();
    for(String name:tiles.keySet()) resolveTile(name,tiles,resolved,new HashSet<>(),state);
    state.tiles.putAll(resolved);
    Set<String> tileJspPaths=new TreeSet<>();
    for(Path file:state.inventory.files()) if(file.toString().endsWith(".jsp")) try {
      String text=SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
      boolean tilesTagLibrary=text.contains("struts.apache.org/tags-tiles");
      if(tilesTagLibrary&&MarkupTag.scan(text).stream().anyMatch(tag->!tag.closing()&&tag.name().endsWith(":insert")))tileJspPaths.add(relative(state,file));
    } catch(Exception ignored) { }
    for(Tile tile:resolved.values()) {
      String viewId=ApplicationGraph.id(NodeType.VIEW,"tiles:"+tile.name());state.tileViewIds.put(tile.name(),viewId);
      Confidence status=state.viewIds.containsKey(tile.template())?Confidence.CONFIRMED:Confidence.UNRESOLVED;
      addNode(state,viewId,NodeType.VIEW,tile.name(),Map.of("view",tile.template()),tile.source(),status);
      if(tile.template().endsWith(".jsp"))tileJspPaths.add(tile.template());
      for(String target:tile.puts().values())if(target.endsWith(".jsp"))tileJspPaths.add(target);
    }
    for(Tile tile:resolved.values()) {
      String viewId=state.tileViewIds.get(tile.name());
      List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
      for(String target:targets) {
        String referenced=state.viewIds.get(target);if(referenced==null)referenced=state.tileViewIds.get(target);
        if(referenced!=null)edge(state,EdgeType.INCLUDES,viewId,referenced,Confidence.CONFIRMED,tile.source());
        else if(target.endsWith(".jsp")||target.startsWith("/"))diagnostic(state,"Tiles 屬性目標未解析："+target,tile.source(),"TILES_REFERENCE_UNRESOLVED");
      }
    }
    for(String path:tileJspPaths)removeImplicitScreen(path,state);
  }

  private static void removeImplicitScreen(String path,State state) {
    String id=state.screens.get(path);
    if(id==null){String viewId=state.viewIds.get(path);if(viewId==null){List<String> candidates=state.viewIds.values().stream().distinct().filter(candidate->{GraphNode view=state.nodes.get(candidate);String actual=view==null?null:view.attributes().get("view");return actual!=null&&actual.endsWith(path.startsWith("/")?path:"/"+path);}).toList();if(candidates.size()==1)viewId=candidates.get(0);}GraphNode view=viewId==null?null:state.nodes.get(viewId);String actualPath=view==null?null:view.attributes().get("view");if(actualPath!=null)id=state.screens.get(actualPath);}
    if(id==null)return;String screenId=id;
    state.nodes.remove(screenId);state.edges.entrySet().removeIf(entry->entry.getValue().from().equals(screenId)||entry.getValue().to().equals(screenId));
    state.screens.entrySet().removeIf(entry->entry.getValue().equals(screenId));
  }

  private static void pruneUnroutedTilesScreens(State state) {
    if(state.tiles.isEmpty())return;
    Set<String> destinations=state.edges.values().stream()
        .filter(edge->Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO,EdgeType.NAVIGATES_TO).contains(edge.type()))
        .map(Relationship::to).collect(java.util.stream.Collectors.toSet());
    Set<String> remove=state.nodes.values().stream()
        .filter(node->node.type()==NodeType.SCREEN&&!"true".equals(node.attributes().get("tilesDefinition"))&&!destinations.contains(node.id()))
        .map(GraphNode::id).collect(java.util.stream.Collectors.toSet());
    if(remove.isEmpty())return;
    remove.forEach(state.nodes::remove);
    state.edges.entrySet().removeIf(entry->remove.contains(entry.getValue().from())||remove.contains(entry.getValue().to()));
    state.screens.entrySet().removeIf(entry->remove.contains(entry.getValue()));
  }

  private static String ensureTileScreen(String name,State state) {
    String existing=state.screens.get(name);if(existing!=null)return existing;
    Tile tile=state.tiles.get(name);if(tile==null)return null;
    String screen=ApplicationGraph.id(NodeType.SCREEN,"tiles:"+tile.name()),viewId=state.tileViewIds.get(tile.name());
    Confidence status=state.viewIds.containsKey(tile.template())?Confidence.CONFIRMED:Confidence.UNRESOLVED;
    addNode(state,screen,NodeType.SCREEN,tile.name(),Map.of("view",tile.template(),"tilesDefinition","true"),tile.source(),status);state.screens.put(name,screen);
    List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
    for(String target:targets) {
      String view=state.viewIds.get(target);if(view==null)view=state.tileViewIds.get(target);
      if(view!=null)edge(state,EdgeType.INCLUDES,screen,view,Confidence.CONFIRMED,tile.source());
      else if(target.endsWith(".jsp")||target.startsWith("/"))diagnostic(state,"Tiles 屬性目標未解析："+target,tile.source(),"TILES_REFERENCE_UNRESOLVED");
      if(target.endsWith(".jsp")) {
        state.tileFragmentOwners.computeIfAbsent(target,key->new TreeSet<>()).add(screen);
        String targetView=state.viewIds.get(target);if(targetView==null){List<String> matches=state.viewIds.values().stream().distinct().filter(candidate->{GraphNode candidateView=state.nodes.get(candidate);String actual=candidateView==null?null:candidateView.attributes().get("view");return actual!=null&&actual.endsWith(target.startsWith("/")?target:"/"+target);}).toList();if(matches.size()==1)targetView=matches.get(0);}GraphNode targetViewNode=targetView==null?null:state.nodes.get(targetView);
        if(targetViewNode!=null){String sourcePath=targetViewNode.attributes().get("view");if(sourcePath!=null)state.tileFragmentOwners.computeIfAbsent(sourcePath,key->new TreeSet<>()).add(screen);}
      }
    }
    return screen;
  }
  private static Tile resolveTile(String name,Map<String,Tile> definitions,Map<String,Tile> resolved,Set<String> stack,State state) {
    if(resolved.containsKey(name)) return resolved.get(name);
    Tile tile=definitions.get(name);if(tile==null) return null;
    if(!stack.add(name)) {diagnostic(state,"Tiles extends 循環："+name,tile.source(),"TILES_CYCLE");return null;}
    Map<String,String> puts=new TreeMap<>();String template=tile.template();
    if(!tile.parent().isBlank()) {
      Tile parent=resolveTile(tile.parent(),definitions,resolved,stack,state);
      if(parent==null) {diagnostic(state,"Tiles parent 未解析："+tile.parent(),tile.source(),"TILES_PARENT_UNRESOLVED");stack.remove(name);return null;}
      puts.putAll(parent.puts());if(template.isBlank()) template=parent.template();
    }
    puts.putAll(tile.puts());Tile result=new Tile(name,template,tile.parent(),puts,tile.source());resolved.put(name,result);stack.remove(name);return result;
  }
  private static Map<String,String> identityAttributes(MarkupTag tag,String name) {var attrs=new TreeMap<>(tag.attributes());attrs.put("tag",name);return attrs;}
  private static String first(MarkupTag tag,String... names) {for(String name:names) if(tag.attribute(name)!=null) return tag.attribute(name);return null;}
  private static void indexView(Map<String,String> index,String path,String id) {index.put(path,id);int marker=path.indexOf("/WEB-INF/");if(marker>=0) index.put(path.substring(marker),id);}
  private static List<String> endpointPaths(String path) {return path.endsWith(".do")?List.of(path):List.of(path,path+".do");}
  private static String relative(State state,Path file) {return StrutsSources.relative(state.inventory.root(),file);}
  private static Document readXml(Path file,State state) throws Exception {return StrutsSources.xml(SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_XML_FILE_BYTES));}
  private static List<AnalysisEvidence> evidence(SourceLocation source,Confidence confidence,String detail) {return List.of(new AnalysisEvidence(source,PARSER,confidence.resolutionStatus(),detail));}
  private static void addNode(State state,String id,NodeType type,String name,Map<String,String> attrs,SourceLocation source,Confidence status) {addNode(state,id,type,name,attrs,source,status,null);}
  private static void addNode(State state,String id,NodeType type,String name,Map<String,String> attrs,SourceLocation source,Confidence status,String detail) {
    List<AnalysisEvidence> proof=new ArrayList<>(evidence(source,status,null));if(detail!=null)proof.addAll(evidence(source,status,detail));
    GraphNode node=new GraphNode(id,type,name,attrs,source,status,proof);
    state.nodes.merge(id,node,(a,b)->{
      List<AnalysisEvidence> evidence=new ArrayList<>(a.evidence());if(!evidence.containsAll(b.evidence())) evidence.addAll(b.evidence());
      return new GraphNode(a.id(),a.type(),a.name(),a.attributes(),a.source(),a.confidence()==b.confidence()?a.confidence():Confidence.AMBIGUOUS,evidence);
    });
  }
  private static void edge(State state,EdgeType type,String from,String to,Confidence status,SourceLocation source) {edge(state,type,from,to,status,source,null);}
  private static void edge(State state,EdgeType type,String from,String to,Confidence status,SourceLocation source,String detail) {
    String id=ApplicationGraph.id(NodeType.COMPONENT,type+":"+from+":"+to);
    state.edges.putIfAbsent(id,new Relationship(id,type,from,to,status,source,evidence(source,status,detail)));
  }
  private static void diagnostic(State state,String message,SourceLocation source,String code) {state.diagnostics.add(new Diagnostic(message,Confidence.UNRESOLVED,source,code,evidence(source,Confidence.UNRESOLVED,null)));}
  private record Mapping(String route,String type,String handlerId,String formId,String parameter,String family,Map<String,String> forwards,Map<String,String> localForwards,Map<String,SourceLocation> forwardSources,String input,String module,SourceLocation source) { }
  private record PendingForward(String ownerId,String module,String target,SourceLocation source) { }
  private record ServletPattern(String pattern,SourceLocation source,String servletClass) { }
  private record Control(String id,String label,Map<String,String> attributes,String target,SourceLocation source,String field,String value,String formGroup) { }
  private record Tile(String name,String template,String parent,Map<String,String> puts,SourceLocation source) { }
  private static final class State {
    final ProjectInventory inventory;
    final Map<String,GraphNode> nodes=new TreeMap<>();final Map<String,Relationship> edges=new TreeMap<>();final List<Diagnostic> diagnostics=new ArrayList<>();
    final Map<String,Behavior> behaviors=new TreeMap<>();final Map<String,ValidationRule> rules=new TreeMap<>();
    final Map<String,String> screens=new TreeMap<>(),viewIds=new TreeMap<>(),tileViewIds=new TreeMap<>(),beans=new TreeMap<>(),forms=new TreeMap<>();
    final Set<String> ambiguousTiles=new TreeSet<>();
    final Map<String,Tile> tiles=new TreeMap<>();final Map<String,Set<String>> tileFragmentOwners=new TreeMap<>();
    final Map<String,List<Mapping>> routes=new TreeMap<>();final Map<String,String> endpointIds=new TreeMap<>(),globalForwards=new TreeMap<>();final Map<String,Boolean> inputForward=new TreeMap<>();final List<Mapping> actionMappings=new ArrayList<>();final List<PendingForward> pendingForwards=new ArrayList<>();ServletPattern servletPattern;
    final Map<String,StrutsSources.JavaType> types=new TreeMap<>();final Map<String,Set<String>> messages=new TreeMap<>();
    State(ProjectInventory inventory) {this.inventory=new ProjectInventory(inventory.root(),inventory.files().stream().sorted().toList(),inventory.technologies().stream().sorted().toList(),inventory.diagnostics().stream().sorted().toList(),inventory.contextPaths(),inventory.contextSettingsFile(),inventory.contextSettingsLine());}
    ApplicationGraph graph() {return new ApplicationGraph(new Application(inventory.root().getFileName().toString(),inventory.root().toString(),inventory.technologies()),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,List.of(),ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,List.copyOf(behaviors.values()),List.copyOf(rules.values()));}
  }
}
