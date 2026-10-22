package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Struts loads the configs web.xml names; the struts-config*.xml file-name rule is only the default. */
class StrutsConfigDiscoveryTest {
  private static final String CONFIG = "<?xml version=\"1.0\"?>\n<!DOCTYPE struts-config PUBLIC \"-//Apache Software Foundation//DTD Struts Configuration 1.2//EN\" \"http://jakarta.apache.org/struts/dtds/struts-config_1_2.dtd\">\n<struts-config><action-mappings/></struts-config>";

  private static Path project(String webXmlServlets) throws Exception {
    Path root = Files.createTempDirectory("st-struts-config");
    Files.createDirectories(root.resolve("web/WEB-INF"));
    Files.writeString(root.resolve("web/WEB-INF/web.xml"), "<!DOCTYPE web-app PUBLIC \"-//Sun Microsystems, Inc.//DTD Web Application 2.3//EN\" \"http://java.sun.com/dtd/web-app_2_3.dtd\">\n<web-app>" + webXmlServlets + "</web-app>");
    return root;
  }

  private static List<String> configs(Path root) throws Exception {
    var inventory = new ProjectScanner().scan(root);
    return inventory.strutsConfigFiles().stream().map(path -> inventory.root().relativize(path).toString().replace('\\', '/')).sorted().toList();
  }

  private static String servlet(String... params) {
    StringBuilder result = new StringBuilder("<servlet><servlet-name>action</servlet-name><servlet-class>org.example.CustomConfigServlet</servlet-class>");
    for (int i = 0; i < params.length; i += 2) result.append("<init-param><param-name>").append(params[i]).append("</param-name><param-value>").append(params[i + 1]).append("</param-value></init-param>");
    return result.append("</servlet>").toString();
  }

  @Test void declaredConfigReplacesAStaleStrutsConfigXml() throws Exception {
    // chrisekelley/zeprs: DynasiteConfigServlet loads /WEB-INF/foo.xml; struts-config.xml beside it is an old template.
    Path root = project(servlet("config", "/WEB-INF/foo.xml", "validator-config", "/WEB-INF/bar.xml"));
    Files.writeString(root.resolve("web/WEB-INF/foo.xml"), CONFIG);
    Files.writeString(root.resolve("web/WEB-INF/struts-config.xml"), CONFIG);
    Files.writeString(root.resolve("web/WEB-INF/bar.xml"), "<form-validation/>");
    assertEquals(List.of("web/WEB-INF/foo.xml"), configs(root));
    assertTrue(new ProjectScanner().scan(root).technologies().contains("Struts 1"));
  }

  @Test void commaSeparatedAndModuleConfigsAreAllLoaded() throws Exception {
    Path root = project(servlet("config", "/WEB-INF/main.xml, /WEB-INF/extra.xml", "config/admin", "/WEB-INF/admin.xml"));
    for (String name : List.of("main.xml", "extra.xml", "admin.xml", "struts-config-unused.xml")) Files.writeString(root.resolve("web/WEB-INF/" + name), CONFIG);
    assertEquals(List.of("web/WEB-INF/admin.xml", "web/WEB-INF/extra.xml", "web/WEB-INF/main.xml"), configs(root));
  }

  @Test void moduleOnlyDeclarationKeepsTheDefaultStrutsConfig() throws Exception {
    Path root = project(servlet("config/admin", "/WEB-INF/admin.xml"));
    Files.writeString(root.resolve("web/WEB-INF/admin.xml"), CONFIG);
    Files.writeString(root.resolve("web/WEB-INF/struts-config.xml"), CONFIG);
    assertEquals(List.of("web/WEB-INF/admin.xml", "web/WEB-INF/struts-config.xml"), configs(root));
  }

  @Test void configParamOfAnotherKindFallsBackToTheFileNameRule() throws Exception {
    Path root = project(servlet("config", "/WEB-INF/quartz.xml"));
    Files.writeString(root.resolve("web/WEB-INF/quartz.xml"), "<job-scheduling-data/>");
    Files.writeString(root.resolve("web/WEB-INF/struts-config.xml"), CONFIG);
    assertEquals(List.of("web/WEB-INF/struts-config.xml"), configs(root));
  }

  @Test void configOutsideTheWebRootIsNeverLoaded() throws Exception {
    Path root = project(servlet("config", "/../secret.xml"));
    Files.writeString(root.resolve("web/secret.xml"), CONFIG);
    Files.writeString(root.resolve("web/WEB-INF/struts-config.xml"), CONFIG);
    assertEquals(List.of("web/WEB-INF/struts-config.xml"), configs(root));
  }
}
