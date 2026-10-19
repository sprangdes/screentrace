package io.screentrace.parser.jsp;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
/** Finite literal alternatives only. Conditions are recorded, never evaluated. */
final class ConditionalUrlTargets {
 private static final ObjectMapper JSON=new ObjectMapper();
 record Alternative(String path,String guard,int line){}
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));Map<String,String> sources=new HashMap<>();
  for(var n:graph.nodes())if(n.type()==NodeType.COMPONENT&&"FORM".equals(n.attributes().get("kind")))try {
   String file=n.source().file();String source=sources.get(file);if(source==null){source=SafeProjectFiles.readUtf8Limited(inventory.root(),inventory.root().resolve(file),SafeProjectFiles.MAX_JSP_FILE_BYTES);sources.put(file,source);}
   List<Alternative> alternatives=ternary(n.attributes().get("th:action"),n.source().line());
   if(alternatives.isEmpty())alternatives=jstl(source,n.attributes().get("action"),n.source().line(),JspProjectParser.includedWrites(inventory.root(),file,source,new HashSet<>()));
   if(alternatives.isEmpty())continue;
   var attrs=new TreeMap<>(n.attributes());attrs.put("requestAlternatives",JSON.writeValueAsString(alternatives));var proof=new ArrayList<>(n.evidence());for(var a:alternatives)proof.add(new AnalysisEvidence(new SourceLocation(file,a.line()),"ConditionalUrlTargets",ResolutionStatus.INFERRED,"有限字面路徑="+a.path()+"；條件未求值="+a.guard()));nodes.put(n.id(),new GraphNode(n.id(),n.type(),n.name(),attrs,n.source(),n.confidence(),proof));
  }catch(Exception ignored){}
  for(var n:graph.nodes())if(n.type()==NodeType.COMPONENT&&n.attributes().get("formId")!=null){var form=nodes.get(n.attributes().get("formId"));if(form!=null&&form.attributes().containsKey("requestAlternatives")&&!n.attributes().containsKey("formaction")){var attrs=new TreeMap<>(n.attributes());attrs.put("requestAlternatives",form.attributes().get("requestAlternatives"));var proof=new ArrayList<>(n.evidence());proof.addAll(form.evidence().stream().filter(e->e.parser().equals("ConditionalUrlTargets")).toList());nodes.put(n.id(),new GraphNode(n.id(),n.type(),n.name(),attrs,n.source(),n.confidence(),proof));}}
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),graph.relationships(),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
 static List<Alternative> ternary(String raw,int line) {
  if(raw==null)return List.of();var condition=java.util.regex.Pattern.compile("^\\s*(\\$\\{[A-Za-z_][A-Za-z0-9_.]*})\\s*\\?\\s*").matcher(raw);if(!condition.find())return List.of();int start=condition.end(),depth=0,end=-1;
  for(int i=start;i<raw.length();i++){char c=raw.charAt(i);if(c=='{')depth++;if(c=='}'&&--depth==0){end=i+1;break;}}
  if(end<0)return List.of();String tail=raw.substring(end).strip();if(!tail.startsWith(":"))return List.of();String yes=ThymeleafMarkup.url(raw.substring(start,end)),no=ThymeleafMarkup.url(tail.substring(1).strip());
  if(yes==null||no==null)return List.of();return List.of(new Alternative(yes,condition.group(1),line),new Alternative(no,"!("+condition.group(1)+")",line));
 }
 static List<Alternative> jstl(String source,String raw,int line,Set<String> includedWrites) {
  if(raw==null||includedWrites.contains("*")||source.replaceAll("(?s)<%--.*?--%>|<%@.*?%>","").contains("<%"))return List.of();
  var nested=MarkupTag.scan(raw);if(nested.size()==1&&Set.of("c:url","spring:url").contains(nested.get(0).name()))raw=nested.get(0).attribute("value");
  if(raw==null||!raw.matches("\\$\\{[A-Za-z_][A-Za-z0-9_]*}"))return List.of();String variable=raw.substring(2,raw.length()-1);if(includedWrites.contains(variable))return List.of();
  for(var token:MarkupTag.scan(source))if(token.line()<line&&token.name().contains(":")&&!token.name().startsWith("html:")&&!Set.of("c:set","c:choose","c:when","c:otherwise","c:if","c:url","c:param","spring:url","spring:param").contains(token.name()))return List.of();
  List<MarkupTag> stack=new ArrayList<>(),writes=new ArrayList<>();Map<Integer,List<MarkupTag>> ancestry=new HashMap<>();Map<Integer,Integer> closes=new HashMap<>();var tokens=MarkupTag.scan(source);
  for(var t:tokens){if(t.closing()){for(int i=stack.size()-1;i>=0;i--)if(stack.get(i).name().equals(t.name())){closes.put(stack.get(i).start(),t.end());stack.subList(i,stack.size()).clear();break;}continue;}
   if(variable.equals(t.attribute("var"))){if(!t.name().equals("c:set")||t.attribute("scope")!=null&&!t.attribute("scope").equals("page")||t.attribute("value")==null||!t.attribute("value").matches("/[A-Za-z0-9_./-]*")||source.charAt(t.end()-1)!='/')return List.of();writes.add(t);ancestry.put(t.start(),List.copyOf(stack));}
   if(t.name().equals("c:remove")&&variable.equals(t.attribute("var")))return List.of();
   if(source.charAt(t.end()-1)!='/'&&!Set.of("input","link","meta","img","br","hr").contains(t.name()))stack.add(t);
  }
  if(writes.size()<3||writes.size()>18||writes.stream().anyMatch(t->t.line()>=line))return List.of();
  var initial=writes.get(0);if(ancestry.get(initial.start()).stream().anyMatch(t->t.name().contains(":")&&!t.name().startsWith("html:")))return List.of();
  MarkupTag choose=null;List<Alternative> result=new ArrayList<>();Set<Integer> branches=new HashSet<>();boolean otherwise=false;
  for(var write:writes.subList(1,writes.size())){var parents=ancestry.get(write.start());if(parents.size()<2)return List.of();var branch=parents.get(parents.size()-1);var parent=parents.get(parents.size()-2);
   if(!Set.of("c:when","c:otherwise").contains(branch.name())||!parent.name().equals("c:choose")||!branches.add(branch.start())||choose!=null&&choose.start()!=parent.start())return List.of();choose=parent;
   if(!parents.subList(0,parents.size()-2).equals(ancestry.get(initial.start()))||otherwise)return List.of();
   if(branch.name().equals("c:when")&&branch.attribute("test")==null)return List.of();otherwise|=branch.name().equals("c:otherwise");result.add(new Alternative(write.attribute("value"),branch.name().equals("c:otherwise")?"otherwise":branch.attribute("test"),write.line()));
  }
  if(choose==null||!otherwise||closes.getOrDefault(choose.start(),Integer.MAX_VALUE)>=tokens.stream().filter(t->t.line()==line).mapToInt(MarkupTag::start).min().orElse(0))return List.of();
  int begin=choose.start(),end=closes.get(choose.start());for(var t:tokens)if(t.start()>begin&&t.end()<end&&!Set.of("c:when","c:otherwise","c:set").contains(t.name()))return List.of();
  long branchCount=tokens.stream().filter(t->!t.closing()&&t.start()>begin&&t.end()<end&&Set.of("c:when","c:otherwise").contains(t.name())).count();if(branchCount!=branches.size())return List.of();return result;
 }
}
