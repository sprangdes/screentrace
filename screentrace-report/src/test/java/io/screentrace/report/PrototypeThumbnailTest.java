package io.screentrace.report;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;import io.screentrace.core.ApplicationGraph.*;import io.screentrace.core.AnalysisEvidence;import io.screentrace.core.ResolutionStatus;import java.nio.file.*;import java.util.*;import java.awt.image.BufferedImage;import javax.imageio.ImageIO;import java.io.*;import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;
class PrototypeThumbnailTest {
 @TempDir Path root;
 private PreviewModel load(int width) throws Exception {
  var source=new SourceLocation("page.jsp",1);var graph=new ApplicationGraph(new Application("Synthetic",".",List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,"Page",Map.of(),source,Confidence.CONFIRMED,List.of(new AnalysisEvidence(source,"Fixture",ResolutionStatus.CONFIRMED,null)))),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
  var bytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(width,400,BufferedImage.TYPE_INT_RGB),"png",bytes);String uri="data:image/png;base64,"+Base64.getEncoder().encodeToString(bytes.toByteArray());Files.createDirectories(root.resolve("static-preview"));Files.writeString(root.resolve("static-preview/element-styles.json"),"{\"version\":\"2\",\"schemaVersion\":\"2.2\",\"screens\":{\"screen\":{\"width\":1440,\"height\":900,\"thumbnail\":\""+uri+"\",\"elements\":[]}},\"styles\":{},\"defaults\":{}}");return new PreviewCaptureReader().read(graph,new PreviewModel("2",List.of(new PreviewModel.PreviewScreen("screen",null,null,1440,900)),List.of()),root);
 }
 @Test void acceptsNew640PixelPngWithoutChangingContent() throws Exception {assertTrue(load(640).screens().get(0).thumbnail().startsWith("data:image/png;base64,"));}
 @Test void retainsExplicitBoundAndRejects641Pixels() throws Exception {assertThrows(IOException.class,()->load(641));}
}
