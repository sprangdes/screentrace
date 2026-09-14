package io.screentrace.cli;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.screentrace.adapter.spring.SpringProjectAnalyzer;
import io.screentrace.adapter.struts.StrutsProjectAnalyzer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraphMerger;
import io.screentrace.report.ReportGenerator;
import io.screentrace.report.ReviewResultGenerator;
import io.screentrace.report.FlowStateGraphAugmenter;
import io.screentrace.scanner.ProjectScanner;
import java.awt.Desktop;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.BindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.UUID;
import java.util.logging.Logger;

public final class ScreenTraceCli {
  static final int MAX_OVERLAY_BYTES = 1_048_576;
  static final InetAddress REPORT_ADDRESS = InetAddress.getLoopbackAddress();
  private static final String ANALYSIS_DIRECTORY = ".screentrace";
  private static final String INDEX_FILE = "index.html";
  private static final String JSON_CONTENT_TYPE = "application/json";
  private static final String HTML_CONTENT_TYPE = "text/html; charset=utf-8";
  private static final Logger LOGGER = Logger.getLogger(ScreenTraceCli.class.getName());

  public static void main(String[] args) throws IOException, InterruptedException {
    String command = args.length == 0 ? "analyze" : args[0];
    Parsed parsed = Parsed.of(Arrays.copyOfRange(args, 1, args.length));
    if (command.equals("analyze")) analyze(parsed);
    else if (command.equals("export")) export(parsed);
    else if (command.equals("serve")) serve(analysisDirectory(parsed).resolve("report"));
    else throw new IllegalArgumentException("Usage: screentrace analyze [project] [--output directory] [--serve] | screentrace serve [project] | screentrace export [project] [--output file]");
  }

  private static void analyze(Parsed parsed) throws IOException, InterruptedException {
    Path output = analysisDirectory(parsed);
    var inventory = new ProjectScanner().scan(parsed.target);
    var graph = analyze(inventory);
    new ReportGenerator().write(graph, output);
    boolean serverRendered = graph.application().technologies().contains("JSP");
    boolean react = graph.application().technologies().contains("React");
    if (serverRendered) {
      renderStaticJsp(parsed.target, output);
      new ReportGenerator().write(graph, output);
    }
    else if (react) {
      renderStaticReact(parsed.target, output);
      graph = new FlowStateGraphAugmenter().augment(graph, output);
      new ReportGenerator().write(graph, output);
    }
    var result = graph;
    long screens = result.nodes().stream().filter(node -> node.type().name().equals("SCREEN")).count();
    long endpoints = result.nodes().stream().filter(node -> node.type().name().equals("ENDPOINT")).count();
    long components = result.nodes().stream().filter(node -> node.type().name().equals("COMPONENT")).count();
    LOGGER.info(() -> "ScreenTrace%n%nAnalyzing:%n  %s%n%nDetected framework:%n  %s%n%nAnalysis result:%n  Endpoints: %d%n  Screens: %d%n  Components: %d%n%nGenerated:%n  %s%n"
        .formatted(parsed.target, String.join(", ", result.application().technologies()), endpoints, screens,
            components, output));
    if (parsed.serve) serve(output.resolve("report"));
  }

  private static ApplicationGraph analyze(ProjectScanner.ProjectInventory inventory) throws IOException {
    boolean struts = inventory.technologies().contains("Struts 1");
    boolean springWeb = inventory.technologies().contains("Spring MVC") || inventory.technologies().contains("Spring Boot");
    if (struts && springWeb) return ApplicationGraphMerger.merge(new StrutsProjectAnalyzer().analyze(inventory), new SpringProjectAnalyzer().analyze(inventory));
    if (struts) return new StrutsProjectAnalyzer().analyze(inventory);
    return new SpringProjectAnalyzer().analyze(inventory);
  }

