package io.screentrace.cli;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Function;
import org.jline.keymap.BindingReader;
import org.jline.keymap.KeyMap;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Attributes;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.jline.utils.InfoCmp.Capability;
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

  <T> T select(String title, List<T> options, Function<T, String> label, char shortcut, String exitHint,
      int separatorBefore) throws IOException {
    if (options.isEmpty()) throw new IllegalArgumentException("沒有可操作的專案。");
    if (!supportsInPlaceRedraw()) {
      return selectByNumber(title, options, label, shortcut, exitHint, separatorBefore);
    }
    int selected = 0;
    Attributes original = terminal.enterRawMode();
    List<String> menu = menuLines(title, options, label, selected, exitHint, separatorBefore);
    try {
      NonBlockingReader input = terminal.reader();
      BindingReader keys = new BindingReader(input);
      renderMenu(menu, false);
      while (true) {
        MenuKey key = readMenuKey(keys, shortcut);
        if (key == MenuKey.CANCEL || key == MenuKey.SHORTCUT) throw new SelectionCancelledException();
        if (key == MenuKey.ACCEPT) return options.get(selected);
        int next = selected;
        if (key == MenuKey.UP) next = (selected + options.size() - 1) % options.size();
        if (key == MenuKey.DOWN) next = (selected + 1) % options.size();
        if (next != selected) {
          selected = next;
          menu = menuLines(title, options, label, selected, exitHint, separatorBefore);
          renderMenu(menu, true);
        }
      }
    } finally {
      moveCursorUp(menu.size());
      terminal.puts(Capability.clr_eos);
      terminal.setAttributes(original);
      terminal.writer().println();
      terminal.flush();
    }
  }

  void waitForMenuReturn(String url) throws IOException {
    Attributes original = terminal.enterRawMode();
    List<String> panel = reportPanelLines(url);
    try {
      renderMenu(panel, false);
      NonBlockingReader input = terminal.reader();
      BindingReader keys = new BindingReader(input);
      while (true) {
        MenuKey key = readMenuKey(keys, 'q');
        if (key == MenuKey.CANCEL || key == MenuKey.SHORTCUT) return;
      }
    } finally {
      moveCursorUp(panel.size());
      terminal.puts(Capability.clr_eos);
      terminal.setAttributes(original);
      terminal.writer().println();
      terminal.flush();
    }
  }

  void showAnalysisComplete(String project, List<String> technologies, long endpoints, long screens, long components,
      Path output) {
    List<String> details = List.of(
        "專案：" + project,
        "技術：" + String.join(", ", technologies),
        "Endpoints：" + endpoints,
        "Screens：" + screens,
        "Components：" + components,
        "輸出：" + output);
    showCompletionPanel("分析完成", details);
  }

  private String read(String prompt, Path defaultValue) {
    String value = lines.readLine(prompt + " [" + defaultValue + "]：").trim();
    return value.isEmpty() ? defaultValue.toString() : value;
  }

  private MenuKey readMenuKey(BindingReader reader, char shortcut) {
    KeyMap<MenuKey> bindings = new KeyMap<>();
    bindings.bind(MenuKey.UP, "\u001b[A", "k");
    bindings.bind(MenuKey.DOWN, "\u001b[B", "j");
    bindTerminalKey(bindings, MenuKey.UP, Capability.key_up);
    bindTerminalKey(bindings, MenuKey.DOWN, Capability.key_down);
    bindings.bind(MenuKey.ACCEPT, "\r", "\n");
    bindings.bind(MenuKey.CANCEL, KeyMap.esc());
    bindings.bind(MenuKey.SHORTCUT, String.valueOf(shortcut));
    bindings.setNomatch(MenuKey.IGNORE);
    bindings.setAmbiguousTimeout(50);
    return reader.readBinding(bindings);
  }

  private void bindTerminalKey(KeyMap<MenuKey> bindings, MenuKey key, Capability capability) {
    String sequence = KeyMap.key(terminal, capability);
    if (sequence != null) bindings.bind(key, sequence);
  }

  private boolean supportsInPlaceRedraw() {
    return supportsInPlaceRedraw(terminal.getType(), terminal.getWidth(), terminal.getHeight(),
        terminal.getStringCapability(Capability.cursor_up) != null,
        terminal.getStringCapability(Capability.clr_eol) != null,
        terminal.getStringCapability(Capability.clr_eos) != null);
  }

  static boolean supportsInPlaceRedraw(String terminalType, int width, int height, boolean cursorUp,
      boolean clearLine, boolean clearBelow) {
    return width > 0 && height > 0 && !Terminal.TYPE_DUMB.equals(terminalType)
        && !Terminal.TYPE_DUMB_COLOR.equals(terminalType) && cursorUp && clearLine && clearBelow;
  }

  private <T> T selectByNumber(String title, List<T> options, Function<T, String> label, char shortcut,
      String exitHint, int separatorBefore) {
    terminal.writer().println("ScreenTrace");
    terminal.writer().println();
    terminal.writer().println(title);
    for (int index = 0; index < options.size(); index++) {
      if (index == separatorBefore) terminal.writer().println();
      terminal.writer().println((index + 1) + ". " + label.apply(options.get(index)));
    }
    terminal.flush();
    while (true) {
      String value = lines.readLine("輸入編號，或 " + shortcut + " " + exitHint + "：").trim();
      if (value.equalsIgnoreCase(String.valueOf(shortcut))) throw new SelectionCancelledException();
      try {
        int selected = Integer.parseInt(value) - 1;
        if (selected >= 0 && selected < options.size()) return options.get(selected);
      } catch (NumberFormatException ignored) {
        // Display the concise validation message below.
      }
      terminal.writer().println("請輸入 1 到 " + options.size() + "。");
      terminal.flush();
    }
  }

  private <T> List<String> menuLines(String title, List<T> options, Function<T, String> label, int selected,
      String exitHint, int separatorBefore) {
    List<String> output = new java.util.ArrayList<>();
    List<String> choices = new java.util.ArrayList<>();
    for (int index = 0; index < options.size(); index++) {
      if (index == separatorBefore) choices.add("");
      choices.add((index == selected ? "❯ " : "  ") + label.apply(options.get(index)));
    }
    String instructions = "↑ / ↓ 選擇 · Enter 確認 · " + exitHint;
    int width = Math.max(terminalWidth("ScreenTrace"), Math.max(terminalWidth(title), terminalWidth(instructions)));
    for (String choice : choices) width = Math.max(width, terminalWidth(choice));
    width += 4;

    output.add("╭" + "─".repeat(width) + "╮");
    output.add(boxLine("ScreenTrace", width, true));
    output.add("├" + "─".repeat(width) + "┤");
    output.add(boxLine(title, width, false));
    output.add(boxLine("", width, false));
    for (String choice : choices) output.add(boxLine(choice, width, false));
    output.add(boxLine("", width, false));
    output.add("├" + "─".repeat(width) + "┤");
    output.add(boxLine(instructions, width, false));
    output.add("╰" + "─".repeat(width) + "╯");
    return output;
  }

  private static String boxLine(String text, int width, boolean centered) {
    int padding = width - terminalWidth(text);
    int left = centered ? padding / 2 : 1;
    int right = padding - left;
    return "│" + " ".repeat(left) + text + " ".repeat(right) + "│";
  }

  private static int terminalWidth(String text) {
    return new org.jline.utils.AttributedString(text).columnLength();
  }

  private List<String> reportPanelLines(String url) {
    String instruction = "q / Esc 返回功能選單（HTML 報表可繼續使用）";
    return completionPanelLines("報表已開啟", List.of(url), instruction);
  }

  private void showCompletionPanel(String title, List<String> details) {
    for (String line : completionPanelLines(title, details, null)) terminal.writer().println(line);
    terminal.flush();
  }

  private List<String> completionPanelLines(String title, List<String> details, String footer) {
    int width = terminalWidth("ScreenTrace");
    width = Math.max(width, terminalWidth(title));
    for (String detail : details) width = Math.max(width, terminalWidth(detail));
    if (footer != null) width = Math.max(width, terminalWidth(footer));
    width = panelWidth(width + 4);
    List<String> output = new java.util.ArrayList<>();
    output.add("╭" + "─".repeat(width) + "╮");
    addBoxText(output, "ScreenTrace", width, true);
    output.add("├" + "─".repeat(width) + "┤");
    addBoxText(output, title, width, false);
    output.add(boxLine("", width, false));
    for (String detail : details) addBoxText(output, detail, width, false);
    if (footer != null) {
      output.add(boxLine("", width, false));
      output.add("├" + "─".repeat(width) + "┤");
      addBoxText(output, footer, width, false);
    }
    output.add("╰" + "─".repeat(width) + "╯");
    return output;
  }

  private int panelWidth(int desiredWidth) {
    int terminalWidth = terminal.getWidth();
    if (terminalWidth <= 4) return desiredWidth;
    return Math.min(desiredWidth, terminalWidth - 2);
  }

  private static void addBoxText(List<String> output, String text, int width, boolean centered) {
    List<String> lines = wrapForBox(text, width - 2);
    for (String line : lines) output.add(boxLine(line, width, centered && lines.size() == 1));
  }

  private static List<String> wrapForBox(String text, int maxWidth) {
    if (text.isEmpty()) return List.of("");
    List<String> lines = new java.util.ArrayList<>();
    StringBuilder current = new StringBuilder();
    int currentWidth = 0;
    for (int offset = 0; offset < text.length();) {
      int codePoint = text.codePointAt(offset);
      String character = new String(Character.toChars(codePoint));
      int characterWidth = terminalWidth(character);
      if (currentWidth > 0 && currentWidth + characterWidth > maxWidth) {
        lines.add(current.toString());
        current.setLength(0);
        currentWidth = 0;
      }
      current.append(character);
      currentWidth += characterWidth;
      offset += Character.charCount(codePoint);
    }
    if (!current.isEmpty()) lines.add(current.toString());
    return lines;
  }

  private void renderMenu(List<String> lines, boolean replace) {
    if (replace) moveCursorUp(lines.size());
    for (String line : lines) {
      terminal.puts(Capability.clr_eol);
      terminal.writer().println(line);
    }
    terminal.flush();
  }

  private void moveCursorUp(int lines) {
    for (int index = 0; index < lines; index++) terminal.puts(Capability.cursor_up);
  }

  static final class SelectionCancelledException extends IllegalStateException {
    SelectionCancelledException() {
      super("操作已取消。");
    }
  }

  private enum MenuKey { UP, DOWN, ACCEPT, CANCEL, SHORTCUT, IGNORE }

  @Override
  public void close() throws IOException {
    terminal.close();
  }
}
