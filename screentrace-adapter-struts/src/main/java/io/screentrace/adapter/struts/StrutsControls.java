package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsActionInheritance.*;
import static io.screentrace.adapter.struts.StrutsConfigParser.*;
import static io.screentrace.adapter.struts.StrutsDispatch.*;
import static io.screentrace.adapter.struts.StrutsForwards.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsInteractions.*;
import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;
import static io.screentrace.adapter.struts.StrutsScreens.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsWildcards.*;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import io.screentrace.adapter.struts.StrutsModel.Control;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.ServletMappingResolution;
import io.screentrace.adapter.struts.StrutsModel.ServletMappingStatus;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.adapter.struts.StrutsModel.WildcardMatch;
import io.screentrace.adapter.struts.StrutsModel.WildcardResolution;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import java.util.*;
import java.util.regex.*;

/** Turns one interactive JSP control into components, triggers and behaviors. */
final class StrutsControls {
  private StrutsControls() {}

  static void addControl(
      String screen, Control control, List<Control> peers, String moduleContext, State state) {
    Map<String, String> controlAttributes = new TreeMap<>(control.attributes());
    if ((controlAttributes.get("module") == null || controlAttributes.get("module").isBlank())
        && moduleContext != null
        && !moduleContext.isBlank()) controlAttributes.put("module", moduleContext);
    Control contextual =
        new Control(
            control.id(),
            control.label(),
            controlAttributes,
            control.target(),
            control.source(),
            control.field(),
            control.value(),
            control.formGroup());
    // A relative link resolves against the request URL: for a Tiles layout or a forwarded page that
    // is the action that
    // rendered it (struts-menu location="AddCustomer.do" in a layout served at /ListCustomer.do),
    // not the JSP's own folder.
    // Only browser-resolved URLs: plain a/area/form, or a Struts link's href. A Struts
    // action/page/forward is module-relative.
    String tagName = controlAttributes.getOrDefault("tag", "");
    boolean browserUrl =
        Set.of("a", "area", "form").contains(tagName)
            || Set.of("html:link", "html-el:link").contains(tagName)
                && controlAttributes.containsKey("href")
                && !controlAttributes.containsKey("action")
                && !controlAttributes.containsKey("page")
                && !controlAttributes.containsKey("forward");
    String relative = controlAttributes.getOrDefault("originalTarget", control.target()),
        requested = browserUrl ? requestRelativeTarget(screen, relative, state) : null;
    if (requested != null) {
      controlAttributes.put("originalTarget", relative);
      controlAttributes.put("target", requested);
      controlAttributes.put("requestRelative", "true");
      contextual =
          new Control(
              control.id(),
              control.label(),
              controlAttributes,
              requested,
              control.source(),
              control.field(),
              control.value(),
              control.formGroup());
    }
    addNode(
        state,
        control.id(),
        NodeType.COMPONENT,
        control.label(),
        controlAttributes,
        control.source(),
        Confidence.CONFIRMED);
    String originalTarget = controlAttributes.get("originalTarget");
    if (originalTarget != null && !originalTarget.isBlank()) {
      GraphNode old = state.nodes.get(control.id());
      List<AnalysisEvidence> proof = new ArrayList<>(old.evidence());
      proof.add(
          new AnalysisEvidence(
              control.source(),
              PARSER,
              ResolutionStatus.CONFIRMED,
              "原始網址=" + originalTarget + "；正規化網址=" + Objects.toString(control.target(), "")));
      state.nodes.put(
          old.id(),
          new GraphNode(
              old.id(),
              old.type(),
              old.name(),
              old.attributes(),
              old.source(),
              old.confidence(),
              proof.stream().distinct().toList()));
    }
    if (requested != null) {
      GraphNode old = state.nodes.get(control.id());
      List<AnalysisEvidence> proof = new ArrayList<>(old.evidence());
      proof.add(
          new AnalysisEvidence(
              control.source(),
              PARSER,
              ResolutionStatus.INFERRED,
              "相對網址 "
                  + relative
                  + " 依畫面的請求目錄解析為 "
                  + requested
                  + "；請求路徑="
                  + requestPaths(state.nodes.get(screen))));
      state.nodes.put(
          old.id(),
          new GraphNode(
              old.id(),
              old.type(),
              old.name(),
              old.attributes(),
              old.source(),
              old.confidence(),
              proof.stream().distinct().toList()));
    }
    edge(state, EdgeType.CONTAINS, screen, control.id(), Confidence.CONFIRMED, control.source());
    if ("SUBMIT".equals(control.attributes().get("kind"))
        && control.attributes().get("formaction") == null
        && control.formGroup() != null
        && !dispatchSubmit(control, state)) return;
    if (contextual.target() == null) return;
    if (!StrutsSources.literal(contextual.target())) {
      diagnostic(
          state,
          "元件目標運算式未解析：" + contextual.target(),
          contextual.source(),
          "STRUTS_TARGET_UNRESOLVED");
      unresolvedBehavior(contextual, state);
      return;
    }
    String resolvedTarget = moduleTarget(contextual, state),
        path = resolvedTarget.split("[?#]", 2)[0];
    var mappings = state.routes.get(path);
    WildcardMatch wildcardMatch = null;
    String module =
        contextual
            .attributes()
            .getOrDefault(
                "module",
                moduleContext == null
                    ? moduleFor(contextual.source().file(), state)
                    : moduleContext);
    WildcardResolution wildcardResolution = null;
    if (mappings == null) {
      String target = state.screens.get(path);
      if (target != null) {
        addScreenRouteAlias(target, path, state);
        GraphNode node = state.nodes.get(control.id());
        if (node != null) addScreenRouteAlias(target, node.attributes().get("target"), state);
        edge(
            state,
            EdgeType.NAVIGATES_TO,
            control.id(),
            target,
            Confidence.CONFIRMED,
            control.source());
        return;
      }
      String logical = logicalPath(path, module, state);
      if (logical != null) mappings = state.routes.get(logical);
      if (mappings == null) {
        String concrete = logical == null ? path : logical;
        wildcardResolution = resolveWildcard(concrete, module, state);
        if (wildcardResolution != null && wildcardResolution.ambiguous()) {
          for (WildcardMatch candidate : wildcardResolution.candidates()) {
            String candidateEndpoint =
                state.endpointIds.getOrDefault(
                    candidate.mapping().route(),
                    StableGraphIds.endpoint(
                        "ANY",
                        publicPath(
                            candidate.mapping().route(), candidate.mapping().module(), state)));
            recordWildcardMatch(candidateEndpoint, path, candidate, state, control.source());
            edge(
                state,
                EdgeType.TRIGGERS,
                control.id(),
                candidateEndpoint,
                Confidence.AMBIGUOUS,
                control.source(),
                "basis=STATIC_URL；" + wildcardAmbiguityDetail(wildcardResolution, state));
          }
          diagnostic(
              state,
              wildcardAmbiguityMessage(wildcardResolution, state),
              control.source(),
              "STRUTS_WILDCARD_VERSION_UNRESOLVED");
          unresolvedBehavior(contextual, state);
          return;
        }
        if (wildcardResolution != null && !wildcardResolution.candidates().isEmpty()) {
          wildcardMatch = wildcardResolution.candidates().get(0);
          mappings = List.of(wildcardMatch.mapping());
        }
      }
    }
    if (mappings == null) {
      if (path.endsWith(".do") || path.contains("/do/")) {
        String endpoint = unmappedLiteralEndpoint(path, control, state);
        edge(
            state,
            EdgeType.TRIGGERS,
            control.id(),
            endpoint,
            Confidence.UNRESOLVED,
            control.source());
        unresolvedBehavior(control, state);
        return;
      }
      diagnostic(state, "元件路由未解析：" + path, control.source(), "STRUTS_ROUTE_UNRESOLVED");
      unresolvedBehavior(control, state);
      return;
    }
    String endpoint =
        state.endpointIds.getOrDefault(
            path,
            state.endpointIds.getOrDefault(
                publicPath(mappings.get(0).route(), mappings.get(0).module(), state),
                StableGraphIds.endpoint("ANY", mappings.get(0).route())));
    Confidence status =
        mappings.size() == 1 ? state.nodes.get(endpoint).confidence() : Confidence.AMBIGUOUS;
    if (wildcardMatch != null) {
      Mapping selected = wildcardMatch.mapping();
      endpoint =
          state.endpointIds.getOrDefault(
              selected.route(),
              StableGraphIds.endpoint(
                  "ANY", publicPath(selected.route(), selected.module(), state)));
      recordWildcardMatch(endpoint, path, wildcardMatch, state, control.source());
      status =
          state.nodes.get(endpoint) == null
              ? Confidence.INFERRED
              : state.nodes.get(endpoint).confidence();
    }
    String dispatchDetail = null;
    if (mappings.size() == 1) {
      Mapping mapping =
          wildcardMatch == null
              ? mappings.get(0)
              : wildcardMappingForCaller(mappings.get(0), wildcardMatch, endpoint, state);
      if (mapping.formId() != null)
        edge(
            state,
            EdgeType.BINDS_TO,
            control.id(),
            mapping.formId(),
            Confidence.CONFIRMED,
            control.source());
      if (!mapping.family().isBlank()) {
        // A dispatch method adds a more specific endpoint below, but the public
        // action mapping itself is still called by this form and must retain its caller.
        edge(
            state,
            EdgeType.TRIGGERS,
            control.id(),
            state.endpointIds.getOrDefault(path, endpoint),
            status,
            control.source());
        Set<String> parameterValues =
            mapping.family().equals("MappingDispatchAction")
                ? Set.of(Objects.toString(mapping.parameter(), ""))
                : requestParameters(control, peers, mapping.parameter());
        if (parameterValues.size() > 1) {
          status = Confidence.AMBIGUOUS;
          String candidates = String.join(", ", parameterValues);
          diagnostic(
              state,
              "Dispatch 參數有多個常值候選，未選擇方法：" + candidates,
              control.source(),
              "STRUTS_DISPATCH_AMBIGUOUS");
          controlAttributes.put("dispatchCandidates", String.join("\u001f", parameterValues));
          controlAttributes.put("dispatchResolution", "AMBIGUOUS");
          GraphNode previous = state.nodes.get(control.id());
          if (previous != null)
            state.nodes.put(
                control.id(),
                new GraphNode(
                    previous.id(),
                    previous.type(),
                    previous.name(),
                    controlAttributes,
                    previous.source(),
                    previous.confidence(),
                    previous.evidence()));
        }
        String value = parameterValues.size() == 1 ? parameterValues.iterator().next() : null;
        String method = resolveMethod(mapping, value, state);
        var type =
            method == null ? null : typeWithMethod(mapping.type(), method, state, new HashSet<>());
        if (parameterValues.size() > 1) {
          // The form remains a caller of the route; no candidate method is selected.
        } else if (type == null) {
          status = Confidence.UNRESOLVED;
          diagnostic(
              state,
              "Dispatch 方法未解析；parameter="
                  + mapping.parameter()
                  + "，值="
                  + Objects.toString(value, "—"),
              control.source(),
              "STRUTS_DISPATCH_UNRESOLVED");
          if (value != null) {
            dispatchDetail =
                "分派到 " + value + "（" + dispatchMethodStatus(mapping, value, state) + "）";
            controlAttributes.put("dispatchMethod", value);
            controlAttributes.put(
                "dispatchMethodStatus", dispatchMethodStatus(mapping, value, state));
          }
        } else {
          String handlerId = ApplicationGraph.id(NodeType.HANDLER, mapping.type() + "#" + method);
          MethodDeclaration declaration =
              type.declaration().getMethodsByName(method).stream()
                  .filter(StrutsDispatch::validDispatchSignature)
                  .findFirst()
                  .orElseThrow();
          var source =
              new SourceLocation(
                  type.source().file(), declaration.getBegin().map(p -> p.line).orElse(1));
          addNode(
              state,
              handlerId,
              NodeType.HANDLER,
              mapping.type() + "." + method + "()",
              Map.of("class", mapping.type(), "method", method),
              source,
              Confidence.CONFIRMED);
          dispatchDetail = "分派到 " + method;
          controlAttributes.put("dispatchMethod", method);
          controlAttributes.put("dispatchMethodStatus", "方法存在");
          endpoint = StableGraphIds.endpoint("ANY", path + "?" + mapping.parameter() + "=" + value);
          addNode(
              state,
              endpoint,
              NodeType.ENDPOINT,
              "ANY " + path + "?" + mapping.parameter() + "=" + value,
              Map.of(
                  "httpMethod",
                  "ANY",
                  "path",
                  path,
                  "parameter",
                  mapping.parameter(),
                  "parameterValue",
                  value),
              control.source(),
              status);
          edge(state, EdgeType.HANDLED_BY, endpoint, handlerId, status, source);
          for (MethodCallExpr call : declaration.findAll(MethodCallExpr.class))
            if (call.getNameAsString().equals("findForward")
                && call.getArguments().size() == 1
                && call.getArgument(0).isStringLiteralExpr())
              forward(
                  mapping.forwards().get(call.getArgument(0).asStringLiteralExpr().asString()),
                  handlerId,
                  mapping.module(),
                  new SourceLocation(
                      type.source().file(), call.getBegin().map(p -> p.line).orElse(1)),
                  state);
        }
      }
      if ("LINK".equals(control.attributes().get("kind"))) {
        Set<String> destinations = new TreeSet<>();
        if ("SwitchAction".equals(mapping.type().substring(mapping.type().lastIndexOf('.') + 1))) {
          String switchRoute = switchActionTarget(resolvedTarget);
          if (switchRoute != null)
            for (Mapping candidate : state.routes.getOrDefault(switchRoute, List.of()))
              destinations.addAll(
                  resolveMappingScreens(
                      candidate, state, new LinkedHashSet<>(), 0, control.source()));
        } else
          destinations.addAll(
              resolveMappingScreens(mapping, state, new LinkedHashSet<>(), 0, control.source()));
        for (String destination : destinations) {
          if (status == Confidence.CONFIRMED)
            addScreenRouteAlias(destination, contextual.attributes().get("target"), state);
          edge(state, EdgeType.NAVIGATES_TO, control.id(), destination, status, control.source());
        }
      }
    }
    String callDetail = "basis=STATIC_URL" + (module.isBlank() ? "" : "；module=" + module);
    edge(state, EdgeType.TRIGGERS, control.id(), endpoint, status, control.source(), callDetail);
    BehaviorType type =
        "LINK".equals(control.attributes().get("kind"))
            ? BehaviorType.NAVIGATE
            : BehaviorType.SUBMIT_FORM;
    String behaviorExpression =
        control.attributes().getOrDefault("originalTarget", control.target());
    if (dispatchDetail != null) behaviorExpression = behaviorExpression + "；" + dispatchDetail;
    String dispatchCandidates = controlAttributes.get("dispatchCandidates");
    if (dispatchCandidates != null)
      behaviorExpression =
          behaviorExpression + "；分派候選（有歧義）=" + String.join("、", dispatchCandidates.split("\u001f"));
    String id =
        StableGraphIds.behavior(
            control.id(),
            "FORM".equals(control.attributes().get("kind")) ? "submit" : "click",
            type,
            behaviorExpression + (module.isBlank() ? "" : "|module=" + module),
            0);
    ServletMappingResolution resolution = state.servletMappings.get(module);
    String detail =
        callDetail
            + (resolution != null && resolution.status() == ServletMappingStatus.PROVEN
                ? "；" + mappingProof(resolution)
                : "");
    List<AnalysisEvidence> callEvidence =
        new ArrayList<>(evidence(control.source(), status, detail));
    if (!Objects.equals(behaviorExpression, control.target()))
      callEvidence.add(
          new AnalysisEvidence(
              control.source(),
              PARSER,
              status.resolutionStatus(),
              "原始目標=" + behaviorExpression + "；正規化=" + control.target()));
    if (!module.isBlank())
      callEvidence.add(
          new AnalysisEvidence(
              control.source(), PARSER, status.resolutionStatus(), "module=" + module));
    state.behaviors.putIfAbsent(
        id,
        new Behavior(
            id,
            control.id(),
            "FORM".equals(control.attributes().get("kind")) ? "submit" : "click",
            type,
            endpoint,
            null,
            null,
            behaviorExpression,
            callEvidence));
  }

