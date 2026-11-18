package io.screentrace.adapter.spring;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Plain-language text for a Spring schedule (ADR 0159). Only the shapes listed here are described;
 * any other cron stays as written, so the report never claims a timing the expression does not say.
 */
final class ScheduleText {
  private ScheduleText() {}

  private static final Map<String, String> MACROS =
      Map.of(
          "@yearly", "每年 1 月 1 日 00:00",
          "@annually", "每年 1 月 1 日 00:00",
          "@monthly", "每月 1 日 00:00",
          "@weekly", "每週日 00:00",
          "@daily", "每天 00:00",
          "@midnight", "每天 00:00",
          "@hourly", "每小時整點");

  private static final List<String> DAYS = List.of("日", "一", "二", "三", "四", "五", "六", "日");
  private static final List<String> DAY_NAMES =
      List.of("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT");

  /** A Spring cron (six fields, or a macro) in words; empty when the shape is not one we know. */
  static Optional<String> cron(String expression) {
    String cron = expression.trim();
    if (cron.equals("-")) return Optional.of("已停用（cron 設為 -）");
    if (MACROS.containsKey(cron.toLowerCase(Locale.ROOT)))
      return Optional.of(MACROS.get(cron.toLowerCase(Locale.ROOT)));
    String[] f = cron.split("\\s+");
    if (f.length != 6) return Optional.empty();
    String second = f[0], minute = f[1], hour = f[2], dom = f[3], month = f[4], dow = f[5];
    boolean anyDay = any(dom) && any(month) && any(dow);
    Integer s = number(second, 59), m = number(minute, 59), h = number(hour, 23);
    Integer everySecond = step(second, 59),
        everyMinute = step(minute, 59),
        everyHour = step(hour, 23);
    if (everySecond != null && any(minute) && any(hour) && anyDay)
      return Optional.of(everySecond == 1 ? "每秒" : "每 " + everySecond + " 秒");
    if (s != null && everyMinute != null && any(hour) && anyDay)
      return Optional.of((everyMinute == 1 ? "每分鐘" : "每 " + everyMinute + " 分鐘") + secondNote(s));
    if (s != null && any(minute) && any(hour) && anyDay) return Optional.of("每分鐘" + secondNote(s));
    if (s != null && m != null && any(hour) && anyDay)
      return Optional.of("每小時第 " + m + " 分" + secondNote(s));
    if (s != null && m != null && everyHour != null && anyDay)
      return Optional.of(
          (everyHour == 1 ? "每小時" : "每 " + everyHour + " 小時") + "（第 " + m + " 分）" + secondNote(s));
    if (s == null || m == null || h == null) return Optional.empty();
    String time =
        String.format(Locale.ROOT, "%02d:%02d", h, m) + (s == 0 ? "" : String.format(":%02d", s));
    if (anyDay) return Optional.of("每天 " + time);
    if (any(dom) && any(month)) {
      var days = weekdays(dow);
      return days.map(d -> "每週" + d + " " + time);
    }
    Integer day = number(dom, 31);
    if (day != null && any(month) && any(dow)) return Optional.of("每月 " + day + " 日 " + time);
    return Optional.empty();
  }

  /** A fixed rate or delay in milliseconds, in words. */
  static String every(long millis, boolean afterCompletion) {
    String span = duration(millis);
    return afterCompletion ? "上一次執行完成後隔 " + span + "再執行" : "每 " + span + "執行一次";
  }

  static String duration(long millis) {
    if (millis % 3_600_000 == 0 && millis >= 3_600_000) return millis / 3_600_000 + " 小時";
    if (millis % 60_000 == 0 && millis >= 60_000) return millis / 60_000 + " 分鐘";
    if (millis % 1000 == 0 && millis >= 1000) return millis / 1000 + " 秒";
    return millis + " 毫秒";
  }

  /** Milliseconds of {@code value} in a {@code java.util.concurrent.TimeUnit} name. */
  static Optional<Long> millis(long value, String unit) {
    return switch (unit) {
      case "NANOSECONDS" -> Optional.of(value / 1_000_000);
      case "MICROSECONDS" -> Optional.of(value / 1000);
      case "MILLISECONDS" -> Optional.of(value);
      case "SECONDS" -> Optional.of(value * 1000);
      case "MINUTES" -> Optional.of(value * 60_000);
      case "HOURS" -> Optional.of(value * 3_600_000);
      case "DAYS" -> Optional.of(value * 86_400_000);
      default -> Optional.empty();
    };
  }

  /** An ISO-8601 duration such as {@code PT30S}, which Spring accepts in the String attributes. */
  static Optional<Long> isoMillis(String text) {
    try {
      return Optional.of(java.time.Duration.parse(text.trim()).toMillis());
    } catch (RuntimeException notIso) {
      return Optional.empty();
    }
  }

  private static String secondNote(int second) {
    return second == 0 ? "" : "（第 " + second + " 秒）";
  }

  private static boolean any(String field) {
    return field.equals("*") || field.equals("?");
  }

  private static Integer number(String field, int max) {
    if (!field.matches("\\d{1,2}")) return null;
    int value = Integer.parseInt(field);
    return value <= max ? value : null;
  }

  /** {@code *}/n or 0/n: every n units. */
  private static Integer step(String field, int max) {
    var match = java.util.regex.Pattern.compile("(?:\\*|0)/(\\d{1,2})").matcher(field);
    if (!match.matches()) return null;
    int value = Integer.parseInt(match.group(1));
    return value >= 1 && value <= max ? value : null;
  }

  /** {@code MON-FRI}, {@code 1-5}, {@code SAT,SUN}: the days in words. */
  private static Optional<String> weekdays(String field) {
    StringBuilder out = new StringBuilder();
    for (String part : field.toUpperCase(Locale.ROOT).split(",")) {
      String[] range = part.split("-");
      if (range.length > 2) return Optional.empty();
      Integer from = day(range[0]), to = range.length == 2 ? day(range[1]) : from;
      if (from == null || to == null || to < from) return Optional.empty();
      if (!out.isEmpty()) out.append("、");
      out.append(DAYS.get(from));
      if (!to.equals(from)) out.append("至").append(DAYS.get(to));
    }
    return out.isEmpty() ? Optional.empty() : Optional.of(out.toString());
  }

  private static Integer day(String text) {
    if (text.matches("[0-7]")) return Integer.parseInt(text);
    int at = DAY_NAMES.indexOf(text);
    return at < 0 ? null : at;
  }
}
