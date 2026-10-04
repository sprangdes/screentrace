package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;

/**
 * Parses JSP, JSPF, and Tiles metadata without applying Struts or Spring routing rules.
 * The parser intentionally returns literal targets only; expression-backed targets remain unresolved.
 */
public final class JspProjectParser {
  private static final String PARSER = "JspProjectParser";
  public static final String CURRENT_VIEW_TARGET = "<current-view>";
  private static final Pattern JSP_COMMENT = Pattern.compile("(?s)<%--.*?--%>");
  private static final Pattern JSTL_URL = Pattern.compile("(?is)<c:url\\b[^>]*?\\bvalue\\s*=\\s*(['\"])(.*?)\\1[^>]*/>");

  public JspAnalysis analyze(Path root, List<Path> files) throws IOException {
    List<JspAnalysis.View> views = new ArrayList<>();
    List<JspAnalysis.Interaction> interactions = new ArrayList<>();
    List<JspAnalysis.Include> includes = new ArrayList<>();
    List<JspAnalysis.TilesDefinition> tilesDefinitions = new ArrayList<>();
    List<Diagnostic> diagnostics = new ArrayList<>();
    Map<String, MarkupAnalysis> markup = new java.util.TreeMap<>();
    for (Path file : files.stream().sorted(java.util.Comparator.comparing(p->relative(root,p))).toList()) {
      String name = file.getFileName().toString();
      try {
        if (name.endsWith(".jsp") || name.endsWith(".jspf") || name.endsWith(".html") || name.endsWith(".htm")) {
          parseJsp(root, file, views, interactions, includes, diagnostics, markup);
        } else if (name.endsWith(".xml") && SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_XML_FILE_BYTES).contains("tiles-definitions")) {
          parseTiles(root, file, tilesDefinitions, diagnostics);
        }
      } catch (IOException | SecurityException exception) {
        diagnostics.add(unresolved("Source file was skipped: " + exception.getMessage(), new SourceLocation(relative(root, file), 1)));
      }
    }
    tilesDefinitions=resolveTiles(tilesDefinitions,diagnostics);
    return new JspAnalysis(views, expandIncludedInteractions(root, interactions, includes, diagnostics), includes, tilesDefinitions, diagnostics, markup);
  }

  private static void parseJsp(Path root, Path file, List<JspAnalysis.View> views,
                               List<JspAnalysis.Interaction> interactions, List<JspAnalysis.Include> includes,
                               List<Diagnostic> diagnostics, Map<String, MarkupAnalysis> markup) throws IOException {
    String text = SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_JSP_FILE_BYTES);
    String relative = relative(root, file);
    JspTagFileExpander.Result tagExpansion=new JspTagFileExpander().expand(root,relative,text);
    text=tagExpansion.text();
    for(String diagnostic:tagExpansion.diagnostics()) {
      String code=diagnostic.startsWith("JSP_TAG_CYCLE")?"JSP_TAG_CYCLE":diagnostic.startsWith("JSP_TAG_DEPTH_LIMIT")?"JSP_TAG_DEPTH_LIMIT":"JSP_TAG_UNRESOLVED";
      diagnostics.add(new Diagnostic("JSP 標籤檔展開受限："+diagnostic,Confidence.UNRESOLVED,new SourceLocation(relative,1),code,List.of()));
    }
    markup.put(relative, MarkupAnalysis.parse(relative, text));
    JspAnalysis.ViewKind kind = relative.endsWith(".jspf") ? JspAnalysis.ViewKind.JSPF : relative.endsWith(".jsp") ? JspAnalysis.ViewKind.JSP : JspAnalysis.ViewKind.HTML;
    views.add(new JspAnalysis.View(relative, kind, new SourceLocation(relative, 1)));
    UrlVariableResolver urls = new UrlVariableResolver(relative,text,includedWrites(root,relative,text,new java.util.HashSet<>()));
    UrlVariableResolver.Resolution activeFormResolution = null;
    Map<Integer,String> guards=markupGuards(text);
    Map<Integer,Boolean> repeats=markupRepeats(text);
    Map<String,Integer> componentOccurrences = new HashMap<>();
    String activeFormTarget = null;
    String activeFormMethod = null;
    boolean activeFormSubmitsCurrentView = false;

    for (MarkupTag tag : MarkupTag.scan(text)) {
      SourceLocation source = new SourceLocation(relative, tag.line());
      String tagName = tag.name().toLowerCase(Locale.ROOT);
      if (tag.closing()) {
        if (tagName.equals("form") || tagName.equals("form:form") || tagName.equals("html:form")) {
          activeFormTarget = null;
          activeFormMethod = null;
          activeFormSubmitsCurrentView = false;
        }
        continue;
      }
      var componentKind=MarkupAnalysis.kind(tagName,tag.attributes());
      String componentId=null;
      if(componentKind!=null) {
        var identity=new java.util.TreeMap<>(tag.attributes());identity.put("tag",tagName);
        String key=componentKind+identity.toString();
        componentId=io.screentrace.core.StableGraphIds.component(relative,componentKind,identity,componentOccurrences.merge(key,1,Integer::sum)-1);
      }
      int interactionStart = interactions.size();
      UrlVariableResolver.Resolution resolution = null;
      switch (tagName) {
        case "spring:url", "c:url" -> { }
        case "jsp:include", "@include", "tiles:insert", "tiles:put", "tiles:insertdefinition", "tiles:insertattribute" -> {
          int before=includes.size();include(relative,target(tag,"page","file","definition","value","template"),source,includes,diagnostics);
          if(includes.size()>before) {var item=includes.get(before);includes.set(before,new JspAnalysis.Include(item.sourceViewPath(),item.targetPath(),item.source(),item.confidence(),guards.get(tag.end()),repeats.getOrDefault(tag.end(),false)));}
        }
        case "form", "html:form", "form:form" -> {
          activeFormResolution = urls.resolve(target(tag, "action"),tag);
          resolution = activeFormResolution;
          activeFormTarget = resolution.value();
          activeFormMethod = method(tag);
          activeFormSubmitsCurrentView = activeFormTarget == null;
          interaction(relative, JspAnalysis.InteractionType.FORM_SUBMIT, tag, activeFormTarget, activeFormMethod, source,
              activeFormSubmitsCurrentView, interactions, diagnostics);
        }
        case "a", "html:link" -> {
          resolution = urls.resolve(target(tag,"href","page","action"),tag);
          String resolved = resolution.value();
          interaction(relative, linkType(tag, resolved), interactionLabel(tag, text), resolved, "GET", source,
              false, interactions, diagnostics);
        }
        case "button", "input", "html:submit", "html:button", "form:button" -> {
          resolution = urls.resolve(target(tag,"formaction","action"),tag);
          String action = resolution.value();
          if (action == null && submitsForm(tag) && activeFormTarget != null) { action = activeFormTarget; resolution = activeFormResolution; }
          boolean submitsCurrentView = action == null && submitsForm(tag) && activeFormSubmitsCurrentView;
          String label = interactionLabel(tag, text);
          interaction(relative, submitsForm(tag) ? JspAnalysis.InteractionType.FORM_SUBMIT : JspAnalysis.InteractionType.UNKNOWN,
              label, action, activeFormMethod, source,
              submitsCurrentView, interactions, diagnostics);
        }
        default -> { }
      }
      if(resolution != null) for(int i=interactionStart;i<interactions.size();i++) {
        var item=interactions.get(i);
        interactions.set(i,new JspAnalysis.Interaction(item.viewPath(),item.type(),item.label(),item.target(),item.httpMethod(),item.source(),item.confidence(),item.submitsCurrentView(),resolution.originalExpression(),resolution.definitions(),componentId));
      }
    }
    for(int i=0;i<interactions.size();i++) {
      JspAnalysis.Interaction item=interactions.get(i);
      List<io.screentrace.core.ApplicationGraph.AnalysisEvidence> tagEvidence=tagExpansion.definitionEvidence().get(item.source().line());
      if(item.viewPath().equals(relative)&&tagEvidence!=null&&!tagEvidence.isEmpty()) {
        List<io.screentrace.core.ApplicationGraph.AnalysisEvidence> proof=new ArrayList<>(item.definitionEvidence());proof.addAll(tagEvidence);
        interactions.set(i,new JspAnalysis.Interaction(item.viewPath(),item.type(),item.label(),item.target(),item.httpMethod(),item.source(),item.confidence(),item.submitsCurrentView(),item.originalExpression(),proof.stream().distinct().toList(),item.componentId()));
      }
    }
  }

  private static Map<Integer,Boolean> markupRepeats(String text) {
    Map<Integer,Boolean> result=new HashMap<>();List<String> loops=new ArrayList<>();
    for(MarkupTag tag:MarkupTag.scan(text)) {
      String name=tag.name().toLowerCase(Locale.ROOT);
      if(tag.closing()) {for(int i=loops.size()-1;i>=0;i--)if(loops.get(i).equals(name)){loops.subList(i,loops.size()).clear();break;}continue;}
      result.put(tag.end(),!loops.isEmpty());
      if(java.util.Set.of("c:foreach","logic:iterate").contains(name)&&text.charAt(tag.end()-1)!='/')loops.add(name);
    }
    return result;
  }

  private static Map<Integer,String> markupGuards(String text) {
    Map<Integer,String> guards=new HashMap<>();List<MarkupTag> scopes=new ArrayList<>();
    for(MarkupTag tag:MarkupTag.scan(text)) {
      if(tag.closing()) {for(int i=scopes.size()-1;i>=0;i--) if(scopes.get(i).name().equalsIgnoreCase(tag.name())) {scopes.subList(i,scopes.size()).clear();break;}continue;}
      String guard=scopes.stream().map(MarkupAnalysis::condition).reduce((a,b)->a+" && "+b).orElse(null);if(guard!=null)guards.put(tag.end(),guard);
      if(MarkupAnalysis.isConditional(tag.name()) && text.charAt(tag.end()-1)!='/')scopes.add(tag);
    }
    return guards;
  }

  static java.util.Set<String> includedWrites(Path root,String path,String text,java.util.Set<String> visited) {
    java.util.Set<String> result=new java.util.HashSet<>();
    if(!visited.add(path)||visited.size()>SafeProjectFiles.MAX_DIRECTORY_DEPTH) return java.util.Set.of("*");
    for(MarkupTag tag:MarkupTag.scan(text)) if(!tag.closing() && java.util.Set.of("@include","jsp:include").contains(tag.name().toLowerCase(Locale.ROOT))) {
      String target=target(tag,"file","page");String child=literal(target)?resolveInclude(root,path,target):null;
      if(child==null) {result.add("*");continue;}
      try {
        String included=SafeProjectFiles.readUtf8Limited(root,root.resolve(child),SafeProjectFiles.MAX_JSP_FILE_BYTES);
        for(MarkupTag nested:MarkupTag.scan(included)) if(!nested.closing() && nested.attribute("var")!=null)
          result.add(MarkupAnalysis.dynamic(nested.attribute("var"))?"*":nested.attribute("var"));
        if(included.replaceAll("(?s)<%--.*?--%>","").matches("(?s).*<%(?!@).*")) result.add("*");
        result.addAll(includedWrites(root,child,included,visited));
      } catch(IOException|SecurityException error) {result.add("*");}
    }
    visited.remove(path);return result;
  }

  private static void include(String sourcePath, String target, SourceLocation source, List<JspAnalysis.Include> includes,
                              List<Diagnostic> diagnostics) {
    if (literal(target)) includes.add(new JspAnalysis.Include(sourcePath, target, source, Confidence.CONFIRMED));
    else if (target != null) diagnostics.add(unresolved("JSP include cannot be resolved statically: " + target, source));
  }

  /** Removes JSP-only syntax and converts literal c:url tags before markup tokenization. */
  static String preprocess(String source) {
    return JSTL_URL.matcher(JSP_COMMENT.matcher(source).replaceAll("")).replaceAll("$2");
  }

  private static JspAnalysis.InteractionType linkType(MarkupTag tag, String target) {
    if (target == null || target.isBlank()) return JspAnalysis.InteractionType.UNKNOWN;
    if ("#".equals(target)) return JspAnalysis.InteractionType.PLACEHOLDER;
    if (target.startsWith("#")) {
      String slide = tag.attribute("data-slide");
      return slide == null || slide.isBlank() ? JspAnalysis.InteractionType.ANCHOR : JspAnalysis.InteractionType.UI_STATE_CHANGE;
    }
    return JspAnalysis.InteractionType.NAVIGATION;
  }

  /** Projects interactions declared by statically included fragments onto each rendered JSP screen. */
  private static List<JspAnalysis.Interaction> expandIncludedInteractions(Path root, List<JspAnalysis.Interaction> interactions,
      List<JspAnalysis.Include> includes, List<Diagnostic> diagnostics) {
    Map<String, List<JspAnalysis.Interaction>> byView = new HashMap<>();
    interactions.forEach(item -> byView.computeIfAbsent(item.viewPath(), ignored -> new ArrayList<>()).add(item));
    Map<String, List<String>> included = new HashMap<>();
    for (JspAnalysis.Include include : includes) {
      String resolved = resolveInclude(root, include.sourceViewPath(), include.targetPath());
      if (resolved == null && (include.targetPath().contains("/") || include.targetPath().endsWith(".jsp") || include.targetPath().endsWith(".jspf"))) diagnostics.add(unresolved("JSP include cannot be found: " + include.targetPath(), include.source()));
      else if(resolved!=null) included.computeIfAbsent(include.sourceViewPath(), ignored -> new ArrayList<>()).add(resolved);
    }
    List<JspAnalysis.Interaction> expanded = new ArrayList<>(interactions);
    byView.keySet().stream().filter(path -> path.endsWith(".jsp")).forEach(view -> collectIncluded(view, view, included, byView,
        new java.util.HashSet<>(), expanded));
    return expanded;
  }

  private static void collectIncluded(String screen, String current, Map<String, List<String>> included,
      Map<String, List<JspAnalysis.Interaction>> byView, java.util.Set<String> stack, List<JspAnalysis.Interaction> result) {
    if (!stack.add(current)) return;
    for (String child : included.getOrDefault(current, List.of())) {
      for (JspAnalysis.Interaction item : byView.getOrDefault(child, List.of())) result.add(new JspAnalysis.Interaction(screen,
          item.type(), item.label(), item.target(), item.httpMethod(), item.source(), item.confidence(), item.submitsCurrentView(),item.originalExpression(),item.definitionEvidence(),item.componentId()));
      collectIncluded(screen, child, included, byView, stack, result);
    }
    stack.remove(current);
  }

  private static String resolveInclude(Path root, String sourceView, String target) {
    Path source = root.resolve(sourceView).getParent();
    Path candidate = target.startsWith("/") ? root.resolve("src/main/webapp" + target) : source.resolve(target).normalize();
    if (SafeProjectFiles.isSafeRegularFile(root, candidate)) return relative(root, candidate);
    if (target.startsWith("/")) {
      candidate = root.resolve(target.substring(1));
      if (SafeProjectFiles.isSafeRegularFile(root, candidate)) return relative(root, candidate);
    }
    return null;
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, MarkupTag tag, String target,
                                  String method, SourceLocation source, List<JspAnalysis.Interaction> interactions,
                                  List<Diagnostic> diagnostics) {
    interaction(viewPath, type, label(tag), target, method, source, false, interactions, diagnostics);
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, MarkupTag tag, String target,
                                  String method, SourceLocation source, boolean submitsCurrentView,
                                  List<JspAnalysis.Interaction> interactions, List<Diagnostic> diagnostics) {
    interaction(viewPath, type, label(tag), target, method, source, submitsCurrentView, interactions, diagnostics);
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, String label, String target,
                                  String method, SourceLocation source, boolean submitsCurrentView,
                                  List<JspAnalysis.Interaction> interactions, List<Diagnostic> diagnostics) {
    if (target == null && !submitsCurrentView) return;
    String resolved = submitsCurrentView ? CURRENT_VIEW_TARGET : target;
    Confidence confidence = submitsCurrentView ? Confidence.INFERRED : literal(resolved) ? Confidence.CONFIRMED : Confidence.UNRESOLVED;
    interactions.add(new JspAnalysis.Interaction(viewPath, type, label, resolved, method, source, confidence,
        submitsCurrentView));
    if (confidence == Confidence.UNRESOLVED) diagnostics.add(unresolved("JSP target cannot be resolved statically: " + target, source));
  }

  private static String target(MarkupTag tag, String... names) {
    for (String name : names) {
      String value = tag.attribute(name);
      if (value != null) return value;
    }
    return null;
  }

  private static String method(MarkupTag tag) {
    String value = tag.attribute("method");
    if (value != null && !value.isBlank()) return value.toUpperCase(Locale.ROOT);
    return tag.name().equalsIgnoreCase("form:form") ? "POST" : "GET";
  }

  private static String label(MarkupTag tag) {
    String value = target(tag, "value", "title", "id", "name", "property");
    return value == null || value.isBlank() ? tag.name() : value;
  }

  private static boolean submitsForm(MarkupTag tag) {
    String name=tag.name().toLowerCase(Locale.ROOT),type=tag.attribute("type");
    if(name.equals("html:submit")||name.equals("html:cancel"))return true;
    if(name.equals("html:button")||name.equals("html:reset"))return false;
    if(name.equals("input"))return type!=null&&(type.equalsIgnoreCase("submit")||type.equalsIgnoreCase("image"));
    return type==null||type.isBlank()||type.equalsIgnoreCase("submit");
  }

  private static String interactionLabel(MarkupTag tag, String source) {
    String fallback = label(tag);
    if (!fallback.equals("button") && !fallback.equals("a")) return fallback;
    String tagName = tag.name().toLowerCase(Locale.ROOT);
    if (!tagName.equals("button") && !tagName.equals("a")) return fallback;
    int close = source.indexOf("</" + tagName, tag.end());
    if (close < 0) return fallback;
    String text = source.substring(tag.end() + 1, close).replaceAll("<[^>]+>", "").strip();
    return text.isBlank() ? fallback : text;
  }

  private static boolean literal(String value) {
    return value != null && !value.contains("${") && !value.contains("<%") && !value.contains("#{");
  }

  private static void parseTiles(Path root, Path file, List<JspAnalysis.TilesDefinition> definitions,
                                 List<Diagnostic> diagnostics) {
    String relative = relative(root, file);
    try {
      String text=SafeProjectFiles.readUtf8Limited(root,file,SafeProjectFiles.MAX_XML_FILE_BYTES);
      Document document = secureDocument(SafeProjectFiles.xmlWithoutExternalDoctype(text));
      List<MarkupTag> sourceTags=MarkupTag.scan(text).stream().filter(t->!t.closing()&&t.name().equals("definition")).toList();
      NodeList nodes = document.getElementsByTagName("definition");
      for (int index = 0; index < nodes.getLength(); index++) {
        Element definition = (Element) nodes.item(index);
        List<JspAnalysis.TilesAttribute> attributes = new ArrayList<>();
        NodeList attributeNodes = definition.getElementsByTagName("put-attribute");
        for (int attributeIndex = 0; attributeIndex < attributeNodes.getLength(); attributeIndex++) {
          Element attribute = (Element) attributeNodes.item(attributeIndex);
          attributes.add(new JspAnalysis.TilesAttribute(attribute.getAttribute("name"), attribute.getAttribute("value")));
        }
        definitions.add(new JspAnalysis.TilesDefinition(definition.getAttribute("name"), definition.getAttribute("template"),
            attributes, new SourceLocation(relative, index<sourceTags.size()?sourceTags.get(index).line():1),definition.getAttribute("extends")));
      }
    } catch (Exception exception) {
      diagnostics.add(unresolved("Unable to parse Tiles configuration: " + exception.getMessage(), new SourceLocation(relative, 1)));
    }
  }

  private static List<JspAnalysis.TilesDefinition> resolveTiles(List<JspAnalysis.TilesDefinition> input,List<Diagnostic> diagnostics) {
    Map<String,JspAnalysis.TilesDefinition> definitions=new java.util.TreeMap<>(),resolved=new java.util.TreeMap<>();java.util.Set<String> duplicates=new java.util.HashSet<>();
    for(var definition:input) {if(definitions.putIfAbsent(definition.name(),definition)!=null) {duplicates.add(definition.name());diagnostics.add(new Diagnostic("Tiles 定義重複："+definition.name(),Confidence.AMBIGUOUS,definition.source(),"TILES_AMBIGUOUS",List.of(new io.screentrace.core.ApplicationGraph.AnalysisEvidence(definition.source(),PARSER,io.screentrace.core.ApplicationGraph.ResolutionStatus.AMBIGUOUS,null))));}}
    duplicates.forEach(definitions::remove);
    for(String name:definitions.keySet()) resolveTile(name,definitions,resolved,new java.util.HashSet<>(),diagnostics);
    return List.copyOf(resolved.values());
  }
  private static JspAnalysis.TilesDefinition resolveTile(String name,Map<String,JspAnalysis.TilesDefinition> definitions,Map<String,JspAnalysis.TilesDefinition> resolved,java.util.Set<String> stack,List<Diagnostic> diagnostics) {
    if(resolved.containsKey(name))return resolved.get(name);var current=definitions.get(name);
    if(current==null)return null;
    if(!stack.add(name)) {diagnostics.add(unresolved("Tiles 繼承循環："+name,current.source()));return null;}
    Map<String,JspAnalysis.TilesAttribute> attrs=new java.util.TreeMap<>();String template=current.template();
    if(!current.parent().isBlank()) {
      var parent=resolveTile(current.parent(),definitions,resolved,stack,diagnostics);
      if(parent==null) {diagnostics.add(unresolved("Tiles 父定義未解析："+current.parent(),current.source()));stack.remove(name);return null;}
      parent.attributes().forEach(a->attrs.put(a.name(),a));if(template.isBlank())template=parent.template();
    }
    current.attributes().forEach(a->attrs.put(a.name(),a));
    var result=new JspAnalysis.TilesDefinition(current.name(),template,List.copyOf(attrs.values()),current.source(),current.parent());resolved.put(name,result);stack.remove(name);return result;
  }

  private static Document secureDocument(String xml) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setXIncludeAware(false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setExpandEntityReferences(false);
    var builder = factory.newDocumentBuilder();
    builder.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
    builder.setErrorHandler(new org.xml.sax.ErrorHandler() {
      @Override public void warning(SAXParseException exception) { }
      @Override public void error(SAXParseException exception) throws SAXParseException { throw exception; }
      @Override public void fatalError(SAXParseException exception) throws SAXParseException { throw exception; }
    });
    return builder.parse(new InputSource(new StringReader(xml)));
  }

  private static Diagnostic unresolved(String message, SourceLocation source) {
    return new Diagnostic(message, Confidence.UNRESOLVED, source, "JSP_UNRESOLVED", List.of());
  }

  private static String relative(Path root, Path file) {
    return root.relativize(file).toString().replace('\\', '/');
  }

  private static int line(String source, int offset) {
    int line = 1;
    for (int index = 0; index < offset; index++) if (source.charAt(index) == '\n') line++;
    return line;
  }
}
