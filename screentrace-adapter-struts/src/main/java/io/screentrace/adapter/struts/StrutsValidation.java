package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsActionInheritance.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;

import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.w3c.dom.*;

/** Commons Validator rules and ActionForm fields. */
final class StrutsValidation {
  private StrutsValidation() {}

  static ApplicationGraph linkValidatorFields(ApplicationGraph graph, State state) {
    Map<String, GraphNode> nodes = new TreeMap<>();
    graph.nodes().forEach(node -> nodes.put(node.id(), node));
    List<Relationship> edges = graph.relationships();
    List<Diagnostic> diagnostics = new ArrayList<>(graph.diagnostics());
    List<ValidationRule> rules = new ArrayList<>();
    for (ValidationRule rule : graph.validationRules()) {
      AnalysisEvidence validatorEvidence =
          rule.evidence().stream()
              .filter(
                  e ->
                      "StrutsProjectAnalyzer".equals(e.parser())
                          && Objects.toString(e.detail(), "").startsWith("STRUTS_VALIDATOR;"))
              .findFirst()
              .orElse(null);
      String formName = rule.parameters().get("form");
      String property =
          rule.fields().stream()
              .filter(value -> !nodes.containsKey(value))
              .findFirst()
              .orElse(null);
      if (validatorEvidence == null || formName == null || property == null) {
        rules.add(rule);
        continue;
      }
      Set<String> formModels = new TreeSet<>();
      state.forms.forEach(
          (key, id) -> {
            if (key.endsWith(":" + formName)) formModels.add(id);
          });
      List<Mapping> mappings =
          state.actionMappings.stream()
              .flatMap(
                  mapping -> {
                    String endpoint = state.endpointIds.get(mapping.route());
                    return (endpoint == null
                            ? List.of(mapping)
                            : mappingVariants(mapping, endpoint, state))
                        .stream();
                  })
              .filter(mapping -> mapping.formId() != null && formModels.contains(mapping.formId()))
              .toList();
      Set<String> componentIds = new TreeSet<>(), screenIds = new TreeSet<>();
      for (Mapping mapping : mappings) {
        String endpoint = state.endpointIds.get(mapping.route());
        if (endpoint == null) continue;
        for (Relationship call : edges)
          if (call.type() == EdgeType.TRIGGERS && call.to().equals(endpoint)) {
            GraphNode form = nodes.get(call.from());
            if (form == null
                || form.type() != NodeType.COMPONENT
                || !"FORM".equals(form.attributes().get("kind"))) continue;
            for (GraphNode component : nodes.values())
              if (component.type() == NodeType.COMPONENT
                  && property.equals(component.attributes().get("field"))
                  && form.id().equals(component.attributes().get("formId"))) {
                componentIds.add(component.id());
                edges.stream()
                    .filter(
                        owner ->
                            owner.type() == EdgeType.CONTAINS && owner.to().equals(component.id()))
                    .map(Relationship::from)
                    .filter(id -> nodes.containsKey(id) && nodes.get(id).type() == NodeType.SCREEN)
                    .forEach(screenIds::add);
              }
          }
      }
      if (componentIds.isEmpty()) {
        diagnostics.add(
            new Diagnostic(
                "檢核欄位無法唯一對應到使用該 ActionForm 的畫面欄位：" + formName + "." + property,
                Confidence.UNRESOLVED,
                validatorEvidence.source(),
                "VALIDATION_RULE_UNRESOLVED",
                List.of(
                    new AnalysisEvidence(
                        validatorEvidence.source(),
                        "StrutsValidatorFieldBinding",
                        ResolutionStatus.UNRESOLVED,
                        "form=" + formName + "；property=" + property))));
        List<AnalysisEvidence> unresolvedEvidence = new ArrayList<>(rule.evidence());
        unresolvedEvidence.add(
            new AnalysisEvidence(
                validatorEvidence.source(),
                "StrutsValidatorFieldBinding",
                ResolutionStatus.UNRESOLVED,
                "form=" + formName + "；property=" + property));
        rules.add(
            new ValidationRule(
                rule.id(),
                rule.kind(),
                rule.fields(),
                rule.message(),
                rule.layer(),
                rule.parameters(),
                unresolvedEvidence));
        continue;
      }
      List<String> fields = new ArrayList<>(rule.fields());
      fields.addAll(componentIds);
      Map<String, String> parameters = new TreeMap<>(rule.parameters());
      parameters.put("componentIds", String.join("\u001f", componentIds));
      parameters.put("screenIds", String.join("\u001f", screenIds));
      List<AnalysisEvidence> evidence = new ArrayList<>(rule.evidence());
      evidence.add(
          new AnalysisEvidence(
              validatorEvidence.source(),
              "StrutsValidatorFieldBinding",
              ResolutionStatus.CONFIRMED,
              "form="
                  + formName
                  + "；property="
                  + property
                  + "；畫面欄位="
                  + componentIds
                  + "；畫面="
                  + screenIds));
      rules.add(
          new ValidationRule(
              rule.id(), rule.kind(), fields, rule.message(), rule.layer(), parameters, evidence));
    }
    return new ApplicationGraph(
        graph.application(),
        graph.nodes(),
        graph.relationships(),
        diagnostics,
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        rules);
  }

