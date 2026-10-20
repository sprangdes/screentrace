package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class Batch5DtoSimulationTest {
 @TempDir Path root;
 private ApplicationGraph analyze(String getter,String serviceTail,String controllerPrefix,boolean injected)throws Exception{
  Files.writeString(root.resolve("Entity.java"),"class Entity{@Id @GeneratedValue int id;String title;public String getTitle(){return title;}public void setTitle(String title){this.title=title;}}");
  Files.writeString(root.resolve("Draft.java"),"class Draft{String caption;public String getCaption(){"+getter+"}}");
  Files.writeString(root.resolve("Repo.java"),"import org.springframework.data.jpa.repository.JpaRepository;interface Repo extends JpaRepository<Entity,Integer>{}");
  Files.writeString(root.resolve("Service.java"),"class Service{"+(injected?"@Autowired ":"")+"Repo repo;public void save(Draft draft){Entity entity=new Entity();entity.setTitle(draft.getCaption());"+serviceTail+"repo.save(entity);}public List<Entity> list(){return repo.findAll();}}");
  Files.writeString(root.resolve("Page.java"),"class Page{@Autowired Service service;String save(@ModelAttribute Draft draft){"+controllerPrefix+"service.save(draft);return \"list\";}String list(Model model){List<Entity> rows=service.list();model.addAttribute(\"rows\",rows);return \"list\";}}");
  var loc=new SourceLocation("Page.java",1);var proof=List.of(new AnalysisEvidence(loc,"Fixture",ResolutionStatus.CONFIRMED,"source"));
  List<GraphNode> nodes=new ArrayList<>();for(String method:List.of("save","list"))nodes.add(new GraphNode(method,NodeType.HANDLER,method,Map.of("class","Page","method",method),loc,Confidence.CONFIRMED,proof));nodes.add(new GraphNode("screen",NodeType.SCREEN,"list",Map.of("view","list.jsp"),loc,Confidence.CONFIRMED,proof));
  var g=new ApplicationGraph(new ApplicationGraph.Application("fixture",".",List.of()),nodes,List.of(new Relationship("render",EdgeType.RENDERS,"list","screen",Confidence.CONFIRMED,loc,proof)),List.of(),List.of(),"2.2",List.of(),List.of());
  return SpringDtoSimulation.enrich(g,new ProjectScanner().scan(root));
 }
 @Test void copiesScalarDtoFieldsAndBindsTheSameSourceRepositoryList()throws Exception{
  var graph=analyze("return caption;","","",true);var save=graph.nodes().stream().filter(n->n.id().equals("save")).findFirst().orElseThrow();assertTrue(save.attributes().getOrDefault("simulationData","").contains("\"title\":\"caption\""));assertTrue(save.evidence().stream().anyMatch(e->e.parser().equals("SpringDtoSimulation")&&e.resolution()==ResolutionStatus.INFERRED));assertTrue(graph.nodes().stream().filter(n->n.id().equals("screen")).anyMatch(n->n.attributes().getOrDefault("simulationBindings","").contains("\"model\":\"rows\"")));
 }
 @Test void transformedGetterEscapesRewritesAndUnboundServicesStayUnknown()throws Exception{
  for(var args:List.of(new String[]{"return caption.toUpperCase();","","","true"},new String[]{"return caption;","publish(draft);","","true"},new String[]{"return caption;","entity.setTitle(\"changed\");","","true"},new String[]{"return caption;","","draft=other;","true"},new String[]{"return caption;","","","false"})){
   var graph=analyze(args[0],args[1],args[2],Boolean.parseBoolean(args[3]));assertTrue(graph.nodes().stream().filter(n->n.id().equals("save")).noneMatch(n->n.attributes().containsKey("simulationData")),Arrays.toString(args));
  }
 }
}
