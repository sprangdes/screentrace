package io.screentrace.cli;

import io.screentrace.report.ComponentLibrary;
import io.screentrace.scanner.SafeProjectFiles;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.nio.file.*;
import java.util.*;
import java.io.*;

/** Content-addressed workspace storage; paths never enter messages or payloads. */
final class LibraryStore {
 private final Path root,workspace;
 private final ObjectMapper json=new ObjectMapper();
 LibraryStore(Path workspace){this.workspace=workspace.toAbsolutePath().normalize();root=this.workspace.resolve("libraries");}
 private ObjectNode index() throws IOException {
  Files.createDirectories(workspace);SafeProjectFiles.requireWritePathWithin(workspace,root);
  if(Files.isSymbolicLink(root)||Files.isSymbolicLink(root.resolve("index.json")))throw new IOException("元件庫儲存不可使用符號連結");
  if(!Files.exists(root.resolve("index.json"))){var empty=json.createObjectNode();empty.set("entries",json.createObjectNode());empty.set("bindings",json.createObjectNode());return empty;}
  return (ObjectNode)json.readTree(SafeProjectFiles.readBytesLimited(workspace,root.resolve("index.json"),SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
 }
 private void save(ObjectNode index) throws IOException {
  Files.createDirectories(SafeProjectFiles.requireWritePathWithin(workspace,root));Path tmp=Files.createTempFile(root,"index-",".tmp");
  json.writeValue(SafeProjectFiles.requireWritePathWithin(workspace,tmp).toFile(),index);Files.move(tmp,SafeProjectFiles.requireWritePathWithin(workspace,root.resolve("index.json")),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
 }
 String importManifest(byte[] bytes,String project,boolean replace) throws IOException {
  var library=ComponentLibrary.validate(bytes);var index=index();
  var entries=(ObjectNode)index.get("entries");var bindings=(ObjectNode)index.get("bindings");
  String label=library.label(),hash=library.sha256(),key=label+"#"+hash;
  List<String> conflicts=new ArrayList<>(),affected=new ArrayList<>();
  entries.fields().forEachRemaining(e->{if(e.getValue().path("label").asText().equals(label)&&!e.getKey().equals(key))conflicts.add(e.getValue().path("sha256").asText());});
  Collections.sort(conflicts);
  if(!entries.has(key)&&!conflicts.isEmpty()){
   if(!replace)throw new IllegalArgumentException("同名稱@版本內容衝突：已儲存 SHA-256 "+String.join(",",conflicts)+"；匯入 SHA-256 "+hash+"；使用 --replace 明確更換");
  }
  if(replace)bindings.fields().forEachRemaining(e->{if(!e.getValue().asText().equals(key)&&entries.path(e.getValue().asText()).path("label").asText().equals(label))affected.add(e.getKey());});
  Files.createDirectories(SafeProjectFiles.requireWritePathWithin(workspace,root));Path file=SafeProjectFiles.requireWritePathWithin(workspace,root.resolve(hash+".json"));
  if(Files.isSymbolicLink(file))throw new IOException("元件庫儲存不可使用符號連結");
  Files.write(file,bytes);entries.set(key,json.createObjectNode().put("label",label).put("sha256",hash));
  for(String bound:affected)bindings.put(bound,key);
  if(project!=null)bindings.put(project,key);save(index);
  return (project==null?"已儲存,尚未綁定任何專案;使用 --project <名稱> 綁定":"已綁定專案")+
    (affected.isEmpty()?"":"；受影響的已綁定專案需重新產生報表："+affected.stream().sorted().map(LibraryStore::safe).reduce((a,b)->a+", "+b).orElse(""));
 }
 void unbind(String project) throws IOException {var index=index();((ObjectNode)index.get("bindings")).remove(project);save(index);}
 ComponentLibrary selected(String project) throws IOException {
  var index=index();String key=index.path("bindings").path(project).asText(null);if(key==null)return null;
  var entry=index.path("entries").path(key);String hash=entry.path("sha256").asText(),label=entry.path("label").asText();
  if(!hash.matches("[a-f0-9]{64}"))throw new IOException("元件庫索引無效");
  var file=root.resolve(hash+".json");if(Files.isSymbolicLink(file)||Files.size(file)>ComponentLibrary.MAX_BYTES)throw new IOException("元件庫儲存無效");
  var library=ComponentLibrary.validate(SafeProjectFiles.readBytesLimited(workspace,file,ComponentLibrary.MAX_BYTES));
  if(!library.sha256().equals(hash)||!library.label().equals(label))throw new IOException("元件庫內容摘要不符");return library;
 }
 String list() throws IOException {
  var index=index();List<String> rows=new ArrayList<>();
  index.path("entries").fields().forEachRemaining(e->rows.add("元件庫 "+safe(e.getValue().path("label").asText())+" SHA-256 "+e.getValue().path("sha256").asText().substring(0,12)));
  index.path("bindings").fields().forEachRemaining(e->{var entry=index.path("entries").path(e.getValue().asText());rows.add("專案 "+safe(e.getKey())+" → "+safe(entry.path("label").asText())+" SHA-256 "+entry.path("sha256").asText().substring(0,12));});
  Collections.sort(rows);return String.join("\n",rows);
 }
 static String safe(String s){
  StringBuilder out=new StringBuilder();s.codePoints().limit(300).forEach(c->{if(Character.isISOControl(c)||Character.getType(c)==Character.FORMAT||c>=0xfe00&&c<=0xfe0f||c>=0xe0100&&c<=0xe01ef||c>=0xe0000&&c<=0xe007f)out.append("\\u{").append(Integer.toHexString(c)).append('}');else out.appendCodePoint(c);});
  if(s.codePointCount(0,s.length())>300)out.append("…(已截斷)");String raw=out.toString().replace("|","\\|");int max=0,run=0;for(char c:raw.toCharArray()){run=c=='`'?run+1:0;max=Math.max(max,run);}String fence="`".repeat(max+1);return fence+" "+raw+" "+fence;
 }
}
