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
    Path realRoot = canonicalRoot(root);
    Path lexicalRoot = root.toAbsolutePath().normalize();
    Path absolute = candidate.toAbsolutePath().normalize();
    Path real = candidate.toRealPath();
    if (!real.startsWith(realRoot) || containsSymlinkBelow(lexicalRoot, absolute, realRoot, real)
        || !Files.isRegularFile(absolute, LinkOption.NOFOLLOW_LINKS))
      throw new IOException("Not a regular non-symlink source file: " + candidate);
    for(Path part:realRoot.relativize(real))if(part.toString().startsWith("workspace:"))throw new IOException("Reserved workspace evidence name is not a target source");
    return real;
  }

  public static Path requireExistingDirectoryWithin(Path root, Path candidate) throws IOException {
    Path realRoot = canonicalRoot(root);
    Path lexicalRoot = root.toAbsolutePath().normalize();
    Path absolute = candidate.toAbsolutePath().normalize();
    Path real = candidate.toRealPath();
    if (!real.startsWith(realRoot) || containsSymlinkBelow(lexicalRoot, absolute, realRoot, real)
        || !Files.isDirectory(absolute, LinkOption.NOFOLLOW_LINKS))
      throw new IOException("Not a directory or symbolic link: " + candidate);
    return real;
  }

  public static boolean isSafeRegularFile(Path root, Path candidate) {
    try { requireExistingRegularFileWithin(root, candidate); return true; }
    catch (IOException | SecurityException ignored) { return false; }
  }

  private static boolean containsSymlinkBelow(Path lexicalRoot, Path path, Path realRoot, Path realPath) {
    Path root = path.startsWith(lexicalRoot) ? lexicalRoot : realRoot;
    Path checkedPath = path.startsWith(lexicalRoot) ? path : realPath;
    if (!checkedPath.startsWith(root)) return true;
    Path current = root;
    for (Path part : root.relativize(checkedPath)) {
      current = current.resolve(part);
      if (Files.isSymbolicLink(current)) return true;
    }
    return false;
  }

  public static String readUtf8Limited(Path root, Path file, long maxBytes) throws IOException {
    byte[] bytes=readBytesLimited(root,file,maxBytes);
    String charset=declaredEncoding(file,bytes);
    try{if(charset.equals("UTF-8")||charset.equals("UTF8"))return new String(bytes,StandardCharsets.UTF_8);return java.nio.charset.Charset.forName(charset).newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();}
    catch(IllegalArgumentException error){throw new IOException("Unsupported declared source encoding: "+charset,error);}
  }

  /** Encoding declarations are lexical metadata, never expressions or guessed byte encodings. */
  public static String declaredEncoding(Path file,byte[] bytes)throws IOException {
    if(!file.getFileName().toString().toLowerCase(java.util.Locale.ROOT).matches(".*\\.(jsp|jspf|html|htm|tag|tagx)"))return "UTF-8";
    String header=new String(bytes,0,Math.min(bytes.length,8192),StandardCharsets.ISO_8859_1).replaceAll("(?s)<%--.*?--%>|<!--.*?-->","");
    var directive=java.util.regex.Pattern.compile("(?is)<%@\\s*page\\b[^%]*?\\bpageEncoding\\s*=\\s*['\"]([A-Za-z0-9_-]+)['\"]").matcher(header);
    java.util.Set<String> values=new java.util.TreeSet<>();while(directive.find())values.add(directive.group(1).toUpperCase(java.util.Locale.ROOT));
    if(values.size()>1)throw new IOException("Conflicting source encoding declarations");
    String value=values.isEmpty()?"UTF-8":values.iterator().next();
    if(!java.util.Set.of("UTF-8","UTF8","GB18030","GBK","GB2312","ISO-8859-1","US-ASCII").contains(value))throw new IOException("Unsupported declared source encoding: "+value);
    return value;
  }

  /** Same path and size boundary, preserving original bytes for content digests. */
  public static byte[] readBytesLimited(Path root,Path file,long maxBytes) throws IOException {
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
      return output.toByteArray();
    }
  }

  /** Preserve legacy external Tiles declarations without giving the XML provider any DTD to resolve. */
  public static String xmlWithoutExternalDoctype(String xml) throws IOException {
    if (xml.matches("(?is).*<!DOCTYPE[^>]*\\[.*")) throw new IOException("XML internal DOCTYPE is not supported");
    return xml.replaceAll("(?is)<!DOCTYPE\\s+[^>]+>", "");
  }

  public static Path requireWritePathWithin(Path outputRoot, Path target) throws IOException {
    Path root = outputRoot.toAbsolutePath().normalize();
    Path realRoot = outputRoot.toRealPath();
    Path resolved = target.toAbsolutePath().normalize();
    if (!RealPaths.isWithin(outputRoot, resolved)) throw new IOException("Output path is outside configured output root: " + target);
    Path existing = resolved;
    while (existing != null && !Files.exists(existing, LinkOption.NOFOLLOW_LINKS)) existing = existing.getParent();
    if (existing != null) {
      if (!Files.isSameFile(root, existing)) {
        Path walkRoot = existing.startsWith(root) ? root : realRoot;
        Path walkPath = existing.startsWith(root) ? existing : existing.toRealPath();
        if (!walkPath.startsWith(walkRoot)) throw new IOException("Output path escapes configured output root: " + target);
        Path current = walkRoot;
        for (Path part : walkRoot.relativize(walkPath)) {
          current = current.resolve(part);
          if (Files.isSymbolicLink(current)) throw new IOException("Output path traverses a symbolic link: " + current);
        }
      }
      Path realExisting = existing.toRealPath();
      if (!realExisting.startsWith(realRoot)) throw new IOException("Output path escapes configured output root: " + target);
    }
    return resolved;
  }
}
