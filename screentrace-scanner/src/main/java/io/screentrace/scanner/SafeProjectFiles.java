package io.screentrace.scanner;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/** Shared filesystem boundary for untrusted analyzed projects. Symbolic links are rejected. */
public final class SafeProjectFiles {
  public static final long MAX_SOURCE_FILE_BYTES = 8L * 1024 * 1024;
  public static final long MAX_JSP_FILE_BYTES = 8L * 1024 * 1024;
  public static final long MAX_XML_FILE_BYTES = 4L * 1024 * 1024;
  public static final long MAX_PROJECT_TOTAL_BYTES = 1024L * 1024 * 1024;
  public static final int MAX_PROJECT_FILES = 100_000;
  public static final int MAX_DIRECTORY_DEPTH = 64;

  private SafeProjectFiles() { }

  public static Path canonicalRoot(Path root) throws IOException { return root.toRealPath(); }

  public static Path requireExistingRegularFileWithin(Path root, Path candidate) throws IOException {
    Path canonicalRoot = canonicalRoot(root);
    Path lexicalRoot = root.toAbsolutePath().normalize();
    Path absolute = candidate.toAbsolutePath().normalize();
    Path boundary = absolute.startsWith(lexicalRoot) ? lexicalRoot : canonicalRoot;
    if (!absolute.startsWith(boundary) || containsSymlinkBelow(boundary, absolute)
        || !Files.isRegularFile(absolute, LinkOption.NOFOLLOW_LINKS))
      throw new IOException("Not a regular non-symlink source file: " + candidate);
    Path real = absolute.toRealPath();
    if (!real.startsWith(canonicalRoot)) throw new IOException("Path is outside project root: " + candidate);
    return real;
  }

  public static Path requireExistingDirectoryWithin(Path root, Path candidate) throws IOException {
    Path canonicalRoot = canonicalRoot(root);
    Path lexicalRoot = root.toAbsolutePath().normalize();
    Path absolute = candidate.toAbsolutePath().normalize();
    Path boundary = absolute.startsWith(lexicalRoot) ? lexicalRoot : canonicalRoot;
    if (!absolute.startsWith(boundary) || containsSymlinkBelow(boundary, absolute)
        || !Files.isDirectory(absolute, LinkOption.NOFOLLOW_LINKS))
      throw new IOException("Not a directory or symbolic link: " + candidate);
    Path real = absolute.toRealPath();
    if (!real.startsWith(canonicalRoot)) throw new IOException("Path is outside project root: " + candidate);
    return real;
  }

  public static boolean isSafeRegularFile(Path root, Path candidate) {
    try { requireExistingRegularFileWithin(root, candidate); return true; }
    catch (IOException | SecurityException ignored) { return false; }
  }

  private static boolean containsSymlinkBelow(Path root, Path path) {
    Path current = root;
    for (Path part : root.relativize(path)) {
      current = current.resolve(part);
      if (Files.isSymbolicLink(current)) return true;
    }
    return false;
  }

  public static String readUtf8Limited(Path root, Path file, long maxBytes) throws IOException {
    Path safe = requireExistingRegularFileWithin(root, file);
    if (Files.size(safe) > maxBytes) throw new IOException("Source file exceeds limit of " + maxBytes + " bytes: " + file);
    try (var input = Files.newInputStream(safe, LinkOption.NOFOLLOW_LINKS); var output = new ByteArrayOutputStream((int) Math.min(Files.size(safe), 64 * 1024))) {
      byte[] buffer = new byte[8192];
      long total = 0;
      int count;
      while ((count = input.read(buffer)) >= 0) {
        total += count;
        if (total > maxBytes) throw new IOException("Source file grew beyond limit of " + maxBytes + " bytes: " + file);
        output.write(buffer, 0, count);
      }
      return output.toString(StandardCharsets.UTF_8);
    }
  }

  /** Preserve legacy external Tiles declarations without giving the XML provider any DTD to resolve. */
  public static String xmlWithoutExternalDoctype(String xml) throws IOException {
    if (xml.matches("(?is).*<!DOCTYPE[^>]*\\[.*")) throw new IOException("XML internal DOCTYPE is not supported");
    return xml.replaceAll("(?is)<!DOCTYPE\\s+[^>]+>", "");
  }

  public static Path requireWritePathWithin(Path outputRoot, Path target) throws IOException {
    Path root = outputRoot.toAbsolutePath().normalize();
    Path realRoot = root.toRealPath();
    Path resolved = target.toAbsolutePath().normalize();
    if (!resolved.startsWith(root)) throw new IOException("Output path is outside configured output root: " + target);
    Path existing = resolved;
    while (existing != null && !Files.exists(existing, LinkOption.NOFOLLOW_LINKS)) existing = existing.getParent();
    if (existing != null) {
      Path current = root;
      for (Path part : root.relativize(existing)) {
        current = current.resolve(part);
        if (Files.isSymbolicLink(current)) throw new IOException("Output path traverses a symbolic link: " + current);
      }
      if (Files.isSymbolicLink(existing)) throw new IOException("Output path traverses a symbolic link: " + existing);
      Path realExisting = existing.toRealPath();
      if (!realExisting.startsWith(realRoot)) throw new IOException("Output path escapes configured output root: " + target);
    }
    return resolved;
  }
}
