package io.screentrace.parser.jsp;
import io.screentrace.core.ApplicationGraph;import io.screentrace.core.ApplicationGraph.*;import io.screentrace.scanner.ProjectScanner.ProjectInventory;import io.screentrace.scanner.SafeProjectFiles;import java.util.*;
/** Declared byte decoding metadata; no statistical charset detection. */
final class SourceEncodingContribution {
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory){List<GraphNode> nodes=new ArrayList<>();
  for(var n:graph.nodes()){String view=n.attributes().get("view");if(view==null){nodes.add(n);continue;}try{var file=inventory.root().resolve(view);String encoding=SafeProjectFiles.declaredEncoding(file,SafeProjectFiles.readBytesLimited(inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES));if(encoding.equals("UTF-8")){nodes.add(n);continue;}var attrs=new TreeMap<>(n.attributes());attrs.put("sourceEncoding",encoding);var proof=new ArrayList<>(n.evidence());proof.add(new AnalysisEvidence(new SourceLocation(view,1),"SourceEncoding",ResolutionStatus.CONFIRMED,"來源 pageEncoding="+encoding+"；僅解碼，不改寫原始位元組"));nodes.add(new GraphNode(n.id(),n.type(),n.name(),attrs,n.source(),n.confidence(),proof));}catch(Exception ignored){nodes.add(n);}}
  return new ApplicationGraph(graph.application(),nodes,graph.relationships(),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
}
