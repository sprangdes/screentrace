package io.screentrace.scanner;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import java.nio.charset.Charset;import static org.junit.jupiter.api.Assertions.*;
class DeclaredSourceEncodingTest {
 @TempDir Path root;
 @Test void sourceDeclarationDecodesWithoutChangingBytes()throws Exception{var p=root.resolve("legacy.jsp");var original="<%@ page pageEncoding=\"GB18030\"%><title>物料</title>".getBytes(Charset.forName("GB18030"));Files.write(p,original);assertTrue(SafeProjectFiles.readUtf8Limited(root,p,1024).contains("物料"));assertArrayEquals(original,Files.readAllBytes(p));}
 @Test void unknownDeclarationIsNotSilentlyGuessed()throws Exception{var p=root.resolve("bad.jsp");Files.writeString(p,"<%@ page pageEncoding=\"made-up\"%>text");assertThrows(java.io.IOException.class,()->SafeProjectFiles.readUtf8Limited(root,p,1024));}
}