  @SuppressWarnings("java:S4036") // The static JSP renderer intentionally runs in an isolated Node process.
  private static void renderStaticJsp(Path target, Path output) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("node", Path.of("screentrace-capture/capture-static-jsp.mjs").toAbsolutePath().toString(), target.toString(), output.toString()).inheritIO().start();
    if (process.waitFor() != 0) LOGGER.warning("Static JSP preview could not be rendered; source-derived fallback preview remains available.");
  }

  @SuppressWarnings("java:S4036") // React is rendered only through an isolated Vite process with mocked API responses.
  private static void renderStaticReact(Path target, Path output) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("node", Path.of("screentrace-capture/capture.mjs").toAbsolutePath().toString(), target.toString(), output.toString()).inheritIO().start();
    if (process.waitFor() != 0) LOGGER.warning("Static React preview could not be rendered; screenshot and source-derived fallbacks remain available.");
  }

  private static void export(Parsed parsed) throws IOException {
    Path analysis = parsed.target.resolve(ANALYSIS_DIRECTORY);
    Path destination = parsed.output == null ? analysis.resolve("review-result.json") : parsed.output;
    new ReviewResultGenerator().write(analysis, destination);
    LOGGER.info(() -> "Review result exported:\n  " + destination);
  }

  private static void serve(Path report) throws IOException {
    if (!Files.isDirectory(report)) throw new IllegalArgumentException("Report not found: " + report);
    HttpServer server;
    try {
      server = HttpServer.create(new InetSocketAddress(REPORT_ADDRESS, 8088), 0);
    } catch (BindException ignored) {
      LOGGER.info("ScreenTrace report is already running at:\n\nhttp://localhost:8088\n\nReload the page to view the latest analysis.");
      openReport();
      return;
    }
    Path analysis = report.getParent();
    Path overlay = analysis.resolve("edit-overlay.json");
    String sessionToken = UUID.randomUUID().toString();
    server.createContext("/edit-overlay.json", exchange -> handleOverlay(exchange, overlay, sessionToken));
    server.createContext("/review-result.json", exchange -> handleReviewResult(exchange, analysis, overlay, sessionToken));
    server.createContext("/", exchange -> serveStatic(exchange, report, analysis, sessionToken));
    server.start();
    LOGGER.info("ScreenTrace report running at:\n\nhttp://localhost:8088");
    openReport();
  }

  private static void handleOverlay(HttpExchange exchange, Path overlay, String sessionToken) throws IOException {
    if (exchange.getRequestMethod().equals("PUT")) {
      if (!authorizedMutation(exchange, sessionToken)) return;
      if (!writeOverlay(exchange, overlay)) return;
      exchange.sendResponseHeaders(204, -1);
      exchange.close();
      return;
    }
    if (!exchange.getRequestMethod().equals("GET")) {
      exchange.sendResponseHeaders(405, -1);
      exchange.close();
      return;
    }
    if (Files.isSymbolicLink(overlay)) {
      exchange.sendResponseHeaders(404, -1);
      exchange.close();
      return;
    }
    sendFile(exchange, overlay, JSON_CONTENT_TYPE);
  }

  private static void handleReviewResult(HttpExchange exchange, Path analysis, Path overlay, String sessionToken) throws IOException {
    if (!exchange.getRequestMethod().equals("POST")) {
      exchange.sendResponseHeaders(405, -1);
      exchange.close();
      return;
    }
    if (!authorizedMutation(exchange, sessionToken)) return;
    if (!writeOverlay(exchange, overlay)) return;
    Path result = new ReviewResultGenerator().write(analysis, analysis.resolve("review-result.json"));
    exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=review-result.json");
    sendFile(exchange, result, JSON_CONTENT_TYPE);
  }

  private static boolean writeOverlay(HttpExchange exchange, Path overlay) throws IOException {
    try {
      if (Files.isSymbolicLink(overlay)) {
        exchange.sendResponseHeaders(404, -1);
        exchange.close();
        return false;
      }
      Files.write(overlay, readLimited(exchange.getRequestBody()));
      return true;
    } catch (RequestTooLargeException ignored) {
      exchange.sendResponseHeaders(413, -1);
      exchange.close();
      return false;
    }
  }

  private static boolean authorizedMutation(HttpExchange exchange, String sessionToken) throws IOException {
    if (hasMutationToken(exchange.getRequestHeaders().getFirst("X-ScreenTrace-Token"), sessionToken)) return true;
    exchange.sendResponseHeaders(403, -1);
    exchange.close();
    return false;
  }

  static boolean hasMutationToken(String suppliedToken, String sessionToken) {
    return sessionToken.equals(suppliedToken);
  }

  private static void serveStatic(HttpExchange exchange, Path report, Path analysis, String sessionToken) throws IOException {
    Path requested = staticFile(exchange.getRequestURI().getPath(), report, analysis);
    if (requested == null) {
      exchange.sendResponseHeaders(404, -1);
      exchange.close();
      return;
    }
    if (requested.equals(report.resolve(INDEX_FILE))) {
      byte[] body = Files.readString(requested).replace("__SCREEN_TRACE_SESSION_TOKEN__", sessionToken).getBytes();
      exchange.getResponseHeaders().set("Content-Type", HTML_CONTENT_TYPE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
      return;
    }
    if (!Files.isRegularFile(requested)) {
      exchange.sendResponseHeaders(404, -1);
      exchange.close();
      return;
    }
    sendFile(exchange, requested, contentType(requested));
  }

  static Path staticFile(String uri, Path report, Path analysis) {
    if (uri.equals("/")) return report.resolve(INDEX_FILE);
    if (uri.equals("/application-graph.json") || uri.equals("/prototype-model.json") || uri.equals("/preview-model.json")) return resolveWithin(analysis, uri.substring(1));
    if (uri.startsWith("/screenshots/")) return resolveWithin(analysis.resolve("screenshots"), uri.substring("/screenshots/".length()));
    if (uri.startsWith("/static-preview/")) return resolveWithin(analysis.resolve("static-preview"), uri.substring("/static-preview/".length()));
    return resolveWithin(report, uri.substring(1));
  }

  static Path resolveWithin(Path root, String relativePath) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    Path resolved = normalizedRoot.resolve(relativePath).normalize();
    if (!resolved.startsWith(normalizedRoot)) return null;
    try {
      if (!Files.exists(resolved)) return resolved;
      Path realRoot = normalizedRoot.toRealPath();
      Path realResolved = resolved.toRealPath();
      return realResolved.startsWith(realRoot) ? resolved : null;
    } catch (IOException | SecurityException ignored) {
      return null;
    }
  }

  static byte[] readLimited(InputStream input) throws IOException {
    try (input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      long total = 0;
      int read;
      while ((read = input.read(buffer)) != -1) {
        total += read;
        if (total > MAX_OVERLAY_BYTES) throw new RequestTooLargeException();
        output.write(buffer, 0, read);
      }
      return output.toByteArray();
    }
  }

  private static void sendFile(HttpExchange exchange, Path file, String contentType) throws IOException {
    byte[] body = Files.readAllBytes(file);
    exchange.getResponseHeaders().set("Content-Type", contentType);
    exchange.sendResponseHeaders(200, body.length);
    exchange.getResponseBody().write(body);
    exchange.close();
  }

  private static String contentType(Path file) {
    String value = file.toString();
    if (value.endsWith(".json")) return JSON_CONTENT_TYPE;
    if (value.endsWith(".png")) return "image/png";
    if (value.endsWith(".css")) return "text/css; charset=utf-8";
    if (value.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (value.endsWith(".svg")) return "image/svg+xml";
    if (value.endsWith(".woff")) return "font/woff";
    if (value.endsWith(".ttf")) return "font/ttf";
    return HTML_CONTENT_TYPE;
  }

  private static void openReport() {
    try {
      if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI.create("http://localhost:8088"));
    } catch (IOException ignored) {
      // Opening a browser is best effort and must not prevent report serving.
    }
  }

  static final class RequestTooLargeException extends IOException { }

  private static Path analysisDirectory(Parsed parsed) {
    return parsed.output == null ? parsed.target.resolve(ANALYSIS_DIRECTORY) : parsed.output;
  }

  private record Parsed(Path target, Path output, boolean serve) {
    static Parsed of(String[] arguments) {
      Path target = Path.of(".").toAbsolutePath().normalize();
      Path output = null;
      boolean serve = false;
      int index = 0;
      while (index < arguments.length) {
        if (arguments[index].equals("--serve")) serve = true;
        else if (arguments[index].equals("--output")) output = outputDirectory(arguments, ++index);
        else if (arguments[index].startsWith("--")) throw new IllegalArgumentException("Unknown option: " + arguments[index]);
        else target = Path.of(arguments[index]).toAbsolutePath().normalize();
        index++;
      }
      return new Parsed(target, output, serve);
    }

    private static Path outputDirectory(String[] arguments, int index) {
      if (index >= arguments.length) throw new IllegalArgumentException("Missing directory after --output");
      return Path.of(arguments[index]).toAbsolutePath().normalize();
    }
  }
}
