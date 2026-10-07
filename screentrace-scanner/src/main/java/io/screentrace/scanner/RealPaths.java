package io.screentrace.scanner;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;

/** Canonical path operations shared by project, report, and workspace boundaries. */
public final class RealPaths {
  private RealPaths() { }

  /** Resolves existing ancestors with toRealPath and preserves not-yet-created path segments. */
  public static Path resolveAllowMissing(Path path) throws IOException {
    Path absolute = path.toAbsolutePath().normalize();
    Path existing = absolute;
    Deque<Path> missing = new ArrayDeque<>();
    while (existing != null && !Files.exists(existing, LinkOption.NOFOLLOW_LINKS)) {
      Path name = existing.getFileName();
      if (name != null) missing.addFirst(name);
      existing = existing.getParent();
    }
    if (existing == null) return absolute;
    Path resolved = existing.toRealPath();
    for (Path name : missing) resolved = resolved.resolve(name);
    return resolved.normalize();
  }

  public static boolean isWithin(Path root, Path candidate) throws IOException {
    return resolveAllowMissing(candidate).startsWith(resolveAllowMissing(root));
  }

  public static boolean isSame(Path left, Path right) throws IOException {
    return resolveAllowMissing(left).equals(resolveAllowMissing(right));
  }
}
