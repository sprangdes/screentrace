package io.screentrace.report;

import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;

/** Converts source-derived graph relationships into an editable visual baseline. */
final class PrototypeModelGenerator {
  PrototypeModel generate(ApplicationGraph graph) {
    Map<String, PrototypeModel.PrototypeScreen> screens = new HashMap<>();
    for (GraphNode node : graph.nodes()) if (node.type() == NodeType.SCREEN) {
      String route=node.attributes().getOrDefault("route", ""); String id="prototype:" + node.id();
      screens.put(node.id(), new PrototypeModel.PrototypeScreen(id,node.id(),node.name(),route,screenshot(route)));
    }
    List<PrototypeModel.PrototypeComponent> components=new ArrayList<>(); int index=0;
    for (Relationship contains : graph.relationships()) if (contains.type()==EdgeType.CONTAINS && screens.containsKey(contains.from())) {
      GraphNode component=graph.nodes().stream().filter(n->n.id().equals(contains.to())).findFirst().orElse(null); if(component==null)continue;
      Relationship navigation=graph.relationships().stream().filter(r->r.type()==EdgeType.NAVIGATES_TO&&r.from().equals(component.id())).findFirst().orElse(null);
      Relationship request=graph.relationships().stream().filter(r->r.type()==EdgeType.TRIGGERS&&r.from().equals(component.id())).findFirst().orElse(null);
      String targetScreen=navigation==null?null:screens.get(navigation.to()).id(); String targetEndpoint=request==null?null:request.to();
      String type=component.attributes().getOrDefault("componentType","COMPONENT"); String action=component.attributes().getOrDefault("action","NONE");
      components.add(new PrototypeModel.PrototypeComponent("prototype:"+component.id(),screens.get(contains.from()).id(),component.id(),type,component.name(),new PrototypeModel.Bounds(32,80+(index++%6)*52,320,40),Map.of(),new PrototypeModel.PrototypeAction(action,targetScreen,targetEndpoint),component.source(),component.confidence()));
    }
    return new PrototypeModel("1",new ArrayList<>(screens.values()),components);
  }
  private static String screenshot(String route) { if(route==null||route.isBlank())return null; return "screenshots/"+(route.equals("/")?"home":route.substring(1)).replace("/","__").replaceAll("[:?=&]","_")+".png"; }
}
