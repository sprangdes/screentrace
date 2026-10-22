package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;

/** React is detected from .tsx/.jsx sources or from a package.json that depends on react (JSX may live in .js files). */
class ReactDetectionTest {
  private static boolean react(Path root) throws Exception { return new ProjectScanner().scan(root).technologies().contains("React"); }

  @Test void packageJsonInAFrontendSubfolderProvesReactForJsSources() throws Exception {
    Path root = Files.createTempDirectory("st-react-cra");
    Files.createDirectories(root.resolve("app/src"));
    Files.writeString(root.resolve("app/package.json"), "{\"dependencies\":{\"react\":\"^18.2.0\",\"react-router-dom\":\"^6.8.0\"}}");
    Files.writeString(root.resolve("app/src/App.js"), "export default function App(){ return <div/>; }");
    assertTrue(react(root));
  }

  @Test void rootPackageJsonWithReactAsDevDependencyProvesReact() throws Exception {
    Path root = Files.createTempDirectory("st-react-root");
    Files.writeString(root.resolve("package.json"), "{\"devDependencies\":{\"react\":\"18.2.0\"}}");
    assertTrue(react(root));
  }

  @Test void packageJsonWithoutReactOrMalformedProvesNothing() throws Exception {
    Path root = Files.createTempDirectory("st-react-none");
    Files.createDirectories(root.resolve("web"));
    Files.writeString(root.resolve("package.json"), "{\"dependencies\":{\"react-dom-helpers\":\"1.0.0\",\"jquery\":\"3.7.1\"},\"description\":\"react\"}");
    Files.writeString(root.resolve("web/package.json"), "{ not json");
    Files.writeString(root.resolve("web/app.js"), "$('#x').on('click', function(){});");
    assertFalse(react(root));
  }

  @Test void reactInsideNodeModulesIsIgnored() throws Exception {
    Path root = Files.createTempDirectory("st-react-node-modules");
    Files.createDirectories(root.resolve("node_modules/some-widget"));
    Files.writeString(root.resolve("node_modules/some-widget/package.json"), "{\"dependencies\":{\"react\":\"18.2.0\"}}");
    assertFalse(react(root));
  }

  @Test void jsxExtensionStillProvesReactWithoutPackageJson() throws Exception {
    Path root = Files.createTempDirectory("st-react-jsx");
    Files.writeString(root.resolve("App.jsx"), "export default function App(){ return <div/>; }");
    assertTrue(react(root));
  }
}
