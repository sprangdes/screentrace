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
    String charset;
    try{charset=declaredEncoding(file,bytes);}catch(IOException unsupported){return new String(bytes,StandardCharsets.UTF_8);}
    if(charset.equals("UTF-8")||charset.equals("UTF8"))return new String(bytes,StandardCharsets.UTF_8);
    try{return strictDecode(charset,bytes);}
    catch(java.nio.charset.CharacterCodingException malformed){return new String(bytes,StandardCharsets.UTF_8);}
  }

  /** Why the declared encoding could not be applied, or null when it decodes cleanly.
   * Callers record this; readUtf8Limited keeps the legacy UTF-8 reading instead of skipping the file. */
  public static String decodingProblem(Path file,byte[] bytes) {
    try{String charset=declaredEncoding(file,bytes);if(!charset.equals("UTF-8")&&!charset.equals("UTF8"))strictDecode(charset,bytes);return null;}
    catch(java.nio.charset.CharacterCodingException malformed){return "Source bytes are not valid for the declared encoding";}
    catch(IOException unsupported){return unsupported.getMessage();}
  }

  private static String strictDecode(String charset,byte[] bytes)throws java.nio.charset.CharacterCodingException {
    return java.nio.charset.Charset.forName(charset).newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();
  }

  /** Encoding declarations are lexical metadata, never expressions or guessed byte encodings. */
  public static String declaredEncoding(Path file,byte[] bytes)throws IOException {
    if(!file.getFileName().toString().toLowerCase(java.util.Locale.ROOT).matches(".*\\.(jsp|jspf|html|htm|tag|tagx)"))return "UTF-8";
    String header=new String(bytes,0,Math.min(bytes.length,8192),StandardCharsets.ISO_8859_1).replaceAll("(?s)<%--.*?--%>|<!--.*?-->","");
    var directive=java.util.regex.Pattern.compile("(?is)<%@\\s*page\\b[^%]*?\\bpageEncoding\\s*=\\s*['\"]([A-Za-z0-9_.:-]+)['\"]").matcher(header);
    java.util.Set<String> values=new java.util.TreeSet<>();while(directive.find())values.add(directive.group(1).toUpperCase(java.util.Locale.ROOT));
    if(values.size()>1)throw new IOException("Conflicting source encoding declarations: "+values);
    String value=values.isEmpty()?"UTF-8":values.iterator().next();
    boolean supported;try{supported=java.nio.charset.Charset.isSupported(value);}catch(IllegalArgumentException illegal){supported=false;}
    if(!supported)throw new IOException("Unsupported declared source encoding: "+value);
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

  /**
   * Preserve legacy external DOCTYPE declarations (struts-config, tiles, Servlet 2.3 web.xml) without giving the XML
   * provider any DTD to resolve. The declaration is blanked rather than removed so line numbers stay true.
   */
  public static String xmlWithoutExternalDoctype(String xml) throws IOException {
    if (xml.matches("(?is).*<!DOCTYPE[^>]*\\[.*")) throw new IOException("XML internal DOCTYPE is not supported");
    var doctype = java.util.regex.Pattern.compile("(?is)<!DOCTYPE\\s+[^>]+>").matcher(xml);
    StringBuilder clean = new StringBuilder();
    int offset = 0;
    while (doctype.find()) {
      clean.append(xml, offset, doctype.start()).append(doctype.group().replaceAll("[^\\r\\n]", " "));
      offset = doctype.end();
    }
    return clean.append(xml.substring(offset)).toString();
  }

  /**
   * Parses project XML with no DTD, external entity or XInclude resolution. An external DOCTYPE is accepted and
   * ignored, an internal subset is rejected, and malformed input throws instead of printing to stderr.
   */
  public static org.w3c.dom.Document parseXml(String xml, boolean namespaceAware) throws IOException {
    String clean = xmlWithoutExternalDoctype(xml);
    try {
      var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
      factory.setNamespaceAware(namespaceAware);
      factory.setFeature(javax.xml.XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
      factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
      factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
      factory.setXIncludeAware(false);
      factory.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_DTD, "");
      factory.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
      factory.setExpandEntityReferences(false);
      var builder = factory.newDocumentBuilder();
      builder.setEntityResolver((publicId, systemId) -> new org.xml.sax.InputSource(new java.io.StringReader("")));
      builder.setErrorHandler(new org.xml.sax.ErrorHandler() {
        @Override public void warning(org.xml.sax.SAXParseException exception) { }
        @Override public void error(org.xml.sax.SAXParseException exception) throws org.xml.sax.SAXParseException { throw exception; }
        @Override public void fatalError(org.xml.sax.SAXParseException exception) throws org.xml.sax.SAXParseException { throw exception; }
      });
      return builder.parse(new org.xml.sax.InputSource(new java.io.StringReader(clean)));
    } catch (javax.xml.parsers.ParserConfigurationException | org.xml.sax.SAXException error) {
      throw new IOException("XML could not be parsed safely: " + error.getMessage(), error);
    }
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
