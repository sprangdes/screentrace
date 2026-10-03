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
    if(unsupported.isPresent()) {state.diagnostics.add(unsupported.get());return state.graph();}
    for(String message:inventory.diagnostics()) state.diagnostics.add(StrutsSources.diagnostic(message,".",1,"SOURCE_LIMIT"));
    state.types.putAll(StrutsSources.javaTypes(inventory,state.diagnostics));
    readSpringBeans(state);
    readMessages(state);
    JspAnalysis jsp=new JspProjectParser().analyze(inventory.root(),inventory.files());
    state.diagnostics.addAll(jsp.diagnostics());
    for(var view:jsp.views()) addView(view,state);
    readTiles(state);
    if(inventory.strutsConfigFiles().isEmpty()) state.diagnostics.add(StrutsSources.diagnostic("找不到 Struts 1 設定檔",".",1,"STRUTS_CONFIG_MISSING"));
    for(Path config:inventory.strutsConfigFiles()) parseConfig(config,state);
    addInteractions(jsp,state);
    parseValidation(state);
    parseActionForms(state);
    return io.screentrace.parser.jsp.UrlGraphContribution.enrich(JavaScriptGraphContribution.enrich(MarkupGraphContribution.enrich(ActionContracts.enrich(state.graph(),inventory),jsp),inventory),inventory);
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
        String id=ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,path+":global:"+forward.getAttribute("name"));
        addNode(state,id,NodeType.SOURCE_ARTIFACT,"GLOBAL "+forward.getAttribute("name"),StrutsSources.attributes(forward),StrutsSources.source(path,forward),Confidence.CONFIRMED);
        String target=state.screens.get(forward.getAttribute("path"));
        if(target!=null) edge(state,EdgeType.DECLARED_BY,id,target,Confidence.CONFIRMED,StrutsSources.source(path,forward));
        else diagnostic(state,"global forward 目標未解析："+forward.getAttribute("path"),StrutsSources.source(path,forward),"STRUTS_FORWARD_UNRESOLVED");
      }
      for(Element plugin:StrutsSources.elements(document,"plug-in")) {
        Map<String,String> attrs=new TreeMap<>(StrutsSources.attributes(plugin));
        for(Element property:StrutsSources.elements(plugin,"set-property")) attrs.put(property.getAttribute("property"),property.getAttribute("value"));
        addNode(state,ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,path+":plugin:"+plugin.getAttribute("className")),NodeType.SOURCE_ARTIFACT,"設定外掛",attrs,StrutsSources.source(path,plugin),Confidence.CONFIRMED);
      }
      for(Element exception:StrutsSources.elements(document,"exception")) {
        var source=StrutsSources.source(path,exception);
        addNode(state,ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,path+":exception:"+exception.getAttribute("key")+":"+source.line()),NodeType.SOURCE_ARTIFACT,"例外對應",StrutsSources.attributes(exception),source,Confidence.CONFIRMED);
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
        Map<String,String> forwards=new TreeMap<>(global);
        for(Element item:StrutsSources.elements(action,"forward")) {forwards.put(item.getAttribute("name"),item.getAttribute("path"));forward(item.getAttribute("path"),handlerId,StrutsSources.source(path,item),state);}
        forward(action.getAttribute("input"),handlerId,source,state);
        Mapping mapping=new Mapping(route,type,handlerId,formId,action.getAttribute("parameter"),family,forwards,source);
        for(String alias:endpointPaths(route)) {
          String endpointId=StableGraphIds.endpoint("ANY",alias);
          var mappings=state.routes.computeIfAbsent(alias,key->new ArrayList<>());mappings.add(mapping);
          if(mappings.size()>1) diagnostic(state,"路由重複，保留所有處理器候選："+alias,source,"DUPLICATE_ROUTE");
          Confidence routeStatus=alias.equals(route)?status:(status==Confidence.CONFIRMED?Confidence.INFERRED:status);
          addNode(state,endpointId,NodeType.ENDPOINT,"ANY "+alias,Map.of("httpMethod","ANY","path",alias,"category","ACTION"),source,routeStatus);
          edge(state,EdgeType.HANDLED_BY,endpointId,handlerId,routeStatus,source);
        }
        analyzeForwards(mapping,state);
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
        else forward(target,mapping.handlerId(),source,state);
      } else diagnostic(state,"forward 運算式無法靜態解析："+call.getArgument(0),source,"STRUTS_FORWARD_EXPRESSION");
    }
  }
  private static void forward(String target,String owner,SourceLocation source,State state) {
    if(target==null||target.isBlank()) return;
    String screen=state.screens.get(target);
    if(screen==null||!StrutsSources.literal(target)) {diagnostic(state,"forward 無法對應 JSP / Tiles 畫面："+target,source,"STRUTS_FORWARD_UNRESOLVED");return;}
    edge(state,EdgeType.FORWARDS_TO,owner,screen,Confidence.CONFIRMED,source);
  }

  private static void addInteractions(JspAnalysis jsp,State state) throws IOException {
    Map<String,List<Control>> byView=new TreeMap<>();
    for(Path file:state.inventory.files()) if(file.toString().endsWith(".jsp")||file.toString().endsWith(".jspf")) {
      String path=relative(state,file);List<Control> controls=new ArrayList<>();
      try {
        String text=SafeProjectFiles.readUtf8Limited(state.inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES);
        String action=null,formGroup=null;Map<String,Integer> occurrences=new HashMap<>();
        for(MarkupTag tag:MarkupTag.scan(text)) {
          String name=tag.name().toLowerCase(Locale.ROOT);
          if(tag.closing()) {if(Set.of("html:form","form","form:form").contains(name)) {action=null;formGroup=null;}continue;}
          var source=new SourceLocation(path,tag.line());
          if(Set.of("tiles:insert","tiles:put").contains(name)) {
            String target=first(tag,"definition","page","value");String view=state.viewIds.get(target);
            if(view==null) view=state.tileViewIds.get(target);
            String screen=state.screens.get(path);if(view!=null&&screen!=null) edge(state,EdgeType.INCLUDES,screen,view,Confidence.CONFIRMED,source);
            else if(target!=null) diagnostic(state,"Tiles 標籤目標未解析："+target,source,"TILES_REFERENCE_UNRESOLVED");
          }
          ComponentKind kind=kind(name,tag);if(kind==null) continue;
          if(kind==ComponentKind.FORM) action=first(tag,"action");
          String target=kind==ComponentKind.LINK?first(tag,"href","page","action"):first(tag,"formaction");
          if(target==null&&(kind==ComponentKind.FORM||kind==ComponentKind.SUBMIT)) target=action;
          Map<String,String> attrs=new TreeMap<>(tag.attributes());attrs.put("tag",name);attrs.put("kind",kind.name());attrs.put("componentType",kind==ComponentKind.FORM||kind==ComponentKind.SUBMIT?"FORM_SUBMIT":kind==ComponentKind.LINK?"NAVIGATION":kind.name());
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
      for(String path:sources) for(Control control:byView.getOrDefault(path,List.of())) addControl(view.path(),control,byView.getOrDefault(path,List.of()),state);
    }
  }
  private static void collectIncludeSources(String view,JspAnalysis jsp,State state,Set<String> seen,Set<String> sources) {
    if(!seen.add(view)) return;
    for(var include:jsp.includes()) if(include.sourceViewPath().equals(view)&&StrutsSources.literal(include.targetPath())) {
      String child=include.targetPath().startsWith("/")?"src/main/webapp"+include.targetPath():Path.of(view).getParent().resolve(include.targetPath()).normalize().toString().replace('\\','/');
      if(!sources.add(child)) continue;collectIncludeSources(child,jsp,state,seen,sources);
    }
  }
  private static void addControl(String viewPath,Control control,List<Control> peers,State state) {
    String screen=state.screens.get(viewPath);if(screen==null) return;
    addNode(state,control.id(),NodeType.COMPONENT,control.label(),control.attributes(),control.source(),Confidence.CONFIRMED);
    edge(state,EdgeType.CONTAINS,screen,control.id(),Confidence.CONFIRMED,control.source());
    if(control.target()==null) return;
    if(!StrutsSources.literal(control.target())) {diagnostic(state,"元件目標運算式未解析："+control.target(),control.source(),"STRUTS_TARGET_UNRESOLVED");unresolvedBehavior(control,state);return;}
    String path=control.target().split("[?#]",2)[0];var mappings=state.routes.get(path);
    if(mappings==null) {String target=state.screens.get(path);if(target!=null) edge(state,EdgeType.NAVIGATES_TO,control.id(),target,Confidence.CONFIRMED,control.source());else {diagnostic(state,"元件路由未解析："+path,control.source(),"STRUTS_ROUTE_UNRESOLVED");unresolvedBehavior(control,state);}return;}
    String endpoint=StableGraphIds.endpoint("ANY",path);Confidence status=mappings.size()==1?state.nodes.get(endpoint).confidence():Confidence.AMBIGUOUS;
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
          for(MethodCallExpr call:declaration.findAll(MethodCallExpr.class)) if(call.getNameAsString().equals("findForward")&&call.getArguments().size()==1&&call.getArgument(0).isStringLiteralExpr()) forward(mapping.forwards().get(call.getArgument(0).asStringLiteralExpr().asString()),handlerId,new SourceLocation(type.source().file(),call.getBegin().map(p->p.line).orElse(1)),state);
        }
      }
    }
    edge(state,EdgeType.TRIGGERS,control.id(),endpoint,status,control.source());
    BehaviorType type="LINK".equals(control.attributes().get("kind"))?BehaviorType.NAVIGATE:BehaviorType.SUBMIT_FORM;
    String id=StableGraphIds.behavior(control.id(),"FORM".equals(control.attributes().get("kind"))?"submit":"click",type,control.target(),0);
    state.behaviors.putIfAbsent(id,new Behavior(id,control.id(),"FORM".equals(control.attributes().get("kind"))?"submit":"click",type,endpoint,null,null,control.target(),evidence(control.source(),status,null)));
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
    for(Tile tile:resolved.values()) {
      String screen=ApplicationGraph.id(NodeType.SCREEN,"tiles:"+tile.name()),viewId=ApplicationGraph.id(NodeType.VIEW,"tiles:"+tile.name());
      state.screens.put(tile.name(),screen);state.tileViewIds.put(tile.name(),viewId);
      Confidence status=state.viewIds.containsKey(tile.template())?Confidence.CONFIRMED:Confidence.UNRESOLVED;
      addNode(state,screen,NodeType.SCREEN,tile.name(),Map.of("view",tile.template(),"tilesDefinition","true"),tile.source(),status);
      addNode(state,viewId,NodeType.VIEW,tile.name(),Map.of("view",tile.template()),tile.source(),status);
    }
    for(Tile tile:resolved.values()) {
      String screen=state.screens.get(tile.name());
      List<String> targets=new ArrayList<>(tile.puts().values());targets.add(tile.template());
      for(String target:targets) {
        String view=state.viewIds.getOrDefault(target,state.tileViewIds.get(target));
        if(view!=null) edge(state,EdgeType.INCLUDES,screen,view,Confidence.CONFIRMED,tile.source());
        else diagnostic(state,"Tiles 屬性目標未解析："+target,tile.source(),"TILES_REFERENCE_UNRESOLVED");
      }
    }
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
  private static void addNode(State state,String id,NodeType type,String name,Map<String,String> attrs,SourceLocation source,Confidence status) {
    GraphNode node=new GraphNode(id,type,name,attrs,source,status,evidence(source,status,null));
    state.nodes.merge(id,node,(a,b)->{
      List<AnalysisEvidence> evidence=new ArrayList<>(a.evidence());if(!evidence.containsAll(b.evidence())) evidence.addAll(b.evidence());
      return new GraphNode(a.id(),a.type(),a.name(),a.attributes(),a.source(),a.confidence()==b.confidence()?a.confidence():Confidence.AMBIGUOUS,evidence);
    });
  }
  private static void edge(State state,EdgeType type,String from,String to,Confidence status,SourceLocation source) {
    String id=ApplicationGraph.id(NodeType.COMPONENT,type+":"+from+":"+to);
    state.edges.putIfAbsent(id,new Relationship(id,type,from,to,status,source,evidence(source,status,null)));
  }
  private static void diagnostic(State state,String message,SourceLocation source,String code) {state.diagnostics.add(new Diagnostic(message,Confidence.UNRESOLVED,source,code,evidence(source,Confidence.UNRESOLVED,null)));}
  private record Mapping(String route,String type,String handlerId,String formId,String parameter,String family,Map<String,String> forwards,SourceLocation source) { }
  private record Control(String id,String label,Map<String,String> attributes,String target,SourceLocation source,String field,String value,String formGroup) { }
  private record Tile(String name,String template,String parent,Map<String,String> puts,SourceLocation source) { }
  private static final class State {
    final ProjectInventory inventory;
    final Map<String,GraphNode> nodes=new TreeMap<>();final Map<String,Relationship> edges=new TreeMap<>();final List<Diagnostic> diagnostics=new ArrayList<>();
    final Map<String,Behavior> behaviors=new TreeMap<>();final Map<String,ValidationRule> rules=new TreeMap<>();
    final Map<String,String> screens=new TreeMap<>(),viewIds=new TreeMap<>(),tileViewIds=new TreeMap<>(),beans=new TreeMap<>(),forms=new TreeMap<>();
    final Set<String> ambiguousTiles=new TreeSet<>();
    final Map<String,List<Mapping>> routes=new TreeMap<>();final Map<String,StrutsSources.JavaType> types=new TreeMap<>();final Map<String,Set<String>> messages=new TreeMap<>();
    State(ProjectInventory inventory) {this.inventory=new ProjectInventory(inventory.root(),inventory.files().stream().sorted().toList(),inventory.technologies().stream().sorted().toList(),inventory.diagnostics().stream().sorted().toList(),inventory.contextPaths(),inventory.contextSettingsFile(),inventory.contextSettingsLine());}
    ApplicationGraph graph() {return new ApplicationGraph(new Application(inventory.root().getFileName().toString(),inventory.root().toString(),inventory.technologies()),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,List.of(),ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,List.copyOf(behaviors.values()),List.copyOf(rules.values()));}
  }
}
