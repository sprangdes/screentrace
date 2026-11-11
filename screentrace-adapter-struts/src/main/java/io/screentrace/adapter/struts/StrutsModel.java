package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsConfigParser.*;

import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.util.*;

/** Records and mutable analysis state shared by the Struts analysis classes. */
final class StrutsModel {
  private StrutsModel() {}

  record Mapping(
      String route,
      String type,
      String handlerId,
      String formId,
      String parameter,
      String family,
      Map<String, String> forwards,
      Map<String, String> localForwards,
      Map<String, SourceLocation> forwardSources,
      String input,
      String module,
      SourceLocation source) {}

  record WildcardMatch(Mapping mapping, String path, List<String> captures) {}

  record WildcardResolution(List<WildcardMatch> candidates, boolean ambiguous) {}

  record StrutsVersionEvidence(String version, SourceLocation source, String description) {
    boolean isVersion13() {
      return version != null && version.matches("1\\.3\\.\\d+");
    }
  }

  record ActionMatch(Mapping mapping, WildcardMatch wildcard) {}

  record InheritanceTarget(String target, SourceLocation source) {}

  record PendingForward(String ownerId, String module, String target, SourceLocation source) {}

  enum ServletMappingStatus {
    PROVEN,
    AMBIGUOUS,
    UNRESOLVED
  }

  record ServletDefinition(
      String name, String servletClass, SourceLocation source, Map<String, List<String>> configs) {}

  record ServletMappingResolution(
      ServletMappingStatus status, List<ServletPattern> patterns, String owner) {}

  record ServletPattern(
      String pattern, SourceLocation source, String servletName, String servletClass) {}

  record Control(
      String id,
      String label,
      Map<String, String> attributes,
      String target,
      SourceLocation source,
      String field,
      String value,
      String formGroup) {}

  record ScreenLoadCall(String tag, String target, String module, SourceLocation source) {}

  record MessageResource(String key, String parameter) {}

  record FacesSuffixMapping(String defaultSuffix, SourceLocation source) {}

  record Tile(
      String name,
      String template,
      String parent,
      Map<String, String> puts,
      SourceLocation source) {}

  record TileScreenName(String name, String source, String path) {}

  static final class State {
    final ProjectInventory inventory;
    final StrutsVersionEvidence strutsVersion;
    final Map<String, GraphNode> nodes = new TreeMap<>();
    final Map<String, Relationship> edges = new TreeMap<>();
    final List<Diagnostic> diagnostics = new ArrayList<>();
    final Map<String, Behavior> behaviors = new TreeMap<>();
    final Map<String, ValidationRule> rules = new TreeMap<>();
    final Map<String, Set<Boolean>> forwardRedirects = new TreeMap<>();
    final Set<String> reportedForwardCycles = new HashSet<>();
    final Set<String> ambiguousBeans = new TreeSet<>();
    final Map<String, SourceLocation> beanSources = new TreeMap<>();
    final Map<String, String> screens = new TreeMap<>(),
        viewIds = new TreeMap<>(),
        tileViewIds = new TreeMap<>(),
        beans = new TreeMap<>(),
        forms = new TreeMap<>();
    final Set<String> ambiguousTiles = new TreeSet<>();
    final Map<String, Tile> tiles = new TreeMap<>();
    final Map<String, Set<String>> tileFragmentOwners = new TreeMap<>();
    final Map<String, Set<String>> jspModuleOwners = new TreeMap<>();
    final Set<String> tilePageDefinitions = new TreeSet<>(),
        tileStandaloneDefinitions = new TreeSet<>(),
        tilePageJspPaths = new TreeSet<>();
    final Map<String, Set<String>> tilePageOwners = new TreeMap<>();
    final Map<String, List<Mapping>> routes = new TreeMap<>();
    final Map<String, String> endpointIds = new TreeMap<>(), globalForwards = new TreeMap<>();
    final Map<String, Boolean> inputForward = new TreeMap<>();
    final List<Mapping> actionMappings = new ArrayList<>();
    final List<PendingForward> pendingForwards = new ArrayList<>(),
        exceptionForwards = new ArrayList<>();
    final Map<String, List<PendingForward>> actionForwardTargets = new TreeMap<>();
    final Map<String, Map<String, WildcardMatch>> wildcardMatches = new TreeMap<>();
    final Map<String, ServletMappingResolution> servletMappings = new TreeMap<>();
    final Map<String, List<FacesSuffixMapping>> facesMappings = new TreeMap<>();
    final Set<String> facesDiagnostics = new HashSet<>();
    final Map<String, StrutsSources.JavaType> types = new TreeMap<>();
    final Map<String, Set<String>> messages = new TreeMap<>();
    final Map<String, Map<String, String>> messageBundles = new TreeMap<>();
    final Map<String, String> messageBundleAliases = new TreeMap<>();
    String defaultMessageBundle;

    State(ProjectInventory inventory) {
      this.inventory =
          new ProjectInventory(
              inventory.root(),
              inventory.files().stream().sorted().toList(),
              inventory.technologies().stream().sorted().toList(),
              inventory.diagnostics().stream().sorted().toList(),
              inventory.contextPaths(),
              inventory.contextSettingsFile(),
              inventory.contextSettingsLine(),
              inventory.webRoots());
      this.strutsVersion = detectStrutsVersion(this.inventory);
    }

    ApplicationGraph graph() {
      return new ApplicationGraph(
          new Application(
              inventory.root().getFileName().toString(),
              inventory.root().toString(),
              inventory.technologies()),
          List.copyOf(nodes.values()),
          List.copyOf(edges.values()),
          diagnostics,
          List.of(),
          ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,
          List.copyOf(behaviors.values()),
          List.copyOf(rules.values()));
    }
  }
}
