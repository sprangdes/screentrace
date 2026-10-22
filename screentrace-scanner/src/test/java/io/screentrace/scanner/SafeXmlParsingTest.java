package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Legacy DOCTYPEs parse without any DTD lookup; internal subsets and malformed XML fail quietly. */
class SafeXmlParsingTest {
  @Test void servlet23WebXmlWithExternalDoctypeParsesWithoutRequestingTheDtd() throws Exception {
    AtomicInteger requests = new AtomicInteger();
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/web-app_2_3.dtd", exchange -> { requests.incrementAndGet(); exchange.sendResponseHeaders(200, -1); exchange.close(); });
    server.start();
    try {
      String xml = "<!DOCTYPE web-app PUBLIC\n \"-//Sun Microsystems, Inc.//DTD Web Application 2.3//EN\"\n \"http://127.0.0.1:"
          + server.getAddress().getPort() + "/web-app_2_3.dtd\" >\n<web-app><servlet-mapping><url-pattern>*.do</url-pattern></servlet-mapping></web-app>";
      var document = SafeProjectFiles.parseXml(xml, false);
      assertEquals("*.do", document.getElementsByTagName("url-pattern").item(0).getTextContent());
      assertEquals(0, requests.get());
    } finally { server.stop(0); }
  }

  @Test void blankedDoctypeKeepsLineNumbers() throws Exception {
    String xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE struts-config PUBLIC\n \"-//Apache//DTD Struts 1.3//EN\"\n \"http://struts.apache.org/dtds/struts-config_1_3.dtd\">\n<struts-config/>";
    String clean = SafeProjectFiles.xmlWithoutExternalDoctype(xml);
    assertEquals(xml.lines().count(), clean.lines().count());
    assertFalse(clean.contains("DOCTYPE"));
    assertTrue(clean.lines().toList().get(4).startsWith("<struts-config"));
  }

  @Test void internalSubsetIsRejected() {
    var error = assertThrows(IOException.class, () -> SafeProjectFiles.parseXml("<!DOCTYPE a [<!ENTITY x 'expanded'>]><a>&x;</a>", false));
    assertTrue(error.getMessage().contains("internal DOCTYPE"));
  }

  @Test void malformedXmlThrowsWithoutWritingToStderr() {
    PrintStream original = System.err;
    ByteArrayOutputStream captured = new ByteArrayOutputStream();
    System.setErr(new PrintStream(captured, true));
    try {
      assertThrows(IOException.class, () -> SafeProjectFiles.parseXml("<beans><bean></beans>", true));
    } finally { System.setErr(original); }
    assertEquals("", captured.toString());
  }
}
