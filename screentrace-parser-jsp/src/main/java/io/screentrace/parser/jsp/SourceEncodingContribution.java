package io.screentrace.parser.jsp;
import io.screentrace.core.ApplicationGraph;import io.screentrace.core.ApplicationGraph.*;import io.screentrace.scanner.ProjectScanner.ProjectInventory;import io.screentrace.scanner.SafeProjectFiles;import java.util.*;
/** Declared byte decoding metadata; no statistical charset detection.
 * A declaration that cannot be applied stays UNRESOLVED and the source is read as UTF-8, never skipped. */
final class SourceEncodingContribution {
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory){List<GraphNode> nodes=new ArrayList<>();List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  for(var n:graph.nodes()){String view=n.attributes().get("view");if(view==null||n.attributes().containsKey("sourceEncoding")){nodes.add(n);continue;}try{var file=inventory.root().resolve(view);byte[] bytes=SafeProjectFiles.readBytesLimited(inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES);String problem=SafeProjectFiles.decodingProblem(file,bytes);
   if(problem!=null){var location=new SourceLocation(view,1);var attrs=new TreeMap<>(n.attributes());attrs.put("sourceEncoding","UNRESOLVED");var proof=new ArrayList<>(n.evidence());proof.add(new AnalysisEvidence(location,"SourceEncoding",ResolutionStatus.UNRESOLVED,problem+"；以 UTF-8 讀取，文字可能不正確"));nodes.add(new GraphNode(n.id(),n.type(),n.name(),attrs,n.source(),n.confidence(),proof));diagnostics.add(new Diagnostic("來源編碼無法套用："+problem,Confidence.UNRESOLVED,location,"SOURCE_ENCODING_UNRESOLVED",List.of()));continue;}
   String encoding=SafeProjectFiles.declaredEncoding(file,bytes);if(encoding.equals("UTF-8")){nodes.add(n);continue;}var attrs=new TreeMap<>(n.attributes());attrs.put("sourceEncoding",encoding);var proof=new ArrayList<>(n.evidence());proof.add(new AnalysisEvidence(new SourceLocation(view,1),"SourceEncoding",ResolutionStatus.CONFIRMED,"來源 pageEncoding="+encoding+"；僅解碼，不改寫原始位元組"));nodes.add(new GraphNode(n.id(),n.type(),n.name(),attrs,n.source(),n.confidence(),proof));}catch(Exception ignored){nodes.add(n);}}
  return new ApplicationGraph(graph.application(),nodes,graph.relationships(),diagnostics.stream().distinct().toList(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
}
