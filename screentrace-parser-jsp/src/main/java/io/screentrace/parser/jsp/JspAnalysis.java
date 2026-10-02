package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.util.List;

/** Framework-neutral, deterministic contribution extracted from JSP-family source artifacts. */
public record JspAnalysis(List<View> views, List<Interaction> interactions, List<Include> includes,
                          List<TilesDefinition> tilesDefinitions, List<Diagnostic> diagnostics,
                          java.util.Map<String, MarkupAnalysis> markup) {
  public JspAnalysis {
    views = List.copyOf(views);
    interactions = List.copyOf(interactions);
    includes = List.copyOf(includes);
    tilesDefinitions = List.copyOf(tilesDefinitions);
    diagnostics = List.copyOf(diagnostics);
    markup = java.util.Collections.unmodifiableMap(new java.util.TreeMap<>(markup));
  }

  public JspAnalysis(List<View> views, List<Interaction> interactions, List<Include> includes,
                     List<TilesDefinition> tilesDefinitions, List<Diagnostic> diagnostics) {
    this(views, interactions, includes, tilesDefinitions, diagnostics, java.util.Map.of());
  }

  public record View(String path, ViewKind kind, SourceLocation source) { }

  public enum ViewKind { JSP, JSPF, HTML }

  public record Interaction(String viewPath, InteractionType type, String label, String target,
                            String httpMethod, SourceLocation source, Confidence confidence,
                            boolean submitsCurrentView) { }

  /** Semantic interaction classification; presentation markup is retained separately by consumers. */
  public enum InteractionType {
    NAVIGATION, UI_STATE_CHANGE, API_TRIGGER, FORM_SUBMIT, PLACEHOLDER, ANCHOR, UNKNOWN
  }

  public record Include(String sourceViewPath, String targetPath, SourceLocation source,
                        Confidence confidence) { }

  public record TilesDefinition(String name, String template, List<TilesAttribute> attributes,
                                SourceLocation source) {
    public TilesDefinition { attributes = List.copyOf(attributes); }
  }

  public record TilesAttribute(String name, String value) { }
}
