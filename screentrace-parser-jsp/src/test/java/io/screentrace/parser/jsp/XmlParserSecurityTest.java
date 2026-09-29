package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class XmlParserSecurityTest {
  @Test void legacyExternalDtdIsRemovedBeforeParsingAndNeverRequested() throws Exception {
    AtomicInteger requests = new AtomicInteger();
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/tiles.dtd", exchange -> { requests.incrementAndGet(); exchange.sendResponseHeaders(200, -1); exchange.close(); });
    server.start();
    try {
      Path root = Files.createTempDirectory("xml-security");
      Path xml = root.resolve("tiles.xml");
      Files.writeString(xml, "<!DOCTYPE tiles-definitions SYSTEM \"http://127.0.0.1:" + server.getAddress().getPort() + "/tiles.dtd\"><tiles-definitions><definition name=\"safe\"/></tiles-definitions>");
      var parsed = new JspProjectParser().analyze(root, List.of(xml));
      assertEquals("safe", parsed.tilesDefinitions().get(0).name());
      assertEquals(0, requests.get());
    } finally { server.stop(0); }
  }

  @Test void internalEntityDeclarationsAreRejected() throws Exception {
    Path root = Files.createTempDirectory("xml-internal-entity");
    Path xml = root.resolve("tiles.xml");
    Files.writeString(xml, "<!DOCTYPE tiles-definitions [<!ENTITY secret 'expanded'>]><tiles-definitions><definition name=\"&secret;\"/></tiles-definitions>");
    var parsed = new JspProjectParser().analyze(root, List.of(xml));
    assertTrue(parsed.tilesDefinitions().isEmpty());
    assertTrue(parsed.diagnostics().stream().anyMatch(item -> item.message().contains("internal DOCTYPE")));
  }
}