  static String moduleTarget(Control control, State state) {
    String target = control.target();
    String explicitModule = control.attributes().get("module");
    if (explicitModule != null && !explicitModule.isBlank() && target.startsWith("/")) {
      String module =
          explicitModule.endsWith("/")
              ? explicitModule.substring(0, explicitModule.length() - 1)
              : explicitModule;
      if (!target.startsWith(module + "/")) target = module + target;
    }
    String query = target.contains("?") ? target.substring(target.indexOf('?') + 1) : "";
    if (!query.isBlank()) {
      Map<String, String> values = new TreeMap<>();
      for (String pair : query.split("&")) {
        String[] parts = pair.split("=", 2);
        if (parts.length == 2) values.put(parts[0], parts[1]);
      }
      String prefix = values.get("prefix"), page = values.get("page");
      if (prefix != null && page != null)
        return (prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix)
            + (page.startsWith("/") ? page : "/" + page);
    }
    return target;
  }

  static boolean dispatchSubmit(Control control, State state) {
    if (control.target() == null) return false;
    String module =
        control.attributes().getOrDefault("module", moduleFor(control.source().file(), state));
    String path = moduleTarget(control, state).split("[?#]", 2)[0];
    List<Mapping> mappings = state.routes.get(path);
    if (mappings == null) {
      String logical = logicalPath(path, module, state);
      if (logical != null) mappings = state.routes.get(logical);
    }
    return mappings != null && mappings.stream().anyMatch(mapping -> !mapping.family().isBlank());
  }

