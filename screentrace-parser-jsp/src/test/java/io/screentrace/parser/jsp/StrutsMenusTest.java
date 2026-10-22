package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** oussamazoghlami/SpringStrutsHibernate renders its menus with struts-menu's <menu:displayMenu>. */
class StrutsMenusTest {
  @TempDir Path root;
  private static final String TAGLIB = "<%@ taglib uri=\"http://struts-menu.sf.net/tag\" prefix=\"menu\" %>";
  private static final String MENUS = "<MenuConfig><Menus><Menu name=\"adminCustomer\" title=\"Admin. Customers\"><Item title=\"Add a new customer\" location=\"AddCustomer.do\"/>"
      + "<Item title=\"List all customers\" page=\"/ListCustomer.do\"/><Item title=\"Header\"/></Menu></Menus></MenuConfig>";

  private StrutsMenus load(String plugin, String configPath) throws Exception {
    Path webInf = root.resolve("module/src/main/webapp/WEB-INF");
    Files.createDirectories(webInf);
    Files.writeString(webInf.resolve("struts-config.xml"), "<struts-config>" + plugin + "</struts-config>");
    Files.writeString(root.resolve("module/src/main/webapp/" + configPath), MENUS);
    try (var walk = Files.walk(root)) { return StrutsMenus.load(root, walk.filter(Files::isRegularFile).toList()); }
  }

  @Test void configuredMenuExpandsIntoLinksOnTheSameLine() throws Exception {
    var menus = load("<plug-in className=\"net.sf.navigator.menu.MenuPlugIn\"><set-property property=\"menuConfig\" value=\"/WEB-INF/menu-config.xml\"/></plug-in>", "WEB-INF/menu-config.xml");
    String page = TAGLIB + "\n<td><menu:useMenuDisplayer name=\"TabbedMenu\"><menu:displayMenu name=\"adminCustomer\" /></menu:useMenuDisplayer></td>\n<p>after</p>";
    String expanded = menus.expand(page);
    assertTrue(expanded.contains("<a href=\"AddCustomer.do\">Add a new customer</a><a href=\"/ListCustomer.do\">List all customers</a><span>Header</span>"), expanded);
    assertFalse(expanded.contains("displayMenu"));
    assertEquals(page.lines().count(), expanded.lines().count(), "line numbers are kept");
  }

  @Test void defaultConfigPathIsUsedWhenThePluginSetsNone() throws Exception {
    var menus = load("<plug-in className=\"net.sf.navigator.menu.MenuPlugIn\"/>", "WEB-INF/menu-config.xml");
    assertTrue(menus.expand(TAGLIB + "<menu:displayMenu name=\"adminCustomer\"/>").contains("AddCustomer.do"));
  }

  @Test void withoutTheTaglibOrForAnUnknownMenuNothingChanges() throws Exception {
    var menus = load("<plug-in className=\"net.sf.navigator.menu.MenuPlugIn\"/>", "WEB-INF/menu-config.xml");
    String noTaglib = "<menu:displayMenu name=\"adminCustomer\"/>";
    assertEquals(noTaglib, menus.expand(noTaglib));
    String unknown = TAGLIB + "<menu:displayMenu name=\"missing\"/>";
    assertEquals(unknown, menus.expand(unknown));
    assertEquals(unknown, StrutsMenus.none().expand(unknown));
  }

  @Test void aMenuDefinedTwiceIsAmbiguousAndLeftAlone() throws Exception {
    Path webInf = root.resolve("module/src/main/webapp/WEB-INF");
    Files.createDirectories(webInf);
    Files.writeString(webInf.resolve("struts-config.xml"), "<struts-config><plug-in className=\"net.sf.navigator.menu.MenuPlugIn\"/></struts-config>");
    Files.writeString(webInf.resolve("menu-config.xml"), "<MenuConfig><Menus><Menu name=\"m\"><Item title=\"A\" location=\"a.do\"/></Menu><Menu name=\"m\"><Item title=\"B\" location=\"b.do\"/></Menu></Menus></MenuConfig>");
    StrutsMenus menus;
    try (var walk = Files.walk(root)) { menus = StrutsMenus.load(root, walk.filter(Files::isRegularFile).toList()); }
    String page = TAGLIB + "<menu:displayMenu name=\"m\"/>";
    assertEquals(page, menus.expand(page));
  }
}