  static void parseValidation(State state) {
    Map<String, Map<String, String>> definitions = new TreeMap<>();
    Map<String, Integer> occurrences = new TreeMap<>();
    for (Path file : state.inventory.files())
      if (file.getFileName().toString().equals("validator-rules.xml"))
        try {
          String path = relative(state, file);
          for (Element rule : StrutsSources.elements(readXml(file, state), "validator")) {
            Map<String, String> attrs = new TreeMap<>(StrutsSources.attributes(rule));
            attrs.put("definitionSource", path + ":" + StrutsSources.source(path, rule).line());
            definitions.put(rule.getAttribute("name"), attrs);
          }
        } catch (Exception error) {
          diagnostic(
              state,
              "validator-rules.xml 無法解析",
              new SourceLocation(relative(state, file), 1),
              "VALIDATOR_RULES_UNRESOLVED");
        }
    for (Path file : state.inventory.files())
      if (file.getFileName().toString().equals("validation.xml"))
        try {
          String path = relative(state, file);
          for (Element form : StrutsSources.elements(readXml(file, state), "form"))
            for (Element field : StrutsSources.elements(form, "field")) {
              String property = field.getAttribute("property");
              var source = StrutsSources.source(path, field);
              Map<String, String> parameters = new TreeMap<>();
              for (Element variable : StrutsSources.elements(field, "var")) {
                var name = StrutsSources.elements(variable, "var-name");
                var value = StrutsSources.elements(variable, "var-value");
                if (!name.isEmpty() && !value.isEmpty())
                  parameters.put(
                      name.get(0).getTextContent().trim(), value.get(0).getTextContent().trim());
              }
              for (String dependency : field.getAttribute("depends").split(",")) {
                String kind = dependency.trim();
                if (kind.isBlank()) continue;
                Map<String, String> attrs = new TreeMap<>(parameters);
                attrs.put("form", form.getAttribute("name"));
                attrs.putAll(definitions.getOrDefault(kind, Map.of()));
                String message = null;
                for (Element msg : StrutsSources.elements(field, "msg"))
                  if (msg.getAttribute("name").equals(kind)) {
                    String key = msg.getAttribute("key");
                    attrs.put("messageKey", key);
                    Set<String> messages = state.messages.getOrDefault(key, Set.of());
                    if (messages.size() == 1) message = messages.iterator().next();
                  }
                ResolutionStatus status =
                    definitions.containsKey(kind) && StrutsSources.literal(property)
                        ? ResolutionStatus.CONFIRMED
                        : ResolutionStatus.UNRESOLVED;
                var identity = new TreeMap<>(attrs);
                identity.remove("definitionSource");
                String stableKey = path + form.getAttribute("name") + property + kind + identity;
                int occurrence = occurrences.merge(stableKey, 1, Integer::sum) - 1;
                String id =
                    StableGraphIds.validation(
                        path,
                        form.getAttribute("name") + ":" + property,
                        kind,
                        identity.toString(),
                        occurrence);
                state.rules.put(
                    id,
                    new ValidationRule(
                        id,
                        kind,
                        List.of(property),
                        message,
                        ValidationLayer.SERVER,
                        attrs,
                        List.of(
                            new AnalysisEvidence(
                                source, PARSER, status, "STRUTS_VALIDATOR; depends=" + kind))));
                if (status == ResolutionStatus.UNRESOLVED)
                  diagnostic(state, "檢核規則未解析：" + kind, source, "VALIDATION_RULE_UNRESOLVED");
              }
            }
        } catch (Exception error) {
          diagnostic(
              state,
              "validation.xml 無法解析：" + error.getMessage(),
              new SourceLocation(relative(state, file), 1),
              "VALIDATION_UNRESOLVED");
        }
  }

