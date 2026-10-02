package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.StableGraphIds;
import java.util.*;

/** Source-only markup contribution. Expressions and model bindings await adapter evidence. */
public record MarkupAnalysis(List<Component> components, List<Event> events,
                             List<ValidationRule> rules, List<Behavior> behaviors) {
  public MarkupAnalysis {
    components = List.copyOf(components); events = List.copyOf(events);
    rules = rules.stream().sorted().toList(); behaviors = behaviors.stream().sorted().toList();
  }
  public record Component(String id, ComponentKind kind, String tag, Map<String,String> attributes,
                          SourceLocation source, String guard, boolean repeated, String formId,
                          String model, String field, Confidence bindingStatus) {
    public Component { attributes = Collections.unmodifiableMap(new TreeMap<>(attributes)); }
  }
  public record Event(String componentId, String event, String expression, SourceLocation source) { }
  private record Scope(String tag, String guard, boolean repeated, String formId, String model) { }
  private static final Set<String> VOID = Set.of("input", "img", "br", "hr", "meta", "link", "area", "base", "col", "embed", "param", "source", "track", "wbr");
  private static final Set<String> CONDITIONS = Set.of("c:if", "c:when", "c:otherwise", "logic:present", "logic:notpresent", "logic:equal", "logic:notequal", "logic:empty", "logic:notempty", "logic:greaterthan", "logic:lessthan");

  public static MarkupAnalysis parse(String path, String text) {
    List<Component> components = new ArrayList<>(); List<Event> events = new ArrayList<>();
    List<ValidationRule> rules = new ArrayList<>(); List<Behavior> behaviors = new ArrayList<>();
    List<Scope> stack = new ArrayList<>(); Map<String,Integer> occurrences = new HashMap<>();
    for (MarkupTag token : MarkupTag.scan(text)) {
      String tag = token.name().toLowerCase(Locale.ROOT);
      if (token.closing()) {
        for (int i = stack.size()-1; i >= 0; i--) if (stack.get(i).tag().equals(tag)) { stack.subList(i,stack.size()).clear(); break; }
        continue;
      }
      var attrs = token.attributes(); var source = new SourceLocation(path, token.line());
      String guard = stack.stream().map(Scope::guard).filter(Objects::nonNull).reduce((a,b) -> a + " && " + b).orElse(null);
      boolean repeated = stack.stream().anyMatch(Scope::repeated);
      String form = null, model = null;
      for (Scope scope : stack) if (scope.formId() != null) { form = scope.formId(); model = scope.model(); }
      String condition = CONDITIONS.contains(tag) ? condition(token) : null;
      ComponentKind kind = kind(tag, attrs);
      if (kind != null) {
        Map<String,String> identity = new TreeMap<>(attrs); identity.put("tag", tag);
        String occurrenceKey = kind + identity.toString();
        String id = StableGraphIds.component(path, kind, identity, occurrences.merge(occurrenceKey,1,Integer::sum)-1);
        if (kind == ComponentKind.FORM) { form = id; model = first(attrs,"modelattribute","commandname","name"); }
        String field = first(attrs,"path","property","name");
        components.add(new Component(id,kind,tag,attrs,source,guard,repeated,form,model,field,Confidence.UNRESOLVED));
        for (var attribute : new TreeMap<>(attrs).entrySet()) if (attribute.getKey().startsWith("on") && attribute.getKey().length()>2) {
          events.add(new Event(id,attribute.getKey().substring(2),attribute.getValue(),source));
        }
        for (String name : List.of("required","pattern","min","max","minlength","maxlength")) if (attrs.containsKey(name)) {
          rule(rules,path,id,name,attrs.get(name),source);
        }
        String type = attrs.get("type");
        if (Set.of("email","url","number","date").contains(Objects.toString(type,"").toLowerCase(Locale.ROOT))) rule(rules,path,id,type.toLowerCase(Locale.ROOT),type,source);
      }
      boolean selfClosing = token.end()>0 && text.charAt(token.end()-1)=='/';
      if (!selfClosing && !VOID.contains(tag) && !tag.startsWith("@")) {
        stack.add(new Scope(tag,condition,tag.equals("c:foreach") || tag.equals("logic:iterate"),kind==ComponentKind.FORM?form:null,kind==ComponentKind.FORM?model:null));
      }
    }
    for (Component component : components) {
      if (!"modal".equals(first(component.attributes(),"data-bs-toggle","data-toggle"))) continue;
      String selector = first(component.attributes(),"data-bs-target","data-target","href");
      List<Component> targets = components.stream().filter(c -> c.kind()==ComponentKind.MODAL && selector != null && selector.equals("#"+c.attributes().get("id"))).toList();
      Confidence status = targets.size()==1?Confidence.CONFIRMED:targets.size()>1?Confidence.AMBIGUOUS:Confidence.UNRESOLVED;
      behaviors.add(new Behavior(StableGraphIds.behavior(component.id(),"click",BehaviorType.OPEN_DIALOG,selector,0), component.id(),"click",BehaviorType.OPEN_DIALOG,
          targets.size()==1?targets.get(0).id():null,component.guard(),null,selector,List.of(evidence(component.source(),status,"彈窗標記；候選："+targets.stream().map(Component::id).toList()))));
    }
    return new MarkupAnalysis(components,events,rules,behaviors);
  }
  private static String condition(MarkupTag tag) {
    if (tag.attribute("test") != null) return tag.attribute("test");
    return tag.name() + new TreeMap<>(tag.attributes());
  }
  private static void rule(List<ValidationRule> rules,String path,String field,String kind,String value,SourceLocation source) {
    Confidence status = dynamic(value)?Confidence.UNRESOLVED:Confidence.CONFIRMED;
    rules.add(new ValidationRule(StableGraphIds.validation(path,field,kind,value,0),kind,List.of(field),null,ValidationLayer.MARKUP,
        Map.of("value",value),List.of(evidence(source,status,"HTML5 屬性："+kind))));
  }
  static boolean dynamic(String value) { return value != null && (value.contains("${") || value.contains("#{") || value.contains("<%")); }
  static AnalysisEvidence evidence(SourceLocation source,Confidence confidence,String detail) { return new AnalysisEvidence(source,"JspMarkupParser",ResolutionStatus.valueOf(confidence.name()),detail); }
  private static String first(Map<String,String> attrs,String... keys) { for(String key:keys) if(attrs.containsKey(key)) return attrs.get(key); return null; }
  static ComponentKind kind(String tag, Map<String,String> attrs) {
    if (tag.equals("dialog") || "dialog".equals(attrs.get("role")) || Arrays.asList(Objects.toString(attrs.get("class"),"").split("\\s+")).contains("modal")) return ComponentKind.MODAL;
    String local = tag.contains(":")?tag.substring(tag.indexOf(':')+1):tag;
    if (tag.contains(":") && !(tag.startsWith("html:")||tag.startsWith("form:"))) return attrs.keySet().stream().anyMatch(k->k.startsWith("on"))?ComponentKind.OTHER:null;
    return switch (local) {
      case "form" -> ComponentKind.FORM;
      case "a", "link" -> tag.equals("link")?null:ComponentKind.LINK;
      case "button", "cancel", "reset" -> "submit".equals(attrs.get("type"))?ComponentKind.SUBMIT:ComponentKind.BUTTON;
      case "submit" -> ComponentKind.SUBMIT;
      case "text", "password", "input" -> inputKind(attrs);
      case "textarea" -> ComponentKind.TEXTAREA;
      case "select" -> attrs.containsKey("multiple")?ComponentKind.MULTI_SELECT:ComponentKind.SELECT;
      case "checkbox", "checkboxes", "multibox" -> ComponentKind.CHECKBOX;
      case "radio", "radiobutton", "radiobuttons" -> ComponentKind.RADIO;
      case "file" -> ComponentKind.FILE_INPUT;
      case "hidden" -> ComponentKind.OTHER;
      case "table" -> ComponentKind.TABLE;
      default -> attrs.keySet().stream().anyMatch(k->k.startsWith("on"))?ComponentKind.OTHER:null;
    };
  }
  private static ComponentKind inputKind(Map<String,String> attrs) {
    return switch(Objects.toString(attrs.get("type"),"text").toLowerCase(Locale.ROOT)) {
      case "button", "reset" -> ComponentKind.BUTTON;
      case "submit", "image" -> ComponentKind.SUBMIT;
      case "checkbox" -> ComponentKind.CHECKBOX;
      case "radio" -> ComponentKind.RADIO;
      case "date", "datetime-local", "month", "week", "time" -> ComponentKind.DATE_PICKER;
      case "file" -> ComponentKind.FILE_INPUT;
      case "hidden" -> ComponentKind.OTHER;
      default -> ComponentKind.TEXT_INPUT;
    };
  }
}
