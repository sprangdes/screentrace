package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** RawSanj/spring-tiles-sample-app passes its layout's stylesheets and scripts as Tiles list attributes. */
class TilesListAttributeTest {
  @Test void tiles3AndTiles1ListsAreParsedAndInherited() throws Exception {
    Path root = Files.createTempDirectory("st-tiles-lists");
    Path tiles3 = root.resolve("src/main/webapp/WEB-INF/defs/general.xml"), tiles1 = root.resolve("src/main/webapp/WEB-INF/tiles-defs.xml");
    Files.createDirectories(tiles3.getParent());
    Files.writeString(tiles3, """
        <?xml version="1.0" encoding="ISO-8859-1" ?>
        <!DOCTYPE tiles-definitions PUBLIC "-//Apache Software Foundation//DTD Tiles Configuration 3.0//EN" "http://tiles.apache.org/dtds/tiles-config_3_0.dtd">
        <tiles-definitions>
          <definition name="common" template="/WEB-INF/layout/common.jsp">
            <put-list-attribute name="stylesheets"><add-attribute value="/resources/css/AdminLTE.min.css"/><add-attribute value="/resources/css/skins/_all-skins.min.css"/></put-list-attribute>
            <put-list-attribute name="javascripts"><add-attribute value="/resources/js/app.min.js"/></put-list-attribute>
          </definition>
          <definition name="home" extends="common"><put-attribute name="body" value="/WEB-INF/jsp/home.jsp"/></definition>
        </tiles-definitions>
        """);
    Files.writeString(tiles1, "<tiles-definitions><definition name=\"base\" path=\"/layout.jsp\"><putList name=\"menu\"><add value=\"/a.jsp\"/><add value=\"/b.jsp\"/></putList></definition></tiles-definitions>");
    var definitions = new JspProjectParser().analyze(root, List.of(tiles3, tiles1)).tilesDefinitions();
    var home = definitions.stream().filter(d -> d.name().equals("home")).findFirst().orElseThrow();
    var styles = home.attributes().stream().filter(a -> a.name().equals("stylesheets")).findFirst().orElseThrow();
    assertEquals(List.of("/resources/css/AdminLTE.min.css", "/resources/css/skins/_all-skins.min.css"), styles.list(), "inherited from common");
    assertNull(home.attributes().stream().filter(a -> a.name().equals("body")).findFirst().orElseThrow().list());
    var base = definitions.stream().filter(d -> d.name().equals("base")).findFirst().orElseThrow();
    assertEquals(List.of("/a.jsp", "/b.jsp"), base.attributes().stream().filter(a -> a.name().equals("menu")).findFirst().orElseThrow().list());
  }
}