  static void parseActionForms(State state) {
    for (var type : state.types.values()) {
      boolean form =
          type.parent().endsWith("ActionForm")
              || type.parent().endsWith("ValidatorForm")
              || state.nodes.values().stream()
                  .anyMatch(
                      n ->
                          n.type() == NodeType.FORM_MODEL
                              && type.name().equals(n.attributes().get("class")));
      if (!form) continue;
      for (var method : type.declaration().getMethodsByName("validate"))
        for (MethodCallExpr call : method.findAll(MethodCallExpr.class)) {
          if (!call.getNameAsString().equals("add")
              || call.getArguments().size() < 2
              || !call.getArgument(0).isStringLiteralExpr()) continue;
          String scope = call.getScope().map(Object::toString).orElse("");
          boolean errors =
              method.findAll(com.github.javaparser.ast.body.VariableDeclarator.class).stream()
                      .anyMatch(
                          v ->
                              v.getNameAsString().equals(scope)
                                  && v.getType().asString().endsWith("ActionErrors"))
                  || method.getParameters().stream()
                      .anyMatch(
                          p ->
                              p.getNameAsString().equals(scope)
                                  && p.getType().asString().endsWith("ActionErrors"));
          if (!errors) continue;
          boolean conditional =
              call.findAncestor(IfStmt.class).isPresent()
                  || call.findAncestor(SwitchStmt.class).isPresent()
                  || call.findAncestor(ConditionalExpr.class).isPresent()
                  || call.findAncestor(ForStmt.class).isPresent()
                  || call.findAncestor(WhileStmt.class).isPresent()
                  || call.findAncestor(ForEachStmt.class).isPresent()
                  || call.findAncestor(DoStmt.class).isPresent()
                  || call.findAncestor(LambdaExpr.class).isPresent()
                  || call.findAncestor(TryStmt.class).isPresent();
          var source =
              new SourceLocation(type.source().file(), call.getBegin().map(p -> p.line).orElse(1));
          if (conditional) {
            diagnostic(
                state, "ActionForm 檢核條件無法靜態確定：" + call, source, "ACTION_FORM_CONDITION_UNRESOLVED");
            continue;
          }
          String field = call.getArgument(0).asStringLiteralExpr().asString();
          String key = null;
          if (call.getArgument(1).isObjectCreationExpr()) {
            var creation = call.getArgument(1).asObjectCreationExpr();
            if (!creation.getArguments().isEmpty() && creation.getArgument(0).isStringLiteralExpr())
              key = creation.getArgument(0).asStringLiteralExpr().asString();
          }
          Set<String> messages =
              key == null ? Set.of() : state.messages.getOrDefault(key, Set.of());
          String message = messages.size() == 1 ? messages.iterator().next() : null;
          String id =
              StableGraphIds.validation(type.source().file(), field, "custom", call.toString(), 0);
          state.rules.putIfAbsent(
              id,
              new ValidationRule(
                  id,
                  "custom",
                  List.of(field),
                  message,
                  ValidationLayer.SERVER,
                  key == null ? Map.of() : Map.of("messageKey", key),
                  List.of(
                      new AnalysisEvidence(
                          source, PARSER, ResolutionStatus.INFERRED, "ACTION_FORM; " + call))));
        }
    }
  }
}
