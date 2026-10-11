package io.screentrace.cli;
import io.screentrace.report.ComponentLibrary;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.*;
import java.io.*;
final class LibraryCommands {
 static String run(String[] args,Path workspace) throws IOException {
  if(args.length<2)throw new IllegalArgumentException("library validate/import/list/unbind");String action=args[1],project=null;boolean replace=false;int start=action.equals("unbind")?2:3;
  for(int i=start;i<args.length;i++){if(args[i].equals("--replace")&&action.equals("import"))replace=true;else if(args[i].equals("--project")&&(action.equals("import")||action.equals("unbind"))&&i+1<args.length)project=args[++i];else throw new IllegalArgumentException("library 選項無效");}
  if(project!=null&&(project.contains("/")||project.contains("\\")||project.contains("..")))throw new IllegalArgumentException("專案名稱無效");var store=new LibraryStore(workspace);
  try {return switch(action){case "list"->{if(args.length!=2)throw new IllegalArgumentException("library list 不接受選項");yield store.list();}case "unbind"->{if(project==null)throw new IllegalArgumentException("library unbind 需要 --project");store.unbind(project);yield "已解除綁定；未匯入元件庫";}case "validate","import"->{if(args.length<3)throw new IllegalArgumentException("需要 manifest");Path file=Path.of(args[2]).toAbsolutePath().normalize();file=SafeProjectFiles.requireExistingRegularFileWithin(file.getParent(),file);if(Files.size(file)>ComponentLibrary.MAX_BYTES)throw new IllegalArgumentException("manifest 超過 5 MiB 上限");byte[] bytes=SafeProjectFiles.readBytesLimited(file.getParent(),file,ComponentLibrary.MAX_BYTES);yield action.equals("validate")?"manifest 驗證通過 "+ComponentLibrary.validate(bytes).sha256():store.importManifest(bytes,project,replace);}default->throw new IllegalArgumentException("library 指令無效");};}catch(IOException e){return "元件庫指令失敗：無法安全讀取或儲存";}
 }
}
