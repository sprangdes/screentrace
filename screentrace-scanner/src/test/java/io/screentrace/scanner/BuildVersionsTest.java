package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** Declared Maven versions, with ${property} references resolved from the project's own POMs. */
class BuildVersionsTest {
  private static ProjectScanner.ProjectInventory project(String pom) throws Exception {
    Path root = Files.createTempDirectory("st-build-versions");
    Files.writeString(root.resolve("pom.xml"), pom);
    return new ProjectScanner().scan(root);
  }

  @Test void dependencyVersionResolvesProperties() throws Exception {
    // RawSanj/spring-tiles-sample-app
    var inventory = project("<project><properties><org.springframework.version>4.0.2.RELEASE</org.springframework.version><spring.security.version>3.2.3.RELEASE</spring.security.version></properties>"
        + "<dependencies><dependency><artifactId>spring-webmvc</artifactId><version>${org.springframework.version}</version></dependency>"
        + "<dependency><artifactId>spring-security-config</artifactId><version>${spring.security.version}</version></dependency></dependencies></project>");
    var mvc = BuildVersions.of(inventory, "spring-webmvc").orElseThrow();
    assertEquals("4.0.2.RELEASE", mvc.version());
    assertEquals(4, mvc.majorVersion());
    assertEquals("pom.xml", mvc.file());
    assertEquals(3, BuildVersions.of(inventory, "spring-security-config").orElseThrow().majorVersion());
  }

  @Test void parentVersionCountsAndUnknownOrUnresolvedIsEmpty() throws Exception {
    var inventory = project("<project><parent><artifactId>spring-boot-starter-parent</artifactId><version>3.2.0</version></parent>"
        + "<dependencies><dependency><artifactId>spring-webmvc</artifactId></dependency><dependency><artifactId>x</artifactId><version>${missing}</version></dependency></dependencies></project>");
    assertEquals(3, BuildVersions.of(inventory, "spring-boot-starter-parent").orElseThrow().majorVersion());
    assertTrue(BuildVersions.of(inventory, "spring-webmvc").isEmpty(), "managed without a version");
    assertTrue(BuildVersions.of(inventory, "x").isEmpty(), "unresolved property");
    assertTrue(BuildVersions.of(inventory, "absent").isEmpty());
  }

  @Test void conflictingDeclarationsAreEmpty() throws Exception {
    Path root = Files.createTempDirectory("st-build-versions-conflict");
    Files.createDirectories(root.resolve("a"));
    Files.writeString(root.resolve("pom.xml"), "<project><dependencies><dependency><artifactId>spring-webmvc</artifactId><version>4.3.0</version></dependency></dependencies></project>");
    Files.writeString(root.resolve("a/pom.xml"), "<project><dependencies><dependency><artifactId>spring-webmvc</artifactId><version>6.1.0</version></dependency></dependencies></project>");
    assertTrue(BuildVersions.of(new ProjectScanner().scan(root), "spring-webmvc").isEmpty());
  }
}
