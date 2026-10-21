package io.screentrace.scanner;
import static org.junit.jupiter.api.Assertions.*;import java.nio.file.*;import java.util.List;import org.junit.jupiter.api.Test;
/** nbproject/project.properties is read when the inventory is built; webRoots() never rereads it. */
class WebRootSettingTest {
 @Test void configuredWebRootIsReadOncePerInventory() throws Exception {var root=Files.createTempDirectory("web-root-once");Files.createDirectories(root.resolve("nbproject"));Files.createDirectories(root.resolve("web"));Files.createDirectories(root.resolve("WebRoot"));Files.writeString(root.resolve("nbproject/project.properties"),"web.docbase.dir=web\n");
  var scanned=new ProjectScanner().scan(root);var built=new ProjectScanner.ProjectInventory(scanned.root(),scanned.files(),scanned.technologies());assertEquals(List.of("web/"),scanned.webRoots());assertEquals(List.of("web/"),built.webRoots());
  Files.writeString(root.resolve("nbproject/project.properties"),"web.docbase.dir=WebRoot\n");
  for(var inventory:List.of(scanned,built,scanned.withContextPaths(List.of("/app"),1)))assertEquals(List.of("web/"),inventory.webRoots());
  assertEquals(List.of("WebRoot/"),new ProjectScanner().scan(root).webRoots());
  Files.delete(root.resolve("nbproject/project.properties"));assertEquals(List.of("src/main/webapp/","WebContent/","WebRoot/","webapp/","web/"),new ProjectScanner().scan(root).webRoots());}
}
