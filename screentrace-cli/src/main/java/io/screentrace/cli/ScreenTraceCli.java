package io.screentrace.cli;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.screentrace.adapter.spring.SpringBootAnalyzer;
import io.screentrace.report.ReportGenerator;
import io.screentrace.report.ReviewResultGenerator;
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
import java.util.Set;
import java.util.UUID;

public final class ScreenTraceCli {
  static final int MAX_OVERLAY_BYTES = 1_048_576;
  static final InetAddress REPORT_ADDRESS = InetAddress.getLoopbackAddress();

  public static void main(String[] args) throws Exception {
    String command = args.length == 0 ? "analyze" : args[0];
    Parsed parsed = Parsed.of(Arrays.copyOfRange(args, 1, args.length));
    if (command.equals("analyze")) analyze(parsed);
    else if (command.equals("capture")) capture(parsed);
    else if (command.equals("export")) export(parsed);
    else if (command.equals("serve")) serve((parsed.output == null ? parsed.target.resolve(".screentrace") : parsed.output).resolve("report"));
    else throw new IllegalArgumentException("Usage: screentrace analyze [project] [--output directory] [--capture] [--serve] | screentrace capture [project] [--output directory] | screentrace serve [project] | screentrace export [project] [--output file]");
  }

  private static void analyze(Parsed parsed) throws Exception {
    Path output = parsed.output == null ? parsed.target.resolve(".screentrace") : parsed.output;
    var graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(parsed.target));
    if (parsed.capture) capture(new Parsed(parsed.target, output, false, false));
    new ReportGenerator().write(graph, output);
    long screens = graph.nodes().stream().filter(node -> node.type().name().equals("SCREEN")).count();
    long endpoints = graph.nodes().stream().filter(node -> node.type().name().equals("ENDPOINT")).count();
    System.out.printf("ScreenTrace%n%nAnalyzing:%n  %s%n%nDetected framework:%n  %s%n%nAnalysis result:%n  Endpoints: %d%n  Screens: %d%n  Components: %d%n%nGenerated:%n  %s%n", parsed.target, String.join(", ", graph.application().technologies()), endpoints, screens, graph.nodes().stream().filter(node -> node.type().name().equals("COMPONENT")).count(), output);
    if (parsed.serve) serve(output.resolve("report"));
  }

  private static void export(Parsed parsed) throws IOException {
    Path analysis = parsed.target.resolve(".screentrace");
    Path destination = parsed.output == null ? analysis.resolve("review-result.json") : parsed.output;
    new ReviewResultGenerator().write(analysis, destination);
    System.out.println("Review result exported:\n  " + destination);
  }

  private static void capture(Parsed parsed) throws IOException, InterruptedException {
    Path output = parsed.output == null ? parsed.target.resolve(".screentrace") : parsed.output;
    Process process = new ProcessBuilder("node", Path.of("screentrace-capture/capture.mjs").toAbsolutePath().toString(), parsed.target.toString(), output.toString()).inheritIO().start();
    if (process.waitFor() != 0) throw new IllegalStateException("Runtime capture failed.");
    System.out.println("Generated runtime screenshots: " + output.resolve("screenshots"));
  }

  private static void serve(Path report) throws IOException {
    if (!Files.isDirectory(report)) throw new IllegalArgumentException("Report not found: " + report);
    HttpServer server;
    try {
      server = HttpServer.create(new InetSocketAddress(REPORT_ADDRESS, 8088), 0);
    } catch (BindException ignored) {
      System.out.println("ScreenTrace report is already running at:\n\nhttp://localhost:8088\n\nReload the page to view the latest analysis.");
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
    System.out.println("ScreenTrace report running at:\n\nhttp://localhost:8088");
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
    sendFile(exchange, overlay, "application/json");
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
    sendFile(exchange, result, "application/json");
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
    if (!Files.isRegularFile(requested)) requested = report.resolve("index.html");
    if (requested.equals(report.resolve("index.html"))) {
      byte[] body = Files.readString(requested).replace("__SCREEN_TRACE_SESSION_TOKEN__", sessionToken).getBytes();
      exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
      return;
    }
    sendFile(exchange, requested, contentType(requested));
  }

  static Path staticFile(String uri, Path report, Path analysis) {
    if (uri.equals("/")) return report.resolve("index.html");
    if (uri.equals("/application-graph.json") || uri.equals("/prototype-model.json")) return resolveWithin(analysis, uri.substring(1));
    if (uri.startsWith("/screenshots/")) return resolveWithin(analysis.resolve("screenshots"), uri.substring("/screenshots/".length()));
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
    } catch (IOException ignored) {
      return null;
    }
  }

  static byte[] readLimited(InputStream input) throws IOException {
    try (input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      long total = 0;
      for (int read; (read = input.read(buffer)) != -1;) {
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
    return value.endsWith(".json") ? "application/json" : value.endsWith(".png") ? "image/png" : "text/html; charset=utf-8";
  }

  private static void openReport() {
    try {
      if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI.create("http://localhost:8088"));
    } catch (Exception ignored) { }
  }

  static final class RequestTooLargeException extends IOException { }

  private record Parsed(Path target, Path output, boolean serve, boolean capture) {
    static Parsed of(String[] arguments) {
      Path target = Path.of(".").toAbsolutePath().normalize();
      Path output = null;
      boolean serve = false;
      boolean capture = false;
      for (int index = 0; index < arguments.length; index++) {
        if (arguments[index].equals("--serve")) serve = true;
        else if (arguments[index].equals("--capture")) capture = true;
        else if (arguments[index].equals("--output")) output = Path.of(arguments[++index]).toAbsolutePath().normalize();
        else target = Path.of(arguments[index]).toAbsolutePath().normalize();
      }
      return new Parsed(target, output, serve, capture);
    }
  }
}
