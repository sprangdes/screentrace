package io.screentrace.scanner;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class ReservedEvidenceNameTest {
 @TempDir Path root;
 @Test void reservedTargetNamesCannotImpersonateWorkspaceEvidence() throws Exception {var file=root.resolve("workspace:config.json");Files.writeString(file,"{} ");assertThrows(java.io.IOException.class,()->SafeProjectFiles.readUtf8Limited(root,file,1024));assertFalse(new ProjectScanner().scan(root).files().contains(file));}
}
