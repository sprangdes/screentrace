package io.screentrace.report;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.networknt.schema.*;
import java.security.*;
import java.util.*;
/** Library data stays outside the framework-neutral graph. Only a bundled schema is loaded. */
public record ComponentLibrary(JsonNode manifest,String sha256) {
 public static final int MAX_BYTES=5*1024*1024;
 public static ComponentLibrary validate(byte[] bytes) {
  if(bytes.length>MAX_BYTES)throw new IllegalArgumentException("manifest 超過 5 MiB 上限");
  try(var in=ComponentLibrary.class.getResourceAsStream("/schemas/component-library.schema.json")){
   var mapper=new ObjectMapper(com.fasterxml.jackson.core.JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build());var data=mapper.readTree(bytes);
   checkPrivacy(data,"$");
   var schema=JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(mapper.readTree(in));
   var errors=schema.validate(data);if(!errors.isEmpty())throw new IllegalArgumentException(errors.stream().map(Object::toString).sorted().reduce((a,b)->a+"; "+b).orElse("無效 manifest"));
   Set<String> ids=new HashSet<>();for(var c:data.path("components"))if(!ids.add(c.path("id").asText()))throw new IllegalArgumentException("$.components: 元件 ID 重複");
   checkPrivacy(data,"$");return new ComponentLibrary(data,HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
  }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("manifest JSON 解析／驗證失敗");}
 }
 private static void checkPrivacy(JsonNode node,String path){
  if(node.isTextual()){
   String s=node.asText(),home=System.getProperty("user.home","");
   // Public documentation URLs are data; their path segments are not local paths.
   String nonUrls=s.replaceAll("https?://[^\\s\"'<>]+","[URL]");
   if((!home.isEmpty()&&s.contains(home))||nonUrls.matches("(?s).*(?:/Users/|/home/|file:/|(?<![A-Za-z0-9])[A-Za-z]:[\\\\/]).*"))
    throw new IllegalArgumentException(path+": 不允許本機絕對路徑／家目錄");
  }else if(node.isObject())node.fields().forEachRemaining(e->{checkPrivacy(new com.fasterxml.jackson.databind.node.TextNode(e.getKey()),"$");checkPrivacy(e.getValue(),path+"."+e.getKey());});
  else if(node.isArray())for(int i=0;i<node.size();i++)checkPrivacy(node.get(i),path+"["+i+"]");
 }
 public String label(){return manifest.path("library").path("name").asText()+"@"+manifest.path("library").path("version").asText();}
}