  static String selectOptionValues(String source, MarkupTag select) {
    int end = source.toLowerCase(Locale.ROOT).indexOf("</select", select.end());
    if (end < 0) return "";
    Matcher options =
        Pattern.compile("(?is)<option\\b([^>]*)>").matcher(source.substring(select.end(), end));
    Set<String> values = new TreeSet<>();
    while (options.find()) {
      Matcher value =
          Pattern.compile("(?is)\\bvalue\\s*=\\s*(['\"])(.*?)\\1").matcher(options.group(1));
      if (value.find() && StrutsSources.literal(value.group(2))) values.add(value.group(2));
    }
    return String.join("\u001f", values);
  }

  static String unmappedLiteralEndpoint(String path, Control control, State state) {
    String id = StableGraphIds.endpoint("ANY", path);
    addNode(
        state,
        id,
        NodeType.ENDPOINT,
        "ANY " + path,
        Map.of(
            "httpMethod", "ANY", "path", path, "category", "ACTION", "mappingStatus", "UNRESOLVED"),
        control.source(),
        Confidence.UNRESOLVED);
    diagnostic(
        state,
        "公開網址無法依 web.xml 對應至 ActionServlet mapping：" + path,
        control.source(),
        "STRUTS_SERVLET_MAPPING_UNRESOLVED");
    return id;
  }

