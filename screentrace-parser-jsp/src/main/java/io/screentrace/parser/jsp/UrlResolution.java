package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.util.*;
import java.io.StringReader;
import java.util.regex.Pattern;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/** Deterministic shared request matching; no runtime or deployment assumptions. */
public final class UrlResolution {
 private UrlResolution() { }
 public record Endpoint(String id,String path,String method,List<AnalysisEvidence> evidence) { }
 public record ContextValue(String value,SourceLocation source) { }
 /** Whether /path/ also matches a /path mapping, and the setting or Spring version that says so. */
 public record TrailingSlash(boolean match,AnalysisEvidence evidence) { }
 public record Context(List<ContextValue> values,List<String> diagnostics,TrailingSlash trailingSlash) {
  public Context(List<ContextValue> values,List<String> diagnostics){this(values,diagnostics,null);}
  public Context {values=values.stream().distinct().sorted(Comparator.comparing(ContextValue::value).thenComparing(v->v.source().file()).thenComparingInt(v->v.source().line())).toList();diagnostics=diagnostics.stream().distinct().sorted().toList();}
 }
 public record Result(Confidence confidence,List<String> candidates,List<String> paths,List<String> diagnostics,List<AnalysisEvidence> evidence) { }
 public static Context context(ProjectInventory inventory,List<ContextValue> workspace) {
  List<ContextValue> values=new ArrayList<>();List<String> diagnostics=new ArrayList<>();for(var value:workspace)add(values,diagnostics,value.value(),value.source().file(),value.source().line());for(String value:inventory.contextPaths())add(values,diagnostics,value,inventory.contextSettingsFile(),inventory.contextSettingsLine());
  for(var file:inventory.files()) {
   String name=file.getFileName().toString();if(!name.matches("application(?:-[^.]+)?\\.(?:properties|ya?ml)"))continue;
   String relative=inventory.root().relativize(file).toString().replace('\\','/');
   try {
    String text=SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
    if(name.endsWith(".properties")){Properties properties=new Properties();properties.load(new StringReader(text));if(properties.containsKey("server.servlet.context-path"))add(values,diagnostics,properties.getProperty("server.servlet.context-path"),relative,line(text,"server.servlet.context-path"));}
    else {LoaderOptions options=new LoaderOptions();options.setAllowDuplicateKeys(false);options.setMaxAliasesForCollections(20);options.setNestingDepthLimit(40);options.setCodePointLimit((int)SafeProjectFiles.MAX_SOURCE_FILE_BYTES);Yaml yaml=new Yaml(new SafeConstructor(options));for(Object document:yaml.loadAll(text)){Object value=at(document,"server","servlet","context-path");if(value==null&&document instanceof Map<?,?> map)value=map.get("server.servlet.context-path");if(value!=null)add(values,diagnostics,value,relative,line(text,"context-path"));}}
   }catch(Exception error){diagnostics.add("CONTEXT_CONFIG_UNRESOLVED:"+relative);}
  }
  return new Context(values,diagnostics,trailingSlash(inventory));
 }
 private static Object at(Object object,String... keys){for(String key:keys){if(!(object instanceof Map<?,?> map))return null;object=map.get(key);}return object;}
 private static int line(String text,String key){int offset=text.indexOf(key);return offset<0?1:1+(int)text.substring(0,offset).chars().filter(c->c=='\n').count();}
 private static void add(List<ContextValue> values,List<String> diagnostics,Object raw,String file,int line){if(raw instanceof String value&&(value.isEmpty()||value.startsWith("/"))&&!value.contains("$")&&!value.contains("{")&&!value.contains("..")&&!value.contains("?")&&!value.contains("#")&&!value.startsWith("//")){values.add(new ContextValue(value.equals("/")?"":value.replaceFirst("/$",""),new SourceLocation(file,line)));}else diagnostics.add("CONTEXT_CONFIG_UNRESOLVED:"+file);}
 public static Result resolve(String raw,String method,Context context,List<Endpoint> endpoints,boolean provenContext){return resolve(raw,method,context,endpoints,List.of(),provenContext);}
 public static Result resolve(String raw,String method,Context context,List<Endpoint> endpoints,List<String> extensionMappings,boolean provenContext) {
  TreeSet<String> paths=new TreeSet<>(),candidates=new TreeSet<>(),diagnostics=new TreeSet<>(context.diagnostics());List<AnalysisEvidence> evidence=new ArrayList<>();
  String allValues=context.values().stream().map(ContextValue::value).distinct().sorted().toList().toString();
  for(var v:context.values())evidence.add(new AnalysisEvidence(v.source(),"UrlResolution",ResolutionStatus.CONFIRMED,"設定鍵="+(v.source().file().startsWith("workspace:")?"contextPaths":"server.servlet.context-path")+"；候選值="+allValues+"；採用值="+(context.values().stream().map(ContextValue::value).distinct().count()>1?"未定（多候選）":v.value())));
  if(context.values().isEmpty())evidence.add(new AnalysisEvidence(new SourceLocation(".",1),"UrlResolution",ResolutionStatus.UNRESOLVED,"來源=未設定；候選值=[]；採用值=未設定"));
  var contexts=context.values().stream().map(ContextValue::value).distinct().toList();if(contexts.isEmpty())diagnostics.add("CONTEXT_PATH_UNSPECIFIED");
  if(raw==null||raw.startsWith("//")||raw.matches("^[A-Za-z][A-Za-z0-9+.-]*:.*")||raw.contains("<%"))return result(Confidence.UNRESOLVED,candidates,paths,diagnostics,evidence);
  String path=raw.split("[?#]",2)[0].replaceAll("(?i);jsessionid=[^/;]*","");
  if(path.startsWith("${"))path=path.replaceFirst("^\\$\\{","{");
  if(path.startsWith("{")){int end=path.indexOf('}');if(!provenContext||end<0||contexts.isEmpty())return result(Confidence.UNRESOLVED,candidates,paths,diagnostics,evidence);path=path.substring(end+1);paths.add(path);}
  else {if(contexts.isEmpty())paths.add(path);for(var value:context.values()){String prefix=value.value();paths.add(!prefix.isEmpty()&&(path.equals(prefix)||path.startsWith(prefix+"/"))?path.substring(prefix.length()):path);}}
  if(paths.stream().anyMatch(p->!p.startsWith("/")||Arrays.asList(p.split("/")).contains("..")||p.contains("\\")))return result(Confidence.UNRESOLVED,new TreeSet<>(),paths,diagnostics,evidence);
  boolean inferred=false,pathMatched=false;
  for(int pass=0;pass<2&&candidates.isEmpty()&&!pathMatched;pass++){
  // Spring MVC before 6 also maps /path/ to /path (useTrailingSlashMatch); only tried when nothing matched exactly.
  Set<String> attempt=pass==0?paths:withoutTrailingSlash(paths,context);if(attempt.isEmpty())break;
  for(String normalized:attempt)for(Endpoint endpoint:endpoints){int match=match(normalized.isEmpty()?"/":normalized,endpoint.path(),extensionMappings);if(match==0)continue;pathMatched=true;if(!compatible(method==null?"GET":method,endpoint.method()))continue;candidates.add(endpoint.id());inferred|=match==1;for(var proof:endpoint.evidence())evidence.add(proof.detail()==null?new AnalysisEvidence(proof.source(),proof.parser(),proof.resolution(),"對應端點="+endpoint.id()):proof);}
  if(pass==1&&!candidates.isEmpty()){inferred=true;evidence.add(context.trailingSlash().evidence());}
  }
  if(candidates.isEmpty())diagnostics.add(pathMatched?"URL_METHOD_MISMATCH":"URL_UNRESOLVED");
  Confidence confidence=candidates.isEmpty()?Confidence.UNRESOLVED:candidates.size()>1||contexts.size()>1?Confidence.AMBIGUOUS:inferred?Confidence.INFERRED:Confidence.CONFIRMED;
  return result(confidence,candidates,paths,diagnostics,evidence);
 }
 private static Set<String> withoutTrailingSlash(Set<String> paths,Context context) {
  if(context.trailingSlash()==null||!context.trailingSlash().match())return Set.of();
  Set<String> result=new TreeSet<>();for(String path:paths)if(path.length()>1&&path.endsWith("/"))result.add(path.replaceAll("/+$",""));return result;
 }
 /** An explicit setUseTrailingSlashMatch / mvc:path-matching setting wins; otherwise the declared Spring generation's default. */
 static TrailingSlash trailingSlash(ProjectInventory inventory) {
  Set<Boolean> explicit=new TreeSet<>();AnalysisEvidence explicitProof=null;
  for(var file:inventory.files()) {
   String name=file.getFileName().toString(),relative=inventory.root().relativize(file).toString().replace('\\','/');
   if(!name.endsWith(".java")&&!name.endsWith(".xml"))continue;
   try {
    String text=SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
    if(name.endsWith(".java")&&text.contains("setUseTrailingSlashMatch")) {
     for(var call:JavaSources.parse(text).findAll(com.github.javaparser.ast.expr.MethodCallExpr.class))
      if(call.getNameAsString().equals("setUseTrailingSlashMatch")&&call.getArguments().size()==1&&call.getArgument(0).isBooleanLiteralExpr()) {
       boolean value=call.getArgument(0).asBooleanLiteralExpr().getValue();explicit.add(value);
       explicitProof=new AnalysisEvidence(new SourceLocation(relative,call.getBegin().map(p->p.line).orElse(1)),"UrlResolution",ResolutionStatus.CONFIRMED,"setUseTrailingSlashMatch("+value+")");
      }
    } else if(name.endsWith(".xml")&&text.contains("path-matching")) {
     for(MarkupTag tag:MarkupTag.scan(text))if(!tag.closing()&&tag.name().replaceFirst("^.*:","").equals("path-matching")&&tag.attribute("trailing-slash")!=null) {
      boolean value=Boolean.parseBoolean(tag.attribute("trailing-slash").trim());explicit.add(value);
      explicitProof=new AnalysisEvidence(new SourceLocation(relative,tag.line()),"UrlResolution",ResolutionStatus.CONFIRMED,"mvc:path-matching trailing-slash="+value);
     }
    }
   }catch(Exception ignored){/* Unreadable or unparsable sources set nothing. */}
  }
  if(explicit.size()==1)return new TrailingSlash(explicit.iterator().next(),explicitProof);
  if(explicit.size()>1)return null;
  var mvc=io.screentrace.scanner.BuildVersions.of(inventory,"spring-webmvc");
  if(mvc.isPresent())return generation(mvc.get(),mvc.get().majorVersion()<6,"Spring MVC");
  for(String boot:List.of("spring-boot-starter-parent","spring-boot-dependencies","spring-boot-starter-web")) {
   var declared=io.screentrace.scanner.BuildVersions.of(inventory,boot);
   if(declared.isPresent())return generation(declared.get(),declared.get().majorVersion()<3,"Spring Boot");
  }
  return null;
 }
 private static TrailingSlash generation(io.screentrace.scanner.BuildVersions.Declared declared,boolean match,String framework) {
  return new TrailingSlash(match,new AnalysisEvidence(new SourceLocation(declared.file(),1),"UrlResolution",ResolutionStatus.INFERRED,
   framework+" "+declared.version()+" 預設 useTrailingSlashMatch="+match+"（Spring Framework 6 起預設 false）"));
 }
 private static Result result(Confidence confidence,Set<String> candidates,Set<String> paths,Set<String> diagnostics,List<AnalysisEvidence> evidence){return new Result(confidence,List.copyOf(candidates),List.copyOf(paths),List.copyOf(diagnostics),evidence.stream().distinct().sorted().toList());}
 private static boolean compatible(String requested,String actual){return !"UNKNOWN".equals(requested)&&("ANY".equals(actual)||Objects.equals(requested,actual)||Arrays.asList(Objects.toString(actual,"").split("[,| ]+")).contains(requested));}
 private static int match(String path,String endpoint,List<String> extensions){if(path.equals(endpoint))return path.contains("{")||path.contains("*")?1:2;StringBuilder regex=new StringBuilder("^");for(int i=0;i<endpoint.length();i++){char c=endpoint.charAt(i);if(c=='{'){int end=endpoint.indexOf('}',i);if(end<0)return 0;regex.append("[^/]+");i=end;}else if(c=='*'){if(i+1<endpoint.length()&&endpoint.charAt(i+1)=='*'){regex.append(".*");i++;}else regex.append("[^/]*");}else regex.append(Pattern.quote(String.valueOf(c)));}if(path.matches(regex.append('$').toString()))return 1;for(String mapping:extensions)if(mapping.startsWith("*.")&&path.endsWith(mapping.substring(1))&&path.substring(0,path.length()-mapping.length()+1).equals(endpoint))return 1;return 0;}
}
