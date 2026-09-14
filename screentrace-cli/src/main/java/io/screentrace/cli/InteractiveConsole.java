package io.screentrace.cli;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Function;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Attributes;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.jline.utils.NonBlockingReader;

/** Small terminal UI using arrow-key selection and editable path prompts. */
final class InteractiveConsole implements AutoCloseable {
  private final Terminal terminal;
  private final LineReader lines;

  InteractiveConsole() throws IOException {
    terminal = TerminalBuilder.builder().system(true).build();
    lines = LineReaderBuilder.builder().terminal(terminal).build();
  }

  Path existingDirectory(String prompt, Path defaultValue) {
    while (true) {
      String value = read(prompt, defaultValue);
      Path path = Path.of(value).toAbsolutePath().normalize();
      if (Files.isDirectory(path)) return path;
      terminal.writer().println("目錄不存在：" + path);
      terminal.flush();
    }
  }

  Path outputDirectory(String prompt, Path defaultValue) {
    while (true) {
      Path path = Path.of(read(prompt, defaultValue)).toAbsolutePath().normalize();
      try {
        Files.createDirectories(path);
        return path;
      } catch (IOException exception) {
        terminal.writer().println("無法建立輸出目錄：" + exception.getMessage());
        terminal.flush();
      }
    }
  }

  <T> T select(String title, List<T> options, Function<T, String> label) throws IOException {
    if (options.isEmpty()) throw new IllegalArgumentException("沒有可操作的專案。");
    int selected = 0;
    Attributes original = terminal.enterRawMode();
    try {
      NonBlockingReader input = terminal.reader();
      while (true) {
        render(title, options, label, selected);
        int key = readKey(input);
        if (key == 27) throw new IllegalStateException("操作已取消。");
        if (key == '\r' || key == '\n') return options.get(selected);
        if (key == 65 || key == 'k') selected = (selected + options.size() - 1) % options.size();
        if (key == 66 || key == 'j') selected = (selected + 1) % options.size();
      }
    } finally {
      terminal.setAttributes(original);
      terminal.writer().println();
      terminal.flush();
    }
  }

  void waitForReportClose(String url) throws IOException {
    Attributes original = terminal.enterRawMode();
    try {
      terminal.writer().println();
      terminal.writer().println("報表已開啟：" + url);
      terminal.writer().println("按 Esc 關閉 localhost 報表並回到功能選單。");
      terminal.flush();
      NonBlockingReader input = terminal.reader();
      while (readKey(input) != 27) {
        // Only Esc closes the report; all other input remains available to the browser.
      }
    } finally {
      terminal.setAttributes(original);
      terminal.writer().println();
      terminal.flush();
    }
  }

  private String read(String prompt, Path defaultValue) {
    String value = lines.readLine(prompt + " [" + defaultValue + "]：").trim();
    return value.isEmpty() ? defaultValue.toString() : value;
  }

  private static int readKey(NonBlockingReader input) throws IOException {
    int first = input.read();
    if (first != 27) return first;
    int second = input.read();
    if (second != '[') return 27;
    return input.read();
  }

  private <T> void render(String title, List<T> options, Function<T, String> label, int selected) {
    terminal.writer().print("\033[H\033[2J");
    terminal.writer().println("ScreenTrace");
    terminal.writer().println();
    terminal.writer().println(title);
    for (int index = 0; index < options.size(); index++) {
      terminal.writer().println((index == selected ? "❯ " : "  ") + label.apply(options.get(index)));
    }
    terminal.writer().println();
    terminal.writer().print("↑ / ↓ 選擇，Enter 確認，Esc 取消");
    terminal.flush();
  }

  @Override
  public void close() throws IOException {
    terminal.close();
  }
}