  static void unresolvedBehavior(Control control, State state) {
    String id =
        StableGraphIds.behavior(control.id(), "click", BehaviorType.UNKNOWN, control.target(), 0);
    state.behaviors.putIfAbsent(
        id,
        new Behavior(
            id,
            control.id(),
            "click",
            BehaviorType.UNKNOWN,
            null,
            null,
            null,
            control.target(),
            evidence(control.source(), Confidence.UNRESOLVED, null)));
  }

  static Set<String> requestParameters(Control control, List<Control> peers, String name) {
    if (name == null || name.isBlank()) return Set.of();
    if (control.target().contains("?"))
      for (String pair : control.target().substring(control.target().indexOf('?') + 1).split("&")) {
        String[] values = pair.split("=", 2);
        if (values.length == 2 && values[0].equals(name) && StrutsSources.literal(values[1]))
          return Set.of(values[1]);
      }
    if (name.equals(control.field()) && control.value() != null) return Set.of(control.value());
    Set<String> values = new TreeSet<>();
    for (Control peer : peers)
      if (Objects.equals(control.formGroup(), peer.formGroup()) && name.equals(peer.field())) {
        String tag = peer.attributes().get("tag"), kind = peer.attributes().get("kind");
        if (peer.value() != null
            && Set.of(
                    "html:hidden",
                    "html-el:hidden",
                    "input",
                    "button",
                    "html:submit",
                    "html-el:submit",
                    "submit")
                .contains(tag)) values.add(peer.value());
        if ("RADIO".equals(kind) && peer.value() != null) values.add(peer.value());
        String optionValues = peer.attributes().get("dispatchParameterValues");
        if (optionValues != null && !optionValues.isBlank())
          values.addAll(Arrays.asList(optionValues.split("\u001f")));
      }
    return Collections.unmodifiableSet(values);
  }

  static ComponentKind kind(String name, MarkupTag tag) {
    return io.screentrace.parser.jsp.MarkupAnalysis.kind(name, tag.attributes());
  }
}
