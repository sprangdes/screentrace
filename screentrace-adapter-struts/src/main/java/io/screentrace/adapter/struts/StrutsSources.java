package io.screentrace.adapter.struts;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.*;
import org.w3c.dom.*;
import org.xml.sax.*;
import org.xml.sax.helpers.DefaultHandler;

/** Bounded, non-executing source readers. SAX retains original XML element line numbers. */
final class StrutsSources {
  record JavaType(String name,String parent,ClassOrInterfaceDeclaration declaration,SourceLocation source) { }
  static Document xml(String text) throws Exception {
    // Validate the same DOCTYPE policy as SafeProjectFiles, retaining newlines for evidence.
    SafeProjectFiles.xmlWithoutExternalDoctype(text);
    var matcher=java.util.regex.Pattern.compile("(?is)<!DOCTYPE\\s+[^>]+>").matcher(text);
    StringBuilder clean=new StringBuilder();int offset=0;
    while(matcher.find()) {clean.append(text,offset,matcher.start());clean.append(matcher.group().replaceAll("[^\\r\\n]"," "));offset=matcher.end();}
    clean.append(text.substring(offset));
    var document=DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
    SAXParserFactory factory=SAXParserFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd",false);
    var reader=factory.newSAXParser().getXMLReader();
    reader.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD,"");reader.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
    reader.setEntityResolver((publicId,systemId)->new InputSource(new StringReader("")));
    var handler=new DefaultHandler() {
      Locator locator;Deque<Element> stack=new ArrayDeque<>();
      @Override public void setDocumentLocator(Locator value) {locator=value;}
      @Override public void startElement(String uri,String local,String name,Attributes attributes) {
        Element element=document.createElement(name);element.setUserData("line",locator.getLineNumber(),null);
        for(int i=0;i<attributes.getLength();i++) element.setAttribute(attributes.getQName(i),attributes.getValue(i));
        if(stack.isEmpty()) document.appendChild(element); else stack.peek().appendChild(element);stack.push(element);
      }
      @Override public void endElement(String uri,String local,String name) {stack.pop();}
      @Override public void characters(char[] chars,int start,int length) {if(!stack.isEmpty()) stack.peek().appendChild(document.createTextNode(new String(chars,start,length)));}
      @Override public void error(SAXParseException error) throws SAXException {throw error;}
      @Override public void fatalError(SAXParseException error) throws SAXException {throw error;}
    };
    reader.setContentHandler(handler);reader.setErrorHandler(handler);reader.parse(new InputSource(new StringReader(clean.toString())));return document;
  }
  static List<Element> elements(Node node,String name) {
    NodeList list=node instanceof Document d?d.getElementsByTagName(name):((Element)node).getElementsByTagName(name);
    List<Element> result=new ArrayList<>();for(int i=0;i<list.getLength();i++) result.add((Element)list.item(i));return result;
  }
  static SourceLocation source(String path,Element element) {return new SourceLocation(path,(Integer)element.getUserData("line"));}
  static Map<String,String> attributes(Element element) {
    Map<String,String> result=new TreeMap<>();var attrs=element.getAttributes();for(int i=0;i<attrs.getLength();i++) result.put(attrs.item(i).getNodeName(),attrs.item(i).getNodeValue());return result;
  }
  static Map<String,JavaType> javaTypes(ProjectInventory inventory,List<Diagnostic> diagnostics) {
    Map<String,JavaType> result=new TreeMap<>();var parser=new JavaParser(new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.BLEEDING_EDGE));
    for(Path file:inventory.javaFiles()) try {
      var parsed=parser.parse(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
      if(!parsed.isSuccessful()) diagnostics.add(diagnostic("Java 原始碼無法完整解析",relative(inventory.root(),file),1,"JAVA_PARSE_UNRESOLVED"));
      if(parsed.getResult().isEmpty()) continue;
      CompilationUnit unit=parsed.getResult().get();
      for(var type:unit.findAll(ClassOrInterfaceDeclaration.class)) {
        String name=unit.getPackageDeclaration().map(p->p.getNameAsString()+".").orElse("")+type.getNameAsString();
        String parent=type.getExtendedTypes().isEmpty()?"":type.getExtendedTypes().get(0).getNameWithScope();
        if (!parent.contains(".")) {
          String simple = parent;
          parent = unit.getImports().stream().filter(i -> !i.isAsterisk() && i.getNameAsString().endsWith("." + simple)).map(i -> i.getNameAsString()).findFirst().orElse(parent);
        }
        result.put(name,new JavaType(name,parent,type,new SourceLocation(relative(inventory.root(),file),type.getBegin().map(p->p.line).orElse(1))));
      }
    } catch(IOException|SecurityException error) {diagnostics.add(diagnostic("Java 原始碼超限或不可讀："+error.getMessage(),relative(inventory.root(),file),1,"SOURCE_LIMIT"));}
    return result;
  }
  static Diagnostic diagnostic(String message,String path,int line,String code) {
    var source=new SourceLocation(path,line);return new Diagnostic(message,Confidence.UNRESOLVED,source,code,List.of(new AnalysisEvidence(source,"StrutsSourceParser",ResolutionStatus.UNRESOLVED,null)));
  }
  static String relative(Path root,Path file) {return root.relativize(file).toString().replace('\\','/');}
  static boolean literal(String value) {return value!=null&&!value.contains("${")&&!value.contains("#{")&&!value.contains("<%");}
}
