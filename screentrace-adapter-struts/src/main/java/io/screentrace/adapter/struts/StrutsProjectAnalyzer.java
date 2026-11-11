package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsActionInheritance.*;
import static io.screentrace.adapter.struts.StrutsBehaviorProjection.*;
import static io.screentrace.adapter.struts.StrutsConfigParser.*;
import static io.screentrace.adapter.struts.StrutsInteractions.*;
import static io.screentrace.adapter.struts.StrutsMessages.*;
import static io.screentrace.adapter.struts.StrutsScreens.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsTiles.*;
import static io.screentrace.adapter.struts.StrutsValidation.*;

import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.*;
import io.screentrace.parser.jsp.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.*;
import java.nio.file.*;

/** Static Struts 1 analysis. No target bytecode or configuration plugins are loaded. */
public final class StrutsProjectAnalyzer {
  static final String PARSER = "StrutsProjectAnalyzer";

  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    State state = new State(inventory);
    inventory = state.inventory;
    var unsupported = StrutsFrameworkDetector.unsupported(inventory);
    if (unsupported.isPresent()) {
      state.diagnostics.add(unsupported.get());
      return GraphIntegrityValidator.requireAnalysis(
          UrlGraphContribution.hidePrivateLocations(state.graph()));
    }
    for (String message : inventory.diagnostics())
      state.diagnostics.add(StrutsSources.diagnostic(message, ".", 1, "SOURCE_LIMIT"));
    state.types.putAll(StrutsSources.javaTypes(inventory, state.diagnostics));
    readSpringBeans(state);
    readMessages(state);
    readServletMapping(state);
    readFacesServletMappings(state);
    JspAnalysis jsp =
        new JspProjectParser()
            .analyze(
                inventory.root(),
                inventory.files(),
                (bundle, key) -> resolveMessage(state, bundle, key));
    state.diagnostics.addAll(jsp.diagnostics());
    for (var view : jsp.views()) addView(view, state);
    readTiles(state);
    if (inventory.strutsConfigFiles().isEmpty())
      state.diagnostics.add(
          StrutsSources.diagnostic("找不到 Struts 1 設定檔", ".", 1, "STRUTS_CONFIG_MISSING"));
    for (Path config : inventory.strutsConfigFiles()) parseConfig(config, state);
    resolveConfiguredForwards(state);
    suppressActionIncludeDiagnostics(jsp, state);
    readWelcomeFiles(state);
    materializeTileScreens(state);
    markUnsupportedJsf(state, jsp);
    addInteractions(jsp, state);
    inheritActionCallers(state);
    markInheritedActionTemplates(state);
    parseValidation(state);
    parseActionForms(state);
    ApplicationGraph enriched =
        GraphIntegrityValidator.requireAnalysis(
            io.screentrace.parser.jsp.UrlGraphContribution.enrich(
                JavaScriptGraphContribution.enrich(
                    MarkupGraphContribution.enrich(
                        ActionContracts.enrich(state.graph(), inventory), jsp),
                    inventory),
                inventory));
    enriched = projectDispatchBehaviors(enriched, state);
    enriched = linkValidatorFields(enriched, state);
    return retainActionAndInlineEventEvidence(enriched, state);
  }
}
