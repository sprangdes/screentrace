package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph.*;import static org.junit.jupiter.api.Assertions.*;
/** chrisekelley/zeprs: a custom ActionServlet loads /WEB-INF/foo.xml while a stale struts-config.xml sits beside it. */
class DeclaredStrutsConfigTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 @Test void actionsComeFromTheConfigWebXmlDeclares()throws Exception{
  write("web/zeprs/WEB-INF/web.xml","<!DOCTYPE web-app PUBLIC \"-//Sun Microsystems, Inc.//DTD Web Application 2.3//EN\" \"http://java.sun.com/dtd/web-app_2_3.dtd\">\n<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.cidrz.DynasiteConfigServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/foo.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
  write("src/org/cidrz/DynasiteConfigServlet.java","package org.cidrz; import org.apache.struts.action.ActionServlet; public class DynasiteConfigServlet extends ActionServlet {}");
  write("web/zeprs/WEB-INF/foo.xml","<?xml version=\"1.0\"?>\n<!DOCTYPE struts-config PUBLIC \"-//Apache Software Foundation//DTD Struts Configuration 1.2//EN\" \"http://jakarta.apache.org/struts/dtds/struts-config_1_2.dtd\">\n<struts-config><action-mappings><action path='/live' forward='/live.jsp'/></action-mappings></struts-config>");
  write("web/zeprs/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/stale' forward='/stale.jsp'/></action-mappings></struts-config>");
  write("web/zeprs/live.jsp","<a href='live.do'>Live</a>");write("web/zeprs/stale.jsp","Stale");
  var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  var paths=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT).map(n->n.attributes().get("path")).toList();
  assertTrue(paths.contains("/live.do"),paths.toString());
  assertFalse(paths.contains("/stale.do"),paths.toString());
  var live=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/live.do".equals(n.attributes().get("path"))).findFirst().orElseThrow();
  assertEquals("web/zeprs/WEB-INF/foo.xml",live.source().file());
  assertEquals("PROVEN",live.attributes().get("servletMappingStatus"));
 }
}
