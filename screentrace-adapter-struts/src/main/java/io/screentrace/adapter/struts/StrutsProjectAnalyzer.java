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
    suppressActionIncludeDiagnostics(jsp,state);
    readWelcomeFiles(state);
    materializeTileScreens(state);
    addInteractions(jsp,state);
    inheritActionCallers(state);
    markInheritedActionTemplates(state);
    parseValidation(state);
    parseActionForms(state);
    ApplicationGraph enriched=GraphIntegrityValidator.requireAnalysis(io.screentrace.parser.jsp.UrlGraphContribution.enrich(JavaScriptGraphContribution.enrich(MarkupGraphContribution.enrich(ActionContracts.enrich(state.graph(),inventory),jsp),inventory),inventory));
    enriched=linkValidatorFields(enriched,state);
    return retainActionAndInlineEventEvidence(enriched,state);
  }
  private static ApplicationGraph retainActionAndInlineEventEvidence(ApplicationGraph graph,State state) {
    Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(node->nodes.put(node.id(),node));
    Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(behavior->behaviors.put(behavior.id(),behavior));
    for(Mapping mapping:state.actionMappings) {
      String publicRoute=publicPath(mapping.route(),mapping.module(),state);
      for(var entry:new ArrayList<>(behaviors.entrySet())) {
        Behavior behavior=entry.getValue();GraphNode target=behavior.targetId()==null?null:nodes.get(behavior.targetId());
        if(behavior.type()!=BehaviorType.SUBMIT_FORM||target==null||!publicRoute.equals(target.attributes().get("path")))continue;
        List<AnalysisEvidence> proof=new ArrayList<>(behavior.evidence());proof.add(new AnalysisEvidence(mapping.source(),PARSER,ResolutionStatus.CONFIRMED,"Struts action mapping="+mapping.route()));
        behaviors.put(entry.getKey(),new Behavior(behavior.id(),behavior.triggerId(),behavior.event(),behavior.type(),behavior.targetId(),behavior.guard(),behavior.parentId(),behavior.expression(),proof.stream().distinct().toList()));
      }
    }
    for(GraphNode component:nodes.values()) {
      String expression=component.attributes().get("event.click");if(component.type()!=NodeType.COMPONENT||expression==null||!expression.matches("[A-Za-z_$][A-Za-z0-9_$]*\\s*\\(.*\\)"))continue;
      String id=StableGraphIds.behavior(component.id(),"click",BehaviorType.UNKNOWN,expression,0);if(behaviors.containsKey(id))continue;
      SourceLocation source=new SourceLocation(component.source().file(),Integer.parseInt(component.attributes().getOrDefault("eventLine.click",Integer.toString(component.source().line()))));
      behaviors.put(id,new Behavior(id,component.id(),"click",BehaviorType.UNKNOWN,null,null,null,expression,evidence(source,Confidence.UNRESOLVED,"保留原始事件；靜態追蹤結果不代表完整執行結果")));
    }
    return new ApplicationGraph(graph.application(),graph.nodes(),graph.relationships(),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),List.copyOf(behaviors.values()),graph.validationRules());
  }
  private static void addView(JspAnalysis.View view,State state) {
    String viewId=ApplicationGraph.id(NodeType.VIEW,view.path());
    addNode(state,viewId,NodeType.VIEW,view.path(),Map.of("view",view.path()),view.source(),Confidence.CONFIRMED);
    indexView(state.viewIds,view.path(),viewId);
    if(view.kind()==JspAnalysis.ViewKind.JSP) {
      String id=StableGraphIds.screen(view.path());
      addNode(state,id,NodeType.SCREEN,Path.of(view.path()).getFileName().toString().replaceFirst("\\.jsp$",""),Map.of("view",view.path()),view.source(),Confidence.CONFIRMED);
      indexView(state.screens,view.path(),id);
    } else if(view.kind()==JspAnalysis.ViewKind.HTML&&view.path().replace('\\','/').startsWith("src/main/webapp/")) {
      String id=StableGraphIds.screen(view.path());String publicUrl="/"+view.path().substring("src/main/webapp/".length());
      Map<String,String> attributes=new TreeMap<>();attributes.put("view",view.path());attributes.put("route",publicUrl);
      addNode(state,id,NodeType.SCREEN,Path.of(view.path()).getFileName().toString().replaceFirst("\\.(html|htm)$",""),attributes,view.source(),Confidence.CONFIRMED);
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
        PendingForward target=new PendingForward(id,module,exception.getAttribute("path"),source);
        state.pendingForwards.add(target);
        state.exceptionForwards.add(target);
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
        ServletMappingResolution servletMapping=state.servletMappings.get(module);
        if(servletMapping!=null&&servletMapping.status()==ServletMappingStatus.PROVEN) {
          List<String> publicPaths=servletMapping.patterns().stream().map(servletPattern->publicPath(route,servletPattern)).distinct().toList();
          String primaryPath=publicPaths.get(0),endpointId=StableGraphIds.endpoint("ANY",route);
          List<String> aliases=new ArrayList<>();aliases.add(route);aliases.addAll(publicPaths);
          for(String alias:aliases) {
            List<Mapping> routeMappings=state.routes.computeIfAbsent(alias,key->new ArrayList<>());routeMappings.add(mapping);state.endpointIds.put(alias,endpointId);
            if(routeMappings.size()>1) diagnostic(state,"路由重複，保留所有處理器候選："+alias,source,"DUPLICATE_ROUTE");
          }
          Map<String,String> endpointAttrs=new TreeMap<>();endpointAttrs.put("httpMethod","ANY");endpointAttrs.put("path",primaryPath);endpointAttrs.put("category","ACTION");endpointAttrs.put("servletMappingStatus","PROVEN");
          if(!primaryPath.equals(route)){endpointAttrs.put("logicalPath",route);endpointAttrs.put("aliases",String.join(",",aliases.stream().filter(alias->!alias.equals(primaryPath)).toList()));}
          String proof=mappingProof(servletMapping);
          addNode(state,endpointId,NodeType.ENDPOINT,"ANY "+primaryPath,endpointAttrs,source,Confidence.CONFIRMED,proof);
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
        for(var entry:forwardSources.entrySet())if(!hasWildcardSubstitution(route,forwards.get(entry.getKey())))state.pendingForwards.add(new PendingForward(handlerId,module,forwards.get(entry.getKey()),entry.getValue()));
        if(!input.isBlank()&&!hasWildcardSubstitution(route,input))state.pendingForwards.add(new PendingForward(handlerId,module,input,source));
      }
    } catch(Exception error) {diagnostic(state,"Struts 設定無法解析："+error.getMessage(),new SourceLocation(path,1),"STRUTS_CONFIG_UNRESOLVED");}
  }
  private static String moduleFor(String path,State state) {
    List<String> modules=new ArrayList<>();
    for(Path file:state.inventory.files()) if(file.getFileName().toString().equals("web.xml")) try {
      for(Element parameter:StrutsSources.elements(readXml(file,state),"init-param")) {
        var names=StrutsSources.elements(parameter,"param-name");var values=StrutsSources.elements(parameter,"param-value");
        if(names.isEmpty()||values.isEmpty()) continue;
        String name=names.get(0).getTextContent().trim();if(!name.startsWith("config/")) continue;
        String module="/"+name.substring("config/".length());modules.add(module);
        for(String value:values.get(0).getTextContent().split(",")) if(path.endsWith(value.trim())) return module;
      }
    } catch(Exception error) {diagnostic(state,"web.xml 模組設定無法解析",new SourceLocation(relative(state,file),1),"MODULE_CONFIG_UNRESOLVED");}
    String clean=path.replace('\\','/');
    return modules.stream().filter(module->clean.contains(module+"/")).max(Comparator.comparingInt(String::length)).orElse("");
  }

  private static void readServletMapping(State state) {
    List<Path> webXmls=state.inventory.files().stream().filter(file->file.getFileName().toString().equals("web.xml")).sorted().toList();
    Document document=null;String webPath=".";List<ServletDefinition> actionServlets=new ArrayList<>();List<ServletPattern> patterns=new ArrayList<>();
    if(!webXmls.isEmpty())try {
      Path file=webXmls.get(0);webPath=relative(state,file);document=readXml(file,state);
      for(Element servlet:StrutsSources.elements(document,"servlet")) {
        List<Element> names=StrutsSources.elements(servlet,"servlet-name"),classes=StrutsSources.elements(servlet,"servlet-class");if(names.isEmpty()||classes.isEmpty())continue;
        String name=names.get(0).getTextContent().trim(),type=classes.get(0).getTextContent().trim();if(!isActionServlet(type,state,new HashSet<>()))continue;
        Map<String,List<String>> configs=new TreeMap<>();for(Element param:StrutsSources.elements(servlet,"init-param")) {
          List<Element> keys=StrutsSources.elements(param,"param-name"),values=StrutsSources.elements(param,"param-value");if(keys.isEmpty()||values.isEmpty())continue;
          String key=keys.get(0).getTextContent().trim();if(key.equals("config")||key.startsWith("config/"))configs.computeIfAbsent(key,value->new ArrayList<>()).addAll(Arrays.stream(values.get(0).getTextContent().split(",")).map(String::trim).filter(value->!value.isBlank()).toList());
        }
        actionServlets.add(new ServletDefinition(name,type,StrutsSources.source(webPath,servlet),configs));
      }
      for(Element mapping:StrutsSources.elements(document,"servlet-mapping")) {
        List<Element> names=StrutsSources.elements(mapping,"servlet-name");if(names.isEmpty())continue;String servletName=names.get(0).getTextContent().trim();
        ServletDefinition servlet=actionServlets.stream().filter(candidate->candidate.name().equals(servletName)).findFirst().orElse(null);if(servlet==null)continue;
        for(Element pattern:StrutsSources.elements(mapping,"url-pattern")) {
          String value=pattern.getTextContent().trim();if(value.startsWith("*.")&&value.length()>2||value.startsWith("/")&&value.endsWith("/*"))patterns.add(new ServletPattern(value,StrutsSources.source(webPath,pattern),servlet.name(),servlet.servletClass()));
        }
      }
    } catch(Exception error) {diagnostic(state,"ActionServlet 的 web.xml 設定無法解析",new SourceLocation(webPath,1),"STRUTS_SERVLET_MAPPING_UNRESOLVED");}

    Map<String,ServletMappingResolution> resolutions=new TreeMap<>();
    for(Path config:state.inventory.strutsConfigFiles()) {
      String module=moduleFor(relative(state,config),state);if(resolutions.containsKey(module))continue;
      SourceLocation diagnosticSource=webXmls.isEmpty()?new SourceLocation(".",1):new SourceLocation(webPath,1);
      List<ServletDefinition> candidates;
      if(actionServlets.size()==1)candidates=List.of(actionServlets.get(0));
      else candidates=actionServlets.stream().filter(servlet->configuresModule(servlet,module,relative(state,config))).toList();
      if(candidates.size()>1||actionServlets.size()>1&&candidates.isEmpty()) {
        List<ServletDefinition> listed=candidates.isEmpty()?actionServlets:candidates;
        String names=listed.stream().map(servlet->servlet.name()+"（"+servlet.source().file()+":"+servlet.source().line()+"）").toList().toString();
        diagnostic(state,"無法判定 module "+(module.isBlank()?"/":module)+" 由哪個 ActionServlet 處理；候選："+names,diagnosticSource,"STRUTS_SERVLET_MAPPING_AMBIGUOUS");
        resolutions.put(module,new ServletMappingResolution(ServletMappingStatus.AMBIGUOUS,List.of(),names));continue;
      }
      if(candidates.size()!=1) {
        diagnostic(state,"找不到可證明的 ActionServlet 宣告與 servlet mapping；servlet mapping 未證明",diagnosticSource,"STRUTS_SERVLET_MAPPING_UNRESOLVED");
        resolutions.put(module,new ServletMappingResolution(ServletMappingStatus.UNRESOLVED,List.of(),"未證明"));continue;
      }
      ServletDefinition servlet=candidates.get(0);List<ServletPattern> ownedPatterns=patterns.stream().filter(pattern->pattern.servletName().equals(servlet.name())).distinct().toList();
      if(ownedPatterns.isEmpty()) {
        diagnostic(state,"ActionServlet "+servlet.name()+" 沒有 servlet-mapping；servlet mapping 未證明",servlet.source(),"STRUTS_SERVLET_MAPPING_UNRESOLVED");
        resolutions.put(module,new ServletMappingResolution(ServletMappingStatus.UNRESOLVED,List.of(),servlet.name()));continue;
      }
      resolutions.put(module,new ServletMappingResolution(ServletMappingStatus.PROVEN,ownedPatterns,servlet.name()));
    }
    state.servletMappings.putAll(resolutions);
  }

  private static boolean configuresModule(ServletDefinition servlet,String module,String configPath) {
    for(var entry:servlet.configs().entrySet()) {
      String configuredModule=entry.getKey().equals("config")?"":"/"+entry.getKey().substring("config/".length());
      if(!configuredModule.equals(module))continue;
      for(String value:entry.getValue())if(sameConfigPath(value,configPath))return true;
    }
    return false;
  }

  private static boolean sameConfigPath(String configured,String path) {
    String left=configured.replace('\\','/'),right=path.replace('\\','/');
    return left.equals(right)||right.endsWith(left.startsWith("/")?left:"/"+left);
  }

  private static String mappingProof(ServletMappingResolution resolution) {
    return "servlet mapping 已證明："+resolution.patterns().get(0).servletClass()+" → "+String.join(", ",resolution.patterns().stream().map(ServletPattern::pattern).toList());
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

  private static String publicPath(String route,String module,State state) {
    ServletMappingResolution mapping=state.servletMappings.get(module);
    return mapping==null||mapping.status()!=ServletMappingStatus.PROVEN?route:publicPath(route,mapping.patterns().get(0));
  }

  private static String publicPath(String route,ServletPattern servletPattern) {
    String pattern=servletPattern.pattern();
    if(pattern.startsWith("*.")) {String suffix=pattern.substring(1);return route.endsWith(suffix)?route:route+suffix;}
    String prefix=pattern.substring(0,pattern.length()-1);
    return route.startsWith(prefix)?route:prefix+(route.startsWith("/")?route.substring(1):route);
  }

  private static String logicalPath(String path,String module,State state) {
    if(state.endpointIds.containsKey(path))return state.routes.containsKey(path)?state.routes.get(path).get(0).route():path;
    ServletMappingResolution mapping=state.servletMappings.get(module);if(mapping==null||mapping.status()!=ServletMappingStatus.PROVEN)return null;
    List<String> candidates=new ArrayList<>();for(ServletPattern servletPattern:mapping.patterns()) {
      String pattern=servletPattern.pattern();
      if(pattern.startsWith("*.")) {String suffix=pattern.substring(1);if(path.endsWith(suffix))candidates.add(path.substring(0,path.length()-suffix.length()));}
      else {String prefix=pattern.substring(0,pattern.length()-1);if(path.startsWith(prefix))candidates.add("/"+path.substring(prefix.length()));}
    }
    List<String> unique=candidates.stream().distinct().toList();return unique.size()==1?unique.get(0):null;
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
          String normalized=logicalPath(value,"",state);List<Mapping> routes=normalized==null?List.of():state.routes.getOrDefault(normalized,List.of());
          if(routes.size()!=1){diagnostic(state,"welcome-file action 路由無法唯一解析："+value,source,"STRUTS_WELCOME_FILE_UNRESOLVED");continue;}
          List<String> targetScreens=resolveMappingScreens(routes.get(0),state,new LinkedHashSet<>(),0,source);
          if(targetScreens.size()!=1){diagnostic(state,"welcome-file action 目的畫面無法唯一解析："+value,source,"STRUTS_WELCOME_FILE_UNRESOLVED");continue;}
          screenId=targetScreens.get(0);route=publicPath(normalized,routes.get(0).module(),state);
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

  private static StrutsVersionEvidence detectStrutsVersion(ProjectInventory inventory) {
    Map<String,SourceLocation> versions=new TreeMap<>();
    for(Path file:inventory.files())try {
      String relative=StrutsSources.relative(inventory.root(),file),name=file.getFileName().toString();
      if(name.equals("pom.xml")) {
        Document pom=StrutsSources.xml(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_XML_FILE_BYTES));
        for(Element parent:StrutsSources.elements(pom,"parent")) addMavenStrutsVersion(parent,relative,versions);
        for(Element dependency:StrutsSources.elements(pom,"dependency")) addMavenStrutsVersion(dependency,relative,versions);
      } else if(name.equals("build.xml")||name.equals("build.properties")) {
        String text=SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);String[] lines=text.split("\\R",-1);
        for(int line=0;line<lines.length;line++) {
          String value=lines[line];if(!value.toLowerCase(Locale.ROOT).contains("struts"))continue;
          var matcher=java.util.regex.Pattern.compile("(?i)struts[.\\-_a-z0-9\\\"'= ]*?(?:value[=\\\"' ]*)?(1\\.\\d+\\.\\d+)").matcher(value);
          if(matcher.find())versions.putIfAbsent(matcher.group(1),new SourceLocation(relative,line+1));
        }
      }
      var library=java.util.regex.Pattern.compile("(?i).*struts-[a-z-]*?(\\d+\\.\\d+\\.\\d+).*\\.jar").matcher(name);
      if(library.matches())versions.putIfAbsent(library.group(1),new SourceLocation(relative,1));
    } catch(Exception ignored) { }
    if(versions.size()!=1)return new StrutsVersionEvidence(null,null,versions.isEmpty()?"未找到可證明的 Struts 版本": "版本證據互相衝突："+versions.entrySet().stream().map(entry->entry.getKey()+"（"+entry.getValue().file()+":"+entry.getValue().line()+"）").toList());
    var entry=versions.entrySet().iterator().next();return new StrutsVersionEvidence(entry.getKey(),entry.getValue(),entry.getKey()+"（"+entry.getValue().file()+":"+entry.getValue().line()+"）");
  }
  private static void addMavenStrutsVersion(Element declaration,String file,Map<String,SourceLocation> versions) {
    String group=directText(declaration,"groupId"),artifact=directText(declaration,"artifactId"),version=directText(declaration,"version");
    if(("org.apache.struts".equals(group)||artifact.startsWith("struts-"))&&version.matches("\\d+\\.\\d+\\.\\d+"))versions.putIfAbsent(version,new SourceLocation(file,sourceLine(declaration)));
  }
  private static String directText(Element parent,String name) {
    for(Node child=parent.getFirstChild();child!=null;child=child.getNextSibling())if(child instanceof Element element&&name.equals(element.getTagName()))return element.getTextContent().trim();return "";
  }
  private static int sourceLine(Element element) {Object line=element.getUserData("line");return line instanceof Integer value?value:1;}
  private static String dispatchFamily(String type,State state,Set<String> seen) {
    String shortName=type.substring(type.lastIndexOf('.')+1);
    if(Set.of("DispatchAction","LookupDispatchAction","MappingDispatchAction","EventDispatchAction").contains(shortName)) return shortName;
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
        else {state.actionForwardTargets.computeIfAbsent(mapping.handlerId(),ignored->new ArrayList<>()).add(new PendingForward(mapping.handlerId(),mapping.module(),target,source));forward(target,mapping.handlerId(),mapping.module(),source,state);}
      } else diagnostic(state,"forward 運算式無法靜態解析："+call.getArgument(0),source,"STRUTS_FORWARD_EXPRESSION");
    }
  }
  private static void forward(String target,String owner,String module,SourceLocation source,State state) {
    if(target==null||target.isBlank())return;
    if(!StrutsSources.literal(target)){diagnostic(state,"forward 無法靜態解析："+target,source,"STRUTS_FORWARD_UNRESOLVED");return;}
    List<String> screens=resolveForwardScreens(target,module,state,new LinkedHashSet<>(),0,source);
    if(screens.isEmpty()){diagnostic(state,"forward 無法對應 JSP / Tiles 畫面："+target,source,"STRUTS_FORWARD_UNRESOLVED");return;}
    for(String screen:screens){edge(state,EdgeType.FORWARDS_TO,owner,screen,Confidence.CONFIRMED,source);String view=state.nodes.get(screen)==null?null:state.nodes.get(screen).attributes().get("view");if(view!=null&&!module.isBlank())state.jspModuleOwners.computeIfAbsent(view,key->new TreeSet<>()).add(module);}
  }
  private static List<String> resolveForwardScreens(String target,String module,State state,Set<String> visited,int depth,SourceLocation source) {
    if(depth>=5){diagnostic(state,"forward 鏈超過 5 層",source,"STRUTS_FORWARD_DEPTH");return List.of();}
    String named=state.globalForwards.get(module+":"+target);if(named!=null&&!named.equals(target))return resolveForwardScreens(named,module,state,visited,depth+1,source);
    if(state.tiles.containsKey(target)){
      if(state.tilePageDefinitions.contains(target)||state.tileStandaloneDefinitions.contains(target)){String screen=ensureTileScreen(target,state);return screen==null?List.of():List.of(screen);}
      Set<String> owners=state.tilePageOwners.entrySet().stream().filter(entry->entry.getValue().contains(target)).map(Map.Entry::getKey).collect(java.util.stream.Collectors.toCollection(TreeSet::new));
      if(owners.size()==1){String screen=ensureTileScreen(owners.iterator().next(),state);return screen==null?List.of():List.of(screen);}
      if(owners.size()>1){diagnostic(state,"forward 目標對應多個 Tiles 頁面定義："+target,source,"STRUTS_FORWARD_AMBIGUOUS");return List.of();}
      String screen=ensureTileScreen(target,state);return screen==null?List.of():List.of(screen);
    }
    String direct=screenForView(target,state,source);if(direct!=null)return List.of(direct);
    String logical=logicalPath(target,module,state);if(logical==null&&target.startsWith("/")&&!target.startsWith("/WEB-INF/")&&!target.contains(".jsp"))logical=module.isBlank()||target.startsWith(module+"/")?target:module+target;
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
    List<String> screens=result.stream().distinct().sorted().toList();String alias=publicPath(mapping.route(),mapping.module(),state);
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
    Map<String,List<Control>> byView=new TreeMap<>();Map<String,List<ScreenLoadCall>> loadCallsByView=new TreeMap<>();
    for(Path file:state.inventory.files()) if(file.toString().endsWith(".jsp")||file.toString().endsWith(".jspf")||file.toString().endsWith(".html")||file.toString().endsWith(".htm")) {
      String path=relative(state,file);List<Control> controls=new ArrayList<>();
      try {
        String text=SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES);
        String action=null,formGroup=null,activeModule=null;Map<String,Integer> occurrences=new HashMap<>();
        for(MarkupTag tag:MarkupTag.scan(text)) {
          String name=tag.name().toLowerCase(Locale.ROOT);
          if(tag.closing()) {if(Set.of("html:form","html-el:form","form","form:form").contains(name)) {action=null;formGroup=null;activeModule=null;}continue;}
          var source=new SourceLocation(path,tag.line());
          if(isScreenLoadActionTag(name,tag)) {
            String raw=screenLoadTarget(name,tag);String module=moduleFor(path,state);String explicit=tag.attribute("module");if(explicit!=null&&!explicit.isBlank())module=explicit;
            String target=raw;
            if(target!=null&&tag.attribute("action")!=null)target=normalizeStrutsAction(target,module,state);
            else if(target!=null)target=resolveRelativeJspUrl(path,target);
            if(target!=null)loadCallsByView.computeIfAbsent(path,ignored->new ArrayList<>()).add(new ScreenLoadCall(name,target,module,source));
          }
          if(Set.of("tiles:insert","tiles:put").contains(name)) {
            String target=first(tag,"definition","page","value");String view=target==null?null:state.viewIds.get(target);
            if(view==null&&target!=null)view=state.tileViewIds.get(target);
            Set<String> owners=new TreeSet<>(state.tileFragmentOwners.getOrDefault(path,Set.of()));String directOwner=state.screens.get(path);if(directOwner!=null)owners.add(directOwner);
            if(view!=null)for(String screen:owners)edge(state,EdgeType.INCLUDES,screen,view,Confidence.CONFIRMED,source);
            else if(target!=null) diagnostic(state,"Tiles 標籤目標未解析："+target,source,"TILES_REFERENCE_UNRESOLVED");
          }
          ComponentKind kind=Set.of("logic:redirect","logic:forward","html:rewrite","html-el:rewrite").contains(name)?ComponentKind.LINK:kind(name,tag);
          if(kind==null) continue;
          if(kind==ComponentKind.FORM) action=first(tag,"action");
          String target=kind==ComponentKind.LINK?first(tag,"href","forward","page","action"):first(tag,"formaction");
          if(Set.of("logic:redirect","logic:forward").contains(name))target=first(tag,"forward","page","action","href");
          boolean inheritedFormAction=kind==ComponentKind.SUBMIT&&target==null&&action!=null;
          String module=moduleFor(path,state);if(target!=null&&tag.attribute("forward")!=null&&!target.startsWith("/")&&!target.contains("."))target=state.globalForwards.getOrDefault(module+":"+target,target);
          if(kind==ComponentKind.FORM)activeModule=tag.attribute("module");
          if(target==null&&(kind==ComponentKind.FORM||kind==ComponentKind.SUBMIT)) target=action;
          Map<String,String> attrs=new TreeMap<>(tag.attributes());attrs.put("tag",name);attrs.put("kind",kind.name());attrs.put("componentType",kind==ComponentKind.FORM||kind==ComponentKind.SUBMIT?"FORM_SUBMIT":kind==ComponentKind.LINK?"NAVIGATION":kind.name());
          if(inheritedFormAction)attrs.put("strutsInheritedFormAction","true");
          String moduleValue=tag.attribute("module")!=null?tag.attribute("module"):activeModule;if(moduleValue==null||moduleValue.isBlank())moduleValue=module;if(moduleValue!=null&&!moduleValue.isBlank())attrs.put("module",moduleValue);
          String originalTarget=target;
          if(kind==ComponentKind.FORM){String formAction=action;action=(name.equals("html:form")||name.equals("html-el:form")||name.equals("form:form"))?normalizeStrutsAction(action,moduleValue,state):action!=null&&!action.startsWith("/")&&!action.contains(":")?resolveRelativeJspUrl(path,action):action;if(action!=null){target=action;attrs.put("originalTarget",formAction);attrs.put("target",action);}}
          else if(target!=null){
            if(Set.of("html:link","html-el:link","html:rewrite","html-el:rewrite","logic:redirect","logic:forward").contains(name)&&tag.attribute("action")!=null)target=normalizeStrutsAction(target,moduleValue,state);
            else if((name.equals("a")||name.equals("form"))&&!target.startsWith("/")&&!target.startsWith("#")&&!target.contains(":")&&tag.attribute("action")==null)target=resolveRelativeJspUrl(path,target);
            if(target!=null){attrs.put("target",target);if(!Objects.equals(originalTarget,target))attrs.put("originalTarget",originalTarget);}
          }
          if(target!=null) attrs.put("target",target);
          String occurrenceKey=name+new TreeMap<>(tag.attributes());int occurrence=occurrences.merge(occurrenceKey,1,Integer::sum)-1;
          String id=StableGraphIds.component(path,kind,identityAttributes(tag,name),occurrence);
          var resolved=jsp.interactions().stream().filter(i->id.equals(i.componentId())).findFirst();
          if(resolved.isPresent()&&!resolved.get().submitsCurrentView()) {target=resolved.get().target();if(resolved.get().originalExpression()!=null)attrs.put("originalExpression",resolved.get().originalExpression());}
          if(kind==ComponentKind.FORM&&action!=null)target=action;
          if(target!=null){
            if(Set.of("html:link","html-el:link","html:rewrite","html-el:rewrite","logic:redirect","logic:forward").contains(name)&&tag.attribute("action")!=null)target=normalizeStrutsAction(tag.attribute("action"),moduleValue,state);
            else if((name.equals("html:submit")||name.equals("html:button")||name.equals("button")||name.equals("input"))&&tag.attribute("formaction")==null&&action!=null)target=action;
            else if((name.equals("a")||name.equals("form"))&&!target.startsWith("/")&&!target.startsWith("#")&&!target.contains(":")&&tag.attribute("action")==null)target=resolveRelativeJspUrl(path,target);
            attrs.put("target",target);
          }
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
    for(var view:jsp.views()) if(view.kind()==JspAnalysis.ViewKind.JSP||view.kind()==JspAnalysis.ViewKind.HTML&&state.screens.containsKey(view.path())) {
      Set<String> sources=new TreeSet<>(projected.getOrDefault(view.path(),Set.of()));sources.add(view.path());
      collectIncludeSources(view.path(),jsp,state,new HashSet<>(),sources);
      Set<String> owners=new TreeSet<>(state.tileFragmentOwners.getOrDefault(view.path(),Set.of()));String directOwner=state.screens.get(view.path());if(directOwner!=null)owners.add(directOwner);
      Set<String> modules=new TreeSet<>(state.jspModuleOwners.getOrDefault(view.path(),Set.of()));String pathModule=moduleFor(view.path(),state);if(!pathModule.isBlank())modules.add(pathModule);if(modules.isEmpty())modules.add("");
      for(String owner:owners)for(String module:modules)for(String path:sources) {
        for(Control control:byView.getOrDefault(path,List.of()))addControl(owner,control,byView.getOrDefault(path,List.of()),module,state);
        for(ScreenLoadCall call:loadCallsByView.getOrDefault(path,List.of()))recordScreenLoadCall(owner,call,module,state);
      }
    }
  }

  private static boolean isScreenLoadActionTag(String name,MarkupTag tag) {
    if(tag.closing())return false;
    if(Set.of("jsp:forward","jsp:include").contains(name))return tag.attribute("page")!=null;
    if(!Set.of("html:img","html-el:img","html:image","html-el:image","html:rewrite","html-el:rewrite").contains(name))return false;
    return first(tag,"action","page","forward","src")!=null;
  }
  private static String screenLoadTarget(String name,MarkupTag tag) {
    if(name.equals("jsp:forward")||name.equals("jsp:include"))return tag.attribute("page");
    return first(tag,"action","page","forward","src");
  }
  private static void recordScreenLoadCall(String screenId,ScreenLoadCall call,String moduleContext,State state) {
    if(!StrutsSources.literal(call.target())) {diagnostic(state,"畫面載入時的 action URL 未解析："+call.target(),call.source(),"STRUTS_TARGET_UNRESOLVED");return;}
    String module=call.module().isBlank()?moduleContext:call.module();String target=call.target();
    Control context=new Control("",call.tag(),Map.of("module",module),target,call.source(),null,null,null);
    String resolved=moduleTarget(context,state),path=resolved.split("[?#]",2)[0];List<Mapping> mappings=state.routes.get(path);WildcardResolution wildcard=null;
    if(isViewOrAssetPath(path))return;
    if(mappings==null) {String logical=logicalPath(path,module,state);if(logical!=null)mappings=state.routes.get(logical);if(mappings==null){String concrete=logical==null?path:logical;wildcard=resolveWildcard(concrete,module,state);if(wildcard!=null&&wildcard.ambiguous()) {
        for(WildcardMatch candidate:wildcard.candidates()) {String endpoint=state.endpointIds.getOrDefault(candidate.mapping().route(),StableGraphIds.endpoint("ANY",publicPath(candidate.mapping().route(),candidate.mapping().module(),state)));recordWildcardMatch(endpoint,path,candidate,state,call.source());edge(state,EdgeType.CALLS,screenId,endpoint,Confidence.AMBIGUOUS,call.source(),"basis=STATIC_URL；載入時來源="+call.tag()+"；"+wildcardAmbiguityDetail(wildcard,state));}
        diagnostic(state,wildcardAmbiguityMessage(wildcard,state),call.source(),"STRUTS_WILDCARD_VERSION_UNRESOLVED");return;
      }if(wildcard!=null&&!wildcard.candidates().isEmpty()) {WildcardMatch match=wildcard.candidates().get(0);mappings=List.of(match.mapping());}}
    }
    if(mappings==null||mappings.isEmpty())return;
    for(Mapping mapping:mappings) {
      String endpoint=wildcard==null?state.endpointIds.getOrDefault(path,state.endpointIds.getOrDefault(publicPath(mapping.route(),mapping.module(),state),StableGraphIds.endpoint("ANY",mapping.route()))):state.endpointIds.getOrDefault(mapping.route(),StableGraphIds.endpoint("ANY",publicPath(mapping.route(),mapping.module(),state)));
      GraphNode endpointNode=state.nodes.get(endpoint);Confidence confidence=mappings.size()>1?Confidence.AMBIGUOUS:endpointNode==null?Confidence.UNRESOLVED:endpointNode.confidence();
      if(wildcard!=null&&!wildcard.candidates().isEmpty())recordWildcardMatch(endpoint,path,wildcard.candidates().get(0),state,call.source());
      edge(state,EdgeType.CALLS,screenId,endpoint,confidence,call.source(),"basis=STATIC_URL；載入時來源="+call.tag());
    }
  }
  private static void suppressActionIncludeDiagnostics(JspAnalysis jsp,State state) {
    Set<SourceLocation> actionIncludes=new HashSet<>();
    for(JspAnalysis.Include include:jsp.includes()) {
      String module=moduleFor(include.sourceViewPath(),state);String target=resolveRelativeJspUrl(include.sourceViewPath(),include.targetPath());
      if(target==null)continue;String path=target.split("[?#]",2)[0];String logical=logicalPath(path,module,state);
      if(isViewOrAssetPath(path))continue;
      if(state.routes.containsKey(path)||logical!=null&&state.routes.containsKey(logical)||resolveWildcard(logical==null?path:logical,module,state)!=null)actionIncludes.add(include.source());
    }
    if(!actionIncludes.isEmpty())state.diagnostics.removeIf(diagnostic->diagnostic.code().equals("JSP_UNRESOLVED")&&diagnostic.message().startsWith("JSP include cannot be found")&&actionIncludes.contains(diagnostic.source()));
  }
  private static boolean isViewOrAssetPath(String path) {
    return path!=null&&path.toLowerCase(Locale.ROOT).matches(".*\\.(?:jsp|jspx|jspf|html?|png|gif|jpe?g|svg|css|js|woff2?|ico|pdf)$");
  }
  private static void collectIncludeSources(String view,JspAnalysis jsp,State state,Set<String> seen,Set<String> sources) {
    if(!seen.add(view)) return;
    for(var include:jsp.includes()) if(include.sourceViewPath().equals(view)&&StrutsSources.literal(include.targetPath())) {
      String child=include.targetPath().startsWith("/")?"src/main/webapp"+include.targetPath():Path.of(view).getParent().resolve(include.targetPath()).normalize().toString().replace('\\','/');
      if(!sources.add(child)) continue;collectIncludeSources(child,jsp,state,seen,sources);
    }
  }
  private static void addControl(String screen,Control control,List<Control> peers,String moduleContext,State state) {
    Map<String,String> controlAttributes=new TreeMap<>(control.attributes());if((controlAttributes.get("module")==null||controlAttributes.get("module").isBlank())&&moduleContext!=null&&!moduleContext.isBlank())controlAttributes.put("module",moduleContext);
    Control contextual=new Control(control.id(),control.label(),controlAttributes,control.target(),control.source(),control.field(),control.value(),control.formGroup());
    addNode(state,control.id(),NodeType.COMPONENT,control.label(),controlAttributes,control.source(),Confidence.CONFIRMED);
    String originalTarget=controlAttributes.get("originalTarget");if(originalTarget!=null&&!originalTarget.isBlank()){GraphNode old=state.nodes.get(control.id());List<AnalysisEvidence> proof=new ArrayList<>(old.evidence());proof.add(new AnalysisEvidence(control.source(),PARSER,ResolutionStatus.CONFIRMED,"原始網址="+originalTarget+"；正規化網址="+Objects.toString(control.target(),"")));state.nodes.put(old.id(),new GraphNode(old.id(),old.type(),old.name(),old.attributes(),old.source(),old.confidence(),proof.stream().distinct().toList()));}
    edge(state,EdgeType.CONTAINS,screen,control.id(),Confidence.CONFIRMED,control.source());
    if("SUBMIT".equals(control.attributes().get("kind"))&&control.attributes().get("formaction")==null&&control.formGroup()!=null&&!dispatchSubmit(control,state))return;
    if(contextual.target()==null) return;
    if(!StrutsSources.literal(contextual.target())) {diagnostic(state,"元件目標運算式未解析："+contextual.target(),contextual.source(),"STRUTS_TARGET_UNRESOLVED");unresolvedBehavior(contextual,state);return;}
    String resolvedTarget=moduleTarget(contextual,state),path=resolvedTarget.split("[?#]",2)[0];var mappings=state.routes.get(path);WildcardMatch wildcardMatch=null;
    String module=contextual.attributes().getOrDefault("module",moduleContext==null?moduleFor(contextual.source().file(),state):moduleContext);
    WildcardResolution wildcardResolution=null;
    if(mappings==null) {String target=state.screens.get(path);if(target!=null) {edge(state,EdgeType.NAVIGATES_TO,control.id(),target,Confidence.CONFIRMED,control.source());return;}String logical=logicalPath(path,module,state);if(logical!=null)mappings=state.routes.get(logical);if(mappings==null){String concrete=logical==null?path:logical;wildcardResolution=resolveWildcard(concrete,module,state);if(wildcardResolution!=null&&wildcardResolution.ambiguous()){for(WildcardMatch candidate:wildcardResolution.candidates()){String candidateEndpoint=state.endpointIds.getOrDefault(candidate.mapping().route(),StableGraphIds.endpoint("ANY",publicPath(candidate.mapping().route(),candidate.mapping().module(),state)));recordWildcardMatch(candidateEndpoint,path,candidate,state,control.source());edge(state,EdgeType.TRIGGERS,control.id(),candidateEndpoint,Confidence.AMBIGUOUS,control.source(),"basis=STATIC_URL；"+wildcardAmbiguityDetail(wildcardResolution,state));}diagnostic(state,wildcardAmbiguityMessage(wildcardResolution,state),control.source(),"STRUTS_WILDCARD_VERSION_UNRESOLVED");unresolvedBehavior(contextual,state);return;}if(wildcardResolution!=null&&!wildcardResolution.candidates().isEmpty()){wildcardMatch=wildcardResolution.candidates().get(0);mappings=List.of(wildcardMatch.mapping());}}}
    if(mappings==null) {
      if(path.endsWith(".do")||path.contains("/do/")){String endpoint=unmappedLiteralEndpoint(path,control,state);edge(state,EdgeType.TRIGGERS,control.id(),endpoint,Confidence.UNRESOLVED,control.source());unresolvedBehavior(control,state);return;}
      diagnostic(state,"元件路由未解析："+path,control.source(),"STRUTS_ROUTE_UNRESOLVED");unresolvedBehavior(control,state);return;
    }
    String endpoint=state.endpointIds.getOrDefault(path,state.endpointIds.getOrDefault(publicPath(mappings.get(0).route(),mappings.get(0).module(),state),StableGraphIds.endpoint("ANY",mappings.get(0).route())));Confidence status=mappings.size()==1?state.nodes.get(endpoint).confidence():Confidence.AMBIGUOUS;
    if(wildcardMatch!=null){Mapping selected=wildcardMatch.mapping();endpoint=state.endpointIds.getOrDefault(selected.route(),StableGraphIds.endpoint("ANY",publicPath(selected.route(),selected.module(),state)));recordWildcardMatch(endpoint,path,wildcardMatch,state,control.source());status=state.nodes.get(endpoint)==null?Confidence.INFERRED:state.nodes.get(endpoint).confidence();}
    if(mappings.size()==1) {
      Mapping mapping=wildcardMatch==null?mappings.get(0):wildcardMappingForCaller(mappings.get(0),wildcardMatch,endpoint,state);
      if(mapping.formId()!=null) edge(state,EdgeType.BINDS_TO,control.id(),mapping.formId(),Confidence.CONFIRMED,control.source());
      if(!mapping.family().isBlank()) {
        // A dispatch method adds a more specific endpoint below, but the public
        // action mapping itself is still called by this form and must retain its caller.
        edge(state,EdgeType.TRIGGERS,control.id(),state.endpointIds.getOrDefault(path,endpoint),status,control.source());
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
    String callDetail="basis=STATIC_URL"+(module.isBlank()?"":"；module="+module);edge(state,EdgeType.TRIGGERS,control.id(),endpoint,status,control.source(),callDetail);
    BehaviorType type="LINK".equals(control.attributes().get("kind"))?BehaviorType.NAVIGATE:BehaviorType.SUBMIT_FORM;
    String behaviorExpression=control.attributes().getOrDefault("originalTarget",control.target());String id=StableGraphIds.behavior(control.id(),"FORM".equals(control.attributes().get("kind"))?"submit":"click",type,behaviorExpression+(module.isBlank()?"":"|module="+module),0);
    ServletMappingResolution resolution=state.servletMappings.get(module);String detail=callDetail+(resolution!=null&&resolution.status()==ServletMappingStatus.PROVEN?"；"+mappingProof(resolution):"");
    List<AnalysisEvidence> callEvidence=new ArrayList<>(evidence(control.source(),status,detail));if(!Objects.equals(behaviorExpression,control.target()))callEvidence.add(new AnalysisEvidence(control.source(),PARSER,status.resolutionStatus(),"原始目標="+behaviorExpression+"；正規化="+control.target()));if(!module.isBlank())callEvidence.add(new AnalysisEvidence(control.source(),PARSER,status.resolutionStatus(),"module="+module));
    state.behaviors.putIfAbsent(id,new Behavior(id,control.id(),"FORM".equals(control.attributes().get("kind"))?"submit":"click",type,endpoint,null,null,behaviorExpression,callEvidence));
  }
  private static String moduleTarget(Control control,State state) {
    String target=control.target();String explicitModule=control.attributes().get("module");
    if(explicitModule!=null&&!explicitModule.isBlank()&&target.startsWith("/")) {
      String module=explicitModule.endsWith("/")?explicitModule.substring(0,explicitModule.length()-1):explicitModule;
      if(!target.startsWith(module+"/"))target=module+target;
    }
    String query=target.contains("?")?target.substring(target.indexOf('?')+1):"";
    if(!query.isBlank()) {
      Map<String,String> values=new TreeMap<>();for(String pair:query.split("&")){String[] parts=pair.split("=",2);if(parts.length==2)values.put(parts[0],parts[1]);}
      String prefix=values.get("prefix"),page=values.get("page");if(prefix!=null&&page!=null)return(prefix.endsWith("/")?prefix.substring(0,prefix.length()-1):prefix)+(page.startsWith("/")?page:"/"+page);
    }
    return target;
  }
  private static boolean dispatchSubmit(Control control,State state) {
    if(control.target()==null)return false;String module=control.attributes().getOrDefault("module",moduleFor(control.source().file(),state));String path=moduleTarget(control,state).split("[?#]",2)[0];
    List<Mapping> mappings=state.routes.get(path);if(mappings==null){String logical=logicalPath(path,module,state);if(logical!=null)mappings=state.routes.get(logical);}
    return mappings!=null&&mappings.stream().anyMatch(mapping->!mapping.family().isBlank());
  }
  private static String normalizeStrutsAction(String raw,String module,State state) {
    if(raw==null||!StrutsSources.literal(raw))return raw;String path=raw.split("[?#]",2)[0];if(path.isBlank())return path;if(!path.startsWith("/"))path="/"+path;
    if(module!=null&&!module.isBlank()&&!path.equals(module)&&!path.startsWith(module+"/"))path=module+path;
    return path;
  }
  private static WildcardResolution resolveWildcard(String path,String module,State state) {
    List<WildcardMatch> matches=new ArrayList<>();
    for(Mapping mapping:state.actionMappings)if(mapping.module().equals(Objects.toString(module,""))){WildcardMatch match=wildcardMatch(mapping.route(),path,mapping);if(match!=null)matches.add(match);}
    if(matches.isEmpty())return null;
    WildcardMatch first=matches.get(0),last=matches.get(matches.size()-1);
    if(first.mapping().route().equals(last.mapping().route()))return new WildcardResolution(List.of(last),false);
    if(state.strutsVersion.isVersion13())return new WildcardResolution(List.of(last),false);
    return new WildcardResolution(List.of(first,last),true);
  }
  private static String wildcardAmbiguityDetail(WildcardResolution resolution,State state) {
    return "Struts 版本無法證明為 1.3.x；首個符合="+wildcardCandidateText(resolution.candidates().get(0))+"；最後符合="+wildcardCandidateText(resolution.candidates().get(resolution.candidates().size()-1))+"；版本證據="+state.strutsVersion.description();
  }
  private static String wildcardCandidateText(WildcardMatch match) {return match.mapping().route()+"（"+match.mapping().source().file()+":"+match.mapping().source().line()+"；實際路徑="+match.path()+"）";}
  private static String wildcardAmbiguityMessage(WildcardResolution resolution,State state) {return "萬用字元 action 的首末匹配 mapping 不同，且 Struts 版本無法證明為 1.3.x；候選："+resolution.candidates().stream().map(StrutsProjectAnalyzer::wildcardCandidateText).toList()+"；版本證據="+state.strutsVersion.description();}
  private static boolean hasWildcardSubstitution(String route,String value) {return route!=null&&route.contains("*")&&value!=null&&java.util.regex.Pattern.compile("\\{[0-9]\\}").matcher(value).find();}
  private static WildcardMatch wildcardMatch(String pattern,String path,Mapping mapping) {
    StringBuilder regex=new StringBuilder("^");int captures=0;
    for(int i=0;i<pattern.length();i++) {
      char c=pattern.charAt(i);
      if(c=='\\'&&i+1<pattern.length()){regex.append(java.util.regex.Pattern.quote(String.valueOf(pattern.charAt(++i))));continue;}
      if(c=='*') {
        boolean recursive=i+1<pattern.length()&&pattern.charAt(i+1)=='*';if(recursive)i++;
        regex.append(recursive?"(.*)":"([^/]*)");captures++;continue;
      }
      regex.append(java.util.regex.Pattern.quote(String.valueOf(c)));
    }
    regex.append("$");var matcher=java.util.regex.Pattern.compile(regex.toString()).matcher(path);if(!matcher.matches())return null;
    List<String> values=new ArrayList<>();for(int group=1;group<=captures;group++)values.add(matcher.group(group));
    return new WildcardMatch(mapping,path,List.copyOf(values));
  }
  private static Mapping substituteWildcardValues(Mapping mapping,WildcardMatch match) {
    List<String> captures=match.captures();java.util.function.Function<String,String> substitute=value->{if(value==null)return null;var matcher=java.util.regex.Pattern.compile("\\{([0-9])\\}").matcher(value);StringBuffer result=new StringBuffer();while(matcher.find()){int index=Integer.parseInt(matcher.group(1));String replacement=index==0?match.path():index<=captures.size()?captures.get(index-1):matcher.group();matcher.appendReplacement(result,java.util.regex.Matcher.quoteReplacement(replacement));}matcher.appendTail(result);return result.toString();};
    Map<String,String> forwards=new TreeMap<>(),local=new TreeMap<>();mapping.forwards().forEach((key,value)->forwards.put(key,substitute.apply(value)));mapping.localForwards().forEach((key,value)->local.put(key,substitute.apply(value)));
    return new Mapping(mapping.route(),substitute.apply(mapping.type()),mapping.handlerId(),mapping.formId(),substitute.apply(mapping.parameter()),mapping.family(),forwards,local,mapping.forwardSources(),substitute.apply(mapping.input()),mapping.module(),mapping.source());
  }
  private static void recordWildcardMatch(String endpoint,String path,WildcardMatch match,State state,SourceLocation source) {
    state.wildcardMatches.computeIfAbsent(match.mapping().route(),ignored->new TreeMap<>()).putIfAbsent(match.path(),match);
    GraphNode old=state.nodes.get(endpoint);if(old==null)return;Map<String,String> attributes=new TreeMap<>(old.attributes());Set<String> paths=new TreeSet<>();String previous=attributes.get("matchedPaths");if(previous!=null&&!previous.isBlank())paths.addAll(Arrays.asList(previous.split("\\u001f")));paths.add(path);attributes.put("matchedPaths",String.join("\u001f",paths));
    List<AnalysisEvidence> proof=new ArrayList<>(old.evidence());proof.add(new AnalysisEvidence(source,PARSER,old.confidence().resolutionStatus(),"Struts 萬用字元="+match.mapping().route()+"；實際比對路徑="+path));state.nodes.put(endpoint,new GraphNode(old.id(),old.type(),old.name(),attributes,old.source(),old.confidence(),proof.stream().distinct().sorted().toList()));
  }
  private static void inheritActionCallers(State state) {
    for(Mapping base:state.actionMappings) {
      String sourceEndpoint=state.endpointIds.get(base.route());if(sourceEndpoint==null)continue;
      for(Mapping origin:mappingVariants(base,sourceEndpoint,state)) {
        List<InheritanceTarget> starts=inheritanceTargets(origin,state);
        for(InheritanceTarget start:starts)walkActionForward(origin,sourceEndpoint,start.target(),start.source(),List.of(origin),new LinkedHashSet<>(List.of(origin.route())),1,state);
        for(PendingForward exception:state.exceptionForwards)if(exception.module().equals(origin.module()))walkActionForward(origin,sourceEndpoint,exception.target(),exception.source(),List.of(origin),new LinkedHashSet<>(List.of(origin.route())),1,state);
      }
    }
  }
  private static List<InheritanceTarget> inheritanceTargets(Mapping mapping,State state) {
    List<InheritanceTarget> result=new ArrayList<>();
    mapping.localForwards().forEach((name,target)->result.add(new InheritanceTarget(target,mapping.forwardSources().getOrDefault(name,mapping.source()))));
    if(mapping.input()!=null&&!mapping.input().isBlank())result.add(new InheritanceTarget(mapping.input(),mapping.source()));
    result.addAll(state.actionForwardTargets.getOrDefault(mapping.handlerId(),List.of()).stream().map(item->new InheritanceTarget(item.target(),item.source())).toList());
    return result.stream().distinct().toList();
  }
  private static void walkActionForward(Mapping origin,String sourceEndpoint,String rawTarget,SourceLocation targetSource,List<Mapping> chain,Set<String> visited,int depth,State state) {
    if(depth>5){diagnostic(state,"Struts forward 繼承超過 5 跳，停止繼承",targetSource,"STRUTS_REDIRECT_DEPTH_LIMIT");return;}
    if(rawTarget==null||rawTarget.isBlank()||!StrutsSources.literal(rawTarget))return;
    String target=normalizeStrutsAction(rawTarget,origin.module(),state);if(target==null)return;target=target.split("[?#]",2)[0];
    List<ActionMatch> destinations=resolveActionMappings(target,origin.module(),state);
    if(destinations.size()>1){if(destinations.stream().allMatch(item->item.wildcard()!=null))diagnostic(state,"萬用字元 action 的首末匹配 mapping 不同，且 Struts 版本無法證明為 1.3.x；候選="+destinations.stream().map(item->wildcardCandidateText(item.wildcard())).toList()+"；版本證據="+state.strutsVersion.description(),targetSource,"STRUTS_WILDCARD_VERSION_UNRESOLVED");diagnostic(state,"Struts forward 目的 action 有多個候選，未繼承呼叫來源："+rawTarget+"；候選="+destinations.stream().map(item->item.mapping().route()+"（"+item.mapping().source().file()+":"+item.mapping().source().line()+"）").toList(),targetSource,"STRUTS_REDIRECT_AMBIGUOUS");return;}
    ActionMatch actionMatch=destinations.isEmpty()?null:destinations.get(0);Mapping destination=actionMatch==null?null:actionMatch.mapping();
    if(destination==null) {
      String unresolvedPath=Objects.toString(logicalPath(target,origin.module(),state),target);boolean potential=target.endsWith(".do")||target.contains("/do/");
      if(!potential)for(Mapping mapping:state.actionMappings)if(wildcardMatch(mapping.route(),unresolvedPath,mapping)!=null){potential=true;break;}
      if(potential)diagnostic(state,"Struts forward 目的 action 無法唯一解析，未繼承呼叫來源："+rawTarget,targetSource,"STRUTS_REDIRECT_UNRESOLVED");
      return;
    }
    if(visited.contains(destination.route())){diagnostic(state,"Struts forward 繼承鏈偵測到循環："+String.join(" → ",chain.stream().map(Mapping::route).toList())+" → "+destination.route(),targetSource,"STRUTS_REDIRECT_CYCLE");return;}
    String endpoint=state.endpointIds.get(destination.route());if(endpoint==null)return;
    if(actionMatch.wildcard()!=null){recordWildcardMatch(endpoint,target,actionMatch.wildcard(),state,targetSource);destination=wildcardMappingForCaller(destination,actionMatch.wildcard(),endpoint,state);}
    List<Mapping> nextChain=new ArrayList<>(chain);nextChain.add(destination);
    String detail="轉址鏈："+nextChain.stream().map(mapping->{String id=state.endpointIds.get(mapping.route());GraphNode endpointNode=id==null?null:state.nodes.get(id);String url=endpointNode==null?publicPath(mapping.route(),mapping.module(),state):endpointNode.attributes().getOrDefault("path",endpointNode.name());return mapping.route()+"（公開網址="+url+"；處理器="+mapping.type()+"；來源="+mapping.source().file()+":"+mapping.source().line()+"）";}).collect(java.util.stream.Collectors.joining(" → "))+"；forward="+rawTarget+"（"+targetSource.file()+":"+targetSource.line()+"）";
    List<AnalysisEvidence> proof=new ArrayList<>();for(Mapping item:nextChain){proof.addAll(state.nodes.get(item.handlerId()).evidence());String mappedEndpoint=state.endpointIds.get(item.route());if(mappedEndpoint!=null&&state.nodes.containsKey(mappedEndpoint))proof.addAll(state.nodes.get(mappedEndpoint).evidence());}
    proof.add(new AnalysisEvidence(targetSource,"RedirectInheritance",ResolutionStatus.INFERRED,detail));
    String relationId=ApplicationGraph.id(NodeType.HANDLER,"STRUTS_REDIRECT_INHERITANCE:"+sourceEndpoint+":"+origin.handlerId()+":"+endpoint+":"+targetSource.file()+":"+targetSource.line());
    state.edges.putIfAbsent(relationId,new Relationship(relationId,EdgeType.CALLS,origin.handlerId(),endpoint,Confidence.INFERRED,targetSource,proof.stream().distinct().sorted().toList()));
    Set<String> nextVisited=new LinkedHashSet<>(visited);nextVisited.add(destination.route());
    for(InheritanceTarget child:inheritanceTargets(destination,state))walkActionForward(origin,sourceEndpoint,child.target(),child.source(),nextChain,nextVisited,depth+1,state);
  }
  private static List<ActionMatch> resolveActionMappings(String target,String module,State state) {
    String logical=logicalPath(target,module,state);String candidate=logical==null?target:logical;
    List<Mapping> exact=state.routes.get(candidate);if(exact!=null&&!exact.isEmpty())return exact.stream().distinct().map(mapping->new ActionMatch(mapping,null)).toList();
    WildcardResolution wildcard=resolveWildcard(candidate,module,state);return wildcard==null?List.of():wildcard.candidates().stream().map(match->new ActionMatch(match.mapping(),match)).toList();
  }
  private static List<Mapping> mappingVariants(Mapping mapping,String endpoint,State state) {
    Map<String,WildcardMatch> matches=state.wildcardMatches.get(mapping.route());if(matches==null||matches.isEmpty())return List.of(mapping);
    return matches.values().stream().map(match->wildcardMappingForCaller(mapping,match,endpoint,state)).toList();
  }
  private static Mapping wildcardMappingForCaller(Mapping mapping,WildcardMatch match,String endpoint,State state) {
    Mapping effective=substituteWildcardValues(mapping,match);if(Objects.equals(effective.type(),mapping.type()))return effective;
    String handlerId=ApplicationGraph.id(NodeType.HANDLER,mapping.handlerId()+":wildcard:"+match.path()+":"+effective.type());GraphNode base=state.nodes.get(mapping.handlerId());if(base==null)return effective;
    Map<String,String> attributes=new TreeMap<>(base.attributes());attributes.put("actionType",effective.type());attributes.put("type",effective.type());attributes.put("path",match.path());if(effective.parameter()!=null)attributes.put("parameter",effective.parameter());
    addNode(state,handlerId,NodeType.HANDLER,effective.type()+".execute()",attributes,mapping.source(),base.confidence(),"Struts wildcard substitutions；path="+match.path()+"；type="+effective.type()+"；parameter="+Objects.toString(effective.parameter(),""));
    edge(state,EdgeType.HANDLED_BY,endpoint,handlerId,base.confidence(),mapping.source(),"萬用字元屬性替換；實際路徑="+match.path());
    return new Mapping(effective.route(),effective.type(),handlerId,effective.formId(),effective.parameter(),effective.family(),effective.forwards(),effective.localForwards(),effective.forwardSources(),effective.input(),effective.module(),effective.source());
  }
  private static void markInheritedActionTemplates(State state) {
    Set<String> extendsTargets=new TreeSet<>();
    for(Mapping mapping:state.actionMappings){GraphNode handler=state.nodes.get(mapping.handlerId());if(handler==null)continue;String value=handler.attributes().get("extends");if(value==null||value.isBlank())continue;String normalized=value.startsWith("//")?value.substring(1):value;for(Mapping candidate:state.actionMappings)if(candidate.module().equals(mapping.module())&&(candidate.route().equals(value)||candidate.route().equals(normalized)||candidate.route().equals(mapping.module()+normalized)||Objects.equals(state.nodes.get(candidate.handlerId()).attributes().get("name"),value)))extendsTargets.add(candidate.route());}
    for(Mapping mapping:state.actionMappings)if(extendsTargets.contains(mapping.route())){
      String endpoint=state.endpointIds.get(mapping.route());GraphNode node=endpoint==null?null:state.nodes.get(endpoint);if(node==null)continue;
      boolean hasCaller=state.edges.values().stream().anyMatch(edge->edge.to().equals(endpoint)&&Set.of(EdgeType.TRIGGERS,EdgeType.CALLS).contains(edge.type()));
      if(hasCaller)continue;Map<String,String> attributes=new TreeMap<>(node.attributes());attributes.put("inheritedTemplate","true");attributes.put("templateAction",mapping.route());List<AnalysisEvidence> proof=new ArrayList<>(node.evidence());
      for(Mapping child:state.actionMappings){GraphNode handler=state.nodes.get(child.handlerId());if(handler==null)continue;String value=handler.attributes().get("extends");if(value!=null&&(value.equals(mapping.route())||value.equals(mapping.route().replaceFirst("^/","//"))||value.startsWith("//")&&value.substring(1).equals(mapping.route())))proof.add(new AnalysisEvidence(handler.source(),PARSER,ResolutionStatus.CONFIRMED,"extends="+value+" 由="+child.route()+" 引用樣板="+mapping.route()));}
      state.nodes.put(endpoint,new GraphNode(node.id(),node.type(),node.name(),attributes,node.source(),node.confidence(),proof.stream().distinct().sorted().toList()));
    }
  }
  private static String resolveRelativeJspUrl(String jspPath,String raw) {
    if(raw==null||!StrutsSources.literal(raw))return raw;String suffix="";int boundary=raw.length();int query=raw.indexOf('?'),fragment=raw.indexOf('#');if(query>=0)boundary=Math.min(boundary,query);if(fragment>=0)boundary=Math.min(boundary,fragment);suffix=raw.substring(boundary);String path=raw.substring(0,boundary);if(path.isBlank())return raw;
    String normalized=Path.of(jspPath).getParent().resolve(path).normalize().toString().replace('\\','/');String webRoot="src/main/webapp/";if(normalized.startsWith(webRoot))normalized="/"+normalized.substring(webRoot.length());else if(!normalized.startsWith("/"))return raw;return normalized+suffix;
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
    for(Control peer:peers) if(Objects.equals(control.formGroup(),peer.formGroup())&&name.equals(peer.field())&&peer.value()!=null&&("html:hidden".equals(peer.attributes().get("tag"))||"SUBMIT".equals(peer.attributes().get("kind")))) values.add(peer.value());
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
  private static ApplicationGraph linkValidatorFields(ApplicationGraph graph,State state) {
    Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(node->nodes.put(node.id(),node));
    List<Relationship> edges=graph.relationships();List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());List<ValidationRule> rules=new ArrayList<>();
    for(ValidationRule rule:graph.validationRules()) {
      AnalysisEvidence validatorEvidence=rule.evidence().stream().filter(e->"StrutsProjectAnalyzer".equals(e.parser())&&Objects.toString(e.detail(),"").startsWith("STRUTS_VALIDATOR;")).findFirst().orElse(null);
      String formName=rule.parameters().get("form");String property=rule.fields().stream().filter(value->!nodes.containsKey(value)).findFirst().orElse(null);
      if(validatorEvidence==null||formName==null||property==null){rules.add(rule);continue;}
      Set<String> formModels=new TreeSet<>();state.forms.forEach((key,id)->{if(key.endsWith(":"+formName))formModels.add(id);});
      List<Mapping> mappings=state.actionMappings.stream().filter(mapping->mapping.formId()!=null&&formModels.contains(mapping.formId())).toList();
      Set<String> componentIds=new TreeSet<>(),screenIds=new TreeSet<>();
      for(Mapping mapping:mappings) {
        String endpoint=state.endpointIds.get(mapping.route());if(endpoint==null)continue;
        for(Relationship call:edges)if(call.type()==EdgeType.TRIGGERS&&call.to().equals(endpoint)) {
          GraphNode form=nodes.get(call.from());if(form==null||form.type()!=NodeType.COMPONENT||!"FORM".equals(form.attributes().get("kind")))continue;
          for(GraphNode component:nodes.values())if(component.type()==NodeType.COMPONENT&&property.equals(component.attributes().get("field"))&&form.id().equals(component.attributes().get("formId"))) {
            componentIds.add(component.id());
            edges.stream().filter(owner->owner.type()==EdgeType.CONTAINS&&owner.to().equals(component.id())).map(Relationship::from).filter(id->nodes.containsKey(id)&&nodes.get(id).type()==NodeType.SCREEN).forEach(screenIds::add);
          }
        }
      }
      if(componentIds.isEmpty()) {
        diagnostics.add(new Diagnostic("檢核欄位無法唯一對應到使用該 ActionForm 的畫面欄位："+formName+"."+property,Confidence.UNRESOLVED,validatorEvidence.source(),"VALIDATION_RULE_UNRESOLVED",List.of(new AnalysisEvidence(validatorEvidence.source(),"StrutsValidatorFieldBinding",ResolutionStatus.UNRESOLVED,"form="+formName+"；property="+property))));
        List<AnalysisEvidence> unresolvedEvidence=new ArrayList<>(rule.evidence());unresolvedEvidence.add(new AnalysisEvidence(validatorEvidence.source(),"StrutsValidatorFieldBinding",ResolutionStatus.UNRESOLVED,"form="+formName+"；property="+property));
        rules.add(new ValidationRule(rule.id(),rule.kind(),rule.fields(),rule.message(),rule.layer(),rule.parameters(),unresolvedEvidence));
        continue;
      }
      List<String> fields=new ArrayList<>(rule.fields());fields.addAll(componentIds);
      Map<String,String> parameters=new TreeMap<>(rule.parameters());parameters.put("componentIds",String.join("\u001f",componentIds));parameters.put("screenIds",String.join("\u001f",screenIds));
      List<AnalysisEvidence> evidence=new ArrayList<>(rule.evidence());evidence.add(new AnalysisEvidence(validatorEvidence.source(),"StrutsValidatorFieldBinding",ResolutionStatus.CONFIRMED,"form="+formName+"；property="+property+"；畫面欄位="+componentIds+"；畫面="+screenIds));
      rules.add(new ValidationRule(rule.id(),rule.kind(),fields,rule.message(),rule.layer(),parameters,evidence));
    }
    return new ApplicationGraph(graph.application(),graph.nodes(),graph.relationships(),diagnostics,graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),rules);
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
    Set<String> referencedDefinitions=new TreeSet<>();
    for(Tile tile:resolved.values()) {
      if(resolved.containsKey(tile.parent()))referencedDefinitions.add(tile.parent());
      for(String value:tile.puts().values())if(resolved.containsKey(value))referencedDefinitions.add(value);
    }
    for(Path file:state.inventory.files())if(file.toString().endsWith(".jsp")||file.toString().endsWith(".jspf"))try {
      String text=SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
      for(MarkupTag tag:MarkupTag.scan(text))if(!tag.closing()&&tag.name().equalsIgnoreCase("tiles:insert")) {
        String target=first(tag,"definition","name","page","value");if(resolved.containsKey(target))referencedDefinitions.add(target);
      }
    }catch(Exception ignored) { }
    for(String name:resolved.keySet())if(!referencedDefinitions.contains(name))state.tilePageDefinitions.add(name);
    for(String page:state.tilePageDefinitions)collectTileDefinitions(page,state,state.tilePageOwners.computeIfAbsent(page,key->new TreeSet<>()),new HashSet<>());
    for(String name:resolved.keySet())if(state.tilePageOwners.values().stream().noneMatch(owners->owners.contains(name)))state.tileStandaloneDefinitions.add(name);
    for(Tile tile:resolved.values()) {
      String viewId=ApplicationGraph.id(NodeType.VIEW,"tiles:"+tile.name());state.tileViewIds.put(tile.name(),viewId);
      Confidence status=state.viewIds.containsKey(tile.template())?Confidence.CONFIRMED:Confidence.UNRESOLVED;
      addNode(state,viewId,NodeType.VIEW,tile.name(),Map.of("view",tile.template()),tile.source(),status);
    }
    for(Tile tile:resolved.values()) {
      String viewId=state.tileViewIds.get(tile.name());
      List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
      for(String target:targets) {
        String referenced=tileViewId(target,state);if(referenced==null)referenced=state.tileViewIds.get(target);
        if(referenced!=null)edge(state,EdgeType.INCLUDES,viewId,referenced,Confidence.CONFIRMED,tile.source());
        else if(target.endsWith(".jsp")||target.startsWith("/"))diagnostic(state,"Tiles 屬性目標未解析："+target,tile.source(),"TILES_REFERENCE_UNRESOLVED");
      }
    }
  }

  private static void collectTileDefinitions(String name,State state,Set<String> owners,Set<String> seen) {
    if(!seen.add(name))return;owners.add(name);Tile tile=state.tiles.get(name);if(tile==null)return;
    if(state.tiles.containsKey(tile.parent()))collectTileDefinitions(tile.parent(),state,owners,seen);
    List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
    for(String value:targets)if(state.tiles.containsKey(value))collectTileDefinitions(value,state,owners,seen);else if(value.endsWith(".jsp")||value.endsWith(".jspf"))for(String inserted:tileInsertDefinitions(value,state))collectTileDefinitions(inserted,state,owners,seen);
  }

  private static Set<String> tileInsertDefinitions(String target,State state) {
    String path=tileJspViewPath(target,state);if(path==null)return Set.of();Path file=state.inventory.root().resolve(path);
    try {
      String text=SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES);Set<String> result=new TreeSet<>();
      for(MarkupTag tag:MarkupTag.scan(text))if(!tag.closing()&&tag.name().equalsIgnoreCase("tiles:insert")) {String definition=first(tag,"definition","name","page","value");if(definition!=null&&state.tiles.containsKey(definition))result.add(definition);}
      return result;
    }catch(IOException|SecurityException error){return Set.of();}
  }

  private static String tileJspViewPath(String target,State state) {
    String viewId=state.viewIds.get(target);
    if(viewId==null) {
      List<String> candidates=state.viewIds.entrySet().stream().filter(entry->entry.getKey().endsWith(target)).map(Map.Entry::getValue).distinct().toList();
      if(candidates.size()==1)viewId=candidates.get(0);
    }
    GraphNode view=viewId==null?null:state.nodes.get(viewId);if(view!=null)return view.attributes().get("view");
    String suffix=target.startsWith("/")?target.substring(1):target;
    List<String> paths=state.inventory.files().stream().filter(file->relative(state,file).endsWith(suffix)).map(file->relative(state,file)).distinct().toList();
    return paths.size()==1?paths.get(0):null;
  }

  private static String tileViewId(String target,State state) {
    String viewId=state.viewIds.get(target);
    if(viewId==null&&(target.endsWith(".jsp")||target.endsWith(".jspf"))) {
      String path=tileJspViewPath(target,state);if(path!=null)viewId=state.viewIds.get(path);
    }
    return viewId;
  }

  private static boolean sameJspPath(String actual,String target,State state) {
    String resolved=tileJspViewPath(target,state);return actual.equals(resolved)||(resolved==null&&actual.endsWith(target.startsWith("/")?target:"/"+target));
  }

  private static void materializeTileScreens(State state) {
    if(state.tiles.isEmpty())return;
    for(String name:new TreeSet<>(state.tilePageDefinitions))ensureTileScreen(name,state);
    for(String name:new TreeSet<>(state.tileStandaloneDefinitions)) {
      String screen=ensureTileScreen(name,state);if(screen==null)continue;
      for(String path:tileJspPaths(name,state)) {
        state.tilePageJspPaths.add(path);state.tileFragmentOwners.computeIfAbsent(path,key->new TreeSet<>()).add(screen);
      }
    }
    for(var entry:state.tilePageOwners.entrySet()) {
      String page=entry.getKey(),screen=state.screens.get(page);if(screen==null)continue;
      for(String definition:entry.getValue())for(String path:tileJspPaths(definition,state)) {
        state.tilePageJspPaths.add(path);state.tileFragmentOwners.computeIfAbsent(path,key->new TreeSet<>()).add(screen);
        String viewId=state.viewIds.get(path);Tile tile=state.tiles.get(definition);
        if(viewId!=null&&tile!=null)edge(state,EdgeType.INCLUDES,screen,viewId,Confidence.CONFIRMED,tile.source(),"Tiles 版型／片段歸入頁面定義畫面");
      }
    }
    for(String path:state.tilePageJspPaths)removeUnroutedImplicitScreen(path,state);
  }

  private static Set<String> tileJspPaths(String definition,State state) {
    Set<String> paths=new TreeSet<>();collectTileJspPaths(definition,state,new HashSet<>(),paths);return paths;
  }

  private static void collectTileJspPaths(String definition,State state,Set<String> seen,Set<String> paths) {
    if(!seen.add(definition))return;Tile tile=state.tiles.get(definition);if(tile==null)return;
    List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
    for(String target:targets) {
      if(state.tiles.containsKey(target))collectTileJspPaths(target,state,seen,paths);
      else if(target.endsWith(".jsp")||target.endsWith(".jspf")) {String path=tileJspViewPath(target,state);if(path!=null){paths.add(path);for(String inserted:tileInsertDefinitions(path,state))collectTileJspPaths(inserted,state,seen,paths);}}
    }
  }

  private static void removeUnroutedImplicitScreen(String path,State state) {
    String id=state.screens.get(path);if(id==null)return;
    boolean directEntry=state.edges.values().stream().anyMatch(edge->edge.to().equals(id)&&Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO,EdgeType.NAVIGATES_TO).contains(edge.type()));
    if(directEntry)return;
    state.nodes.remove(id);state.edges.entrySet().removeIf(entry->entry.getValue().from().equals(id)||entry.getValue().to().equals(id));
    state.screens.entrySet().removeIf(entry->entry.getValue().equals(id));
  }

  private static String ensureTileScreen(String name,State state) {
    String existing=state.screens.get(name);if(existing!=null)return existing;
    Tile tile=state.tiles.get(name);if(tile==null)return null;
    String screen=ApplicationGraph.id(NodeType.SCREEN,"tiles:"+tile.name()),viewId=state.tileViewIds.get(tile.name());
    Confidence status=state.viewIds.containsKey(tile.template())?Confidence.CONFIRMED:Confidence.UNRESOLVED;
    addNode(state,screen,NodeType.SCREEN,tile.name(),Map.of("view",tile.template(),"tilesDefinition","true"),tile.source(),status);state.screens.put(name,screen);
    List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
    for(String target:targets) {
      String view=tileViewId(target,state);if(view==null)view=state.tileViewIds.get(target);
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
  private record WildcardMatch(Mapping mapping,String path,List<String> captures) { }
  private record WildcardResolution(List<WildcardMatch> candidates,boolean ambiguous) { }
  private record StrutsVersionEvidence(String version,SourceLocation source,String description) {boolean isVersion13(){return version!=null&&version.matches("1\\.3\\.\\d+");}}
  private record ActionMatch(Mapping mapping,WildcardMatch wildcard) { }
  private record InheritanceTarget(String target,SourceLocation source) { }
  private record PendingForward(String ownerId,String module,String target,SourceLocation source) { }
  private enum ServletMappingStatus { PROVEN, AMBIGUOUS, UNRESOLVED }
  private record ServletDefinition(String name,String servletClass,SourceLocation source,Map<String,List<String>> configs) { }
  private record ServletMappingResolution(ServletMappingStatus status,List<ServletPattern> patterns,String owner) { }
  private record ServletPattern(String pattern,SourceLocation source,String servletName,String servletClass) { }
  private record Control(String id,String label,Map<String,String> attributes,String target,SourceLocation source,String field,String value,String formGroup) { }
  private record ScreenLoadCall(String tag,String target,String module,SourceLocation source) { }
  private record Tile(String name,String template,String parent,Map<String,String> puts,SourceLocation source) { }
  private static final class State {
    final ProjectInventory inventory;
    final StrutsVersionEvidence strutsVersion;
    final Map<String,GraphNode> nodes=new TreeMap<>();final Map<String,Relationship> edges=new TreeMap<>();final List<Diagnostic> diagnostics=new ArrayList<>();
    final Map<String,Behavior> behaviors=new TreeMap<>();final Map<String,ValidationRule> rules=new TreeMap<>();
    final Map<String,String> screens=new TreeMap<>(),viewIds=new TreeMap<>(),tileViewIds=new TreeMap<>(),beans=new TreeMap<>(),forms=new TreeMap<>();
    final Set<String> ambiguousTiles=new TreeSet<>();
    final Map<String,Tile> tiles=new TreeMap<>();final Map<String,Set<String>> tileFragmentOwners=new TreeMap<>();
    final Map<String,Set<String>> jspModuleOwners=new TreeMap<>();
    final Set<String> tilePageDefinitions=new TreeSet<>(),tileStandaloneDefinitions=new TreeSet<>(),tilePageJspPaths=new TreeSet<>();
    final Map<String,Set<String>> tilePageOwners=new TreeMap<>();
    final Map<String,List<Mapping>> routes=new TreeMap<>();final Map<String,String> endpointIds=new TreeMap<>(),globalForwards=new TreeMap<>();final Map<String,Boolean> inputForward=new TreeMap<>();final List<Mapping> actionMappings=new ArrayList<>();final List<PendingForward> pendingForwards=new ArrayList<>(),exceptionForwards=new ArrayList<>();final Map<String,List<PendingForward>> actionForwardTargets=new TreeMap<>();final Map<String,Map<String,WildcardMatch>> wildcardMatches=new TreeMap<>();final Map<String,ServletMappingResolution> servletMappings=new TreeMap<>();
    final Map<String,StrutsSources.JavaType> types=new TreeMap<>();final Map<String,Set<String>> messages=new TreeMap<>();
    State(ProjectInventory inventory) {this.inventory=new ProjectInventory(inventory.root(),inventory.files().stream().sorted().toList(),inventory.technologies().stream().sorted().toList(),inventory.diagnostics().stream().sorted().toList(),inventory.contextPaths(),inventory.contextSettingsFile(),inventory.contextSettingsLine());this.strutsVersion=detectStrutsVersion(this.inventory);}
    ApplicationGraph graph() {return new ApplicationGraph(new Application(inventory.root().getFileName().toString(),inventory.root().toString(),inventory.technologies()),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,List.of(),ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,List.copyOf(behaviors.values()),List.copyOf(rules.values()));}
  }
}
