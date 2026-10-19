package io.screentrace.parser.jsp;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.util.*;
/** Inert resource references, separate from interactive controls. No resource is fetched. */
final class ResourceGraphContribution {
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  for(var file:inventory.files()) {
   String path=inventory.root().relativize(file).toString().replace('\\','/');if(!path.matches(".*\\.(jsp|jspf|html|htm)$"))continue;
   try {String source=ThymeleafMarkup.normalize(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_JSP_FILE_BYTES));int ordinal=0;
    for(var tag:MarkupTag.scan(source))if(!tag.closing()&&tag.name().equalsIgnoreCase("link")&&"stylesheet".equalsIgnoreCase(tag.attribute("rel"))&&tag.attribute("href")!=null){
     var location=new SourceLocation(path,tag.line());var attrs=new TreeMap<>(tag.attributes());attrs.put("kind","STATIC_RESOURCE_REFERENCE");attrs.put("tag","link");attrs.put("ownerFile",path);String href=tag.attribute("href");var status=MarkupAnalysis.dynamic(href)?Confidence.UNRESOLVED:Confidence.INFERRED;
     String id=ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,path+":stylesheet:"+ordinal++);var proof=List.of(new AnalysisEvidence(location,"StaticResourceParser",status.resolutionStatus(),"來源樣式參照；原始="+Objects.toString(tag.attribute("th:href"),href)+"；投影="+href+"；未抓取外部資源"));
     nodes.put(id,new GraphNode(id,NodeType.SOURCE_ARTIFACT,href,attrs,location,status,proof));
     for(var screen:graph.nodes())if(screen.type()==NodeType.SCREEN&&path.equals(screen.attributes().get("view"))){String edge=ApplicationGraph.id(NodeType.SOURCE_ARTIFACT,screen.id()+":"+id);edges.put(edge,new Relationship(edge,EdgeType.DECLARED_BY,screen.id(),id,status,location,proof));}
    }
   }catch(Exception error){diagnostics.add(new Diagnostic("資源參照無法解析",Confidence.UNRESOLVED,new SourceLocation(path,1),"RESOURCE_REFERENCE_UNRESOLVED",List.of()));}
  }
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
}
