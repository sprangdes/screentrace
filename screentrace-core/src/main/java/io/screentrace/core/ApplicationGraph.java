package io.screentrace.core;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.*;
import java.nio.charset.StandardCharsets;

/**
 * Framework-neutral, deterministic contract between analysis adapters and graph consumers.
 *
 * <p>The legacy fields {@code source} and {@code confidence} remain on nodes, relationships,
 * and diagnostics so reports generated from schema 1 JSON remain readable. Schema 2 adds
 * {@link AnalysisEvidence}: one assertion can now retain every source that proves it.</p>
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApplicationGraph(Application application, List<GraphNode> nodes, List<Relationship> relationships,
                               List<Diagnostic> diagnostics, List<ApiContract> apiContracts, String schemaVersion,
                               List<Behavior> behaviors, List<ValidationRule> validationRules) {
  /** Historical missing-version default only; new analyses must use BEHAVIOR_SCHEMA_VERSION. */
  @Deprecated
  public static final String CURRENT_SCHEMA_VERSION = "2.1";
  public static final String BEHAVIOR_SCHEMA_VERSION = "2.2";
  public static final Set<String> SUPPORTED_SCHEMA_VERSIONS = Set.of("1.0", "2.0", CURRENT_SCHEMA_VERSION, BEHAVIOR_SCHEMA_VERSION);

  @JsonCreator
  public ApplicationGraph {
    schemaVersion = normalizeSchemaVersion(schemaVersion);
    nodes = sorted(nodes);
    relationships = sorted(relationships);
    diagnostics = sorted(diagnostics);
    apiContracts = sorted(apiContracts);
    behaviors = sorted(behaviors);
    validationRules = sorted(validationRules);
  }

  /** Historical data/fixture compatibility only. New analysis must use the full schema-2.2 constructor. */
  @Deprecated
  public ApplicationGraph(Application application, List<GraphNode> nodes, List<Relationship> relationships,
                          List<Diagnostic> diagnostics, List<ApiContract> apiContracts, String schemaVersion) {
    this(application, nodes, relationships, diagnostics, apiContracts, schemaVersion, List.of(), List.of());
  }

  /** Historical data/fixture compatibility only; never use for new adapter output. */
  @Deprecated
  public ApplicationGraph(Application application, List<GraphNode> nodes, List<Relationship> relationships,
                          List<Diagnostic> diagnostics) {
    this(application, nodes, relationships, diagnostics, List.of(), CURRENT_SCHEMA_VERSION);
  }

  /** Historical data/fixture compatibility only; never use for new adapter output. */
  @Deprecated
  public ApplicationGraph(Application application, List<GraphNode> nodes, List<Relationship> relationships,
                          List<Diagnostic> diagnostics, String schemaVersion) {
    this(application, nodes, relationships, diagnostics, List.of(), schemaVersion);
  }

  /** Missing versions are interpreted only as historical data, never as strict schema 2.2. */
  @Deprecated
  private static String normalizeSchemaVersion(String version) {
    String value = version == null || version.isBlank() ? CURRENT_SCHEMA_VERSION : version;
    if (!SUPPORTED_SCHEMA_VERSIONS.contains(value)) {
      throw new IllegalArgumentException("Unsupported Application Graph schema version: " + value);
    }
    return value;
  }

  private static <T extends Comparable<T>> List<T> sorted(List<T> items) {
    var copy = new ArrayList<>(items == null ? List.<T>of() : items);
    Collections.sort(copy);
    return List.copyOf(copy);
  }

  public static String id(NodeType type, String key) {
    return type.name().toLowerCase(Locale.ROOT) + ":" + UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
  }

  public record Application(String name, String path, List<String> technologies) {
    public Application {
      technologies = (technologies == null ? List.<String>of() : technologies).stream().sorted().toList();
    }
  }

  public record GraphNode(String id, NodeType type, String name, Map<String, String> attributes,
                          SourceLocation source, Confidence confidence, List<AnalysisEvidence> evidence)
      implements Comparable<GraphNode> {
    public GraphNode {
      attributes = attributes == null ? Map.of() : Collections.unmodifiableMap(new TreeMap<>(attributes));
      evidence = normalizedEvidence(evidence, source, confidence);
    }

    /** Source-compatible constructor for schema 1 node producers. */
    public GraphNode(String id, NodeType type, String name, Map<String, String> attributes,
                     SourceLocation source, Confidence confidence) {
      this(id, type, name, attributes, source, confidence, List.of());
    }

    @Override public int compareTo(GraphNode other) { return id.compareTo(other.id); }
  }

  public record Relationship(String id, EdgeType type, String from, String to, Confidence confidence,
                             SourceLocation source, List<AnalysisEvidence> evidence)
      implements Comparable<Relationship> {
    public Relationship {
      evidence = normalizedEvidence(evidence, source, confidence);
    }

    /** Source-compatible constructor for schema 1 relationship producers. */
    public Relationship(String id, EdgeType type, String from, String to, Confidence confidence,
                        SourceLocation source) {
      this(id, type, from, to, confidence, source, List.of());
    }

    @Override public int compareTo(Relationship other) { return id.compareTo(other.id); }
  }

  public record Diagnostic(String message, Confidence confidence, SourceLocation source, String code,
                           List<AnalysisEvidence> evidence) implements Comparable<Diagnostic> {
    public Diagnostic {
      code = code == null || code.isBlank() ? "ANALYSIS_DIAGNOSTIC" : code;
      evidence = normalizedEvidence(evidence, source, confidence);
    }

    /** Source-compatible constructor for schema 1 diagnostic producers. */
    public Diagnostic(String message, Confidence confidence, SourceLocation source) {
      this(message, confidence, source, "ANALYSIS_DIAGNOSTIC", List.of());
    }

    @Override public int compareTo(Diagnostic other) { return message.compareTo(other.message); }
  }

  public record AnalysisEvidence(SourceLocation source, String parser, ResolutionStatus resolution,
                                 String detail) implements Comparable<AnalysisEvidence> {
    public AnalysisEvidence {
      parser = parser == null || parser.isBlank() ? "UNKNOWN" : parser;
      resolution = resolution == null ? ResolutionStatus.UNRESOLVED : resolution;
    }

    @Override public int compareTo(AnalysisEvidence other) {
      String thisSource = source == null ? "" : source.file() + ":" + source.line();
      String otherSource = other.source == null ? "" : other.source.file() + ":" + other.source.line();
      return (thisSource + parser + resolution + Objects.toString(detail, "")).compareTo(otherSource + other.parser + other.resolution + Objects.toString(other.detail, ""));
    }
  }

  public record SourceLocation(String file, int line) { }

  /** Static request/response contract for an {@link NodeType#ENDPOINT}. */
  public record ApiContract(String endpointId, Request request, List<Response> responses,
                            SourceLocation source, Confidence confidence) implements Comparable<ApiContract> {
    public ApiContract {
      responses = sorted(responses);
    }

    @Override public int compareTo(ApiContract other) { return endpointId.compareTo(other.endpointId); }
  }

  public record Request(String contentType, String bodyType, List<Field> fields) {
    public Request { fields = sorted(fields); }
  }

  public record Response(String status, String contentType, String bodyType, List<Field> fields,
                         SourceLocation source, Confidence confidence) implements Comparable<Response> {
    public Response { fields = sorted(fields); }

    @Override public int compareTo(Response other) { return status.compareTo(other.status); }
  }

  /** A request parameter or statically discoverable DTO property. */
  public record Field(String name, String type, String location, boolean required,
                      SourceLocation source, Confidence confidence) implements Comparable<Field> {
    @Override public int compareTo(Field other) { return (location + ":" + name).compareTo(other.location + ":" + other.name); }
  }

  public enum ComponentKind {
    BUTTON, LINK, SUBMIT, TEXT_INPUT, TEXTAREA, SELECT, CHECKBOX, RADIO, DATE_PICKER,
    FILE_INPUT, MULTI_SELECT, FORM, MODAL, TABLE, OTHER
  }
  public enum BehaviorType {
    NAVIGATE, SUBMIT_FORM, CALL_API, OPEN_DIALOG, VALIDATE, UI_STATE_CHANGE, SELECT_CHANGE, UNKNOWN
  }
  /** Framework names are retained in evidence detail, never in this classification. */
  public enum ValidationLayer { MARKUP, CLIENT, SERVER }

  public record Behavior(String id, String triggerId, String event, BehaviorType type, String targetId,
                         String guard, String parentId, String expression, List<AnalysisEvidence> evidence)
      implements Comparable<Behavior> {
    public Behavior { evidence = sorted(evidence); }
    @Override public int compareTo(Behavior other) { return id.compareTo(other.id); }
  }

  public record ValidationRule(String id, String kind, List<String> fields, String message,
                               ValidationLayer layer, Map<String, String> parameters,
                               List<AnalysisEvidence> evidence) implements Comparable<ValidationRule> {
    public ValidationRule {
      fields = sorted(fields);
      parameters = parameters == null ? Map.of() : Collections.unmodifiableMap(new TreeMap<>(parameters));
      evidence = sorted(evidence);
    }
    @Override public int compareTo(ValidationRule other) { return id.compareTo(other.id); }
  }

  public enum NodeType {
    SCREEN, ENDPOINT, HANDLER, COMPONENT, VIEW,
    ENTRY_POINT, FORM_MODEL, TEMPLATE_FRAGMENT, INTEGRATION, SOURCE_ARTIFACT
  }

  public enum EdgeType {
    HANDLED_BY, RENDERS, CONTAINS, TRIGGERS, NAVIGATES_TO,
    INCLUDES, BINDS_TO, FORWARDS_TO, CALLS, DECLARED_BY, DEFINED_IN
  }

  /** Legacy aggregate confidence retained for schema-1 clients. */
  public enum Confidence {
    CONFIRMED, INFERRED, AMBIGUOUS, UNRESOLVED;

    public ResolutionStatus resolutionStatus() {
      return ResolutionStatus.valueOf(name());
    }
  }

  public enum ResolutionStatus { CONFIRMED, INFERRED, AMBIGUOUS, UNRESOLVED }

  private static List<AnalysisEvidence> normalizedEvidence(List<AnalysisEvidence> evidence,
                                                            SourceLocation source, Confidence confidence) {
    List<AnalysisEvidence> values = new ArrayList<>(evidence == null ? List.of() : evidence);
    if (values.isEmpty() && source != null) {
      values.add(new AnalysisEvidence(source, "LEGACY", confidence == null
          ? ResolutionStatus.INFERRED : confidence.resolutionStatus(), null));
    }
    Collections.sort(values);
    return List.copyOf(values);
  }
}
