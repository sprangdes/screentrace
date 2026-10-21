package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;import java.nio.file.*;import org.junit.jupiter.api.Test;
class ParsedJavaUnitsTest {
 @Test void eachFileIsReadAndParsedOnceAndFailuresRepeat() throws Exception {var root=Files.createTempDirectory("parsed-units").toRealPath();var good=root.resolve("A.java");var bad=root.resolve("B.java");Files.writeString(good,"class A {}");Files.writeString(bad,"class B {");var units=new ParsedJavaUnits(root);
  var first=units.parse(good);Files.writeString(good,"class Changed {}");assertSame(first,units.parse(good));assertEquals("A",first.getType(0).getNameAsString());
  var error=assertThrows(RuntimeException.class,()->units.parse(bad));assertSame(error,assertThrows(RuntimeException.class,()->units.parse(bad)));
  var missing=assertThrows(java.io.IOException.class,()->units.parse(root.resolve("Missing.java")));assertEquals(missing.getMessage(),assertThrows(java.io.IOException.class,()->units.parse(root.resolve("Missing.java"))).getMessage());}
}
