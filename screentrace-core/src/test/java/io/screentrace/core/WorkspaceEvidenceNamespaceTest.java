package io.screentrace.core;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class WorkspaceEvidenceNamespaceTest {
 ApplicationGraph graph(String file){var source=new SourceLocation(file,3);var proof=List.of(new AnalysisEvidence(source,"UrlResolution",ResolutionStatus.CONFIRMED,"設定鍵=contextPaths；候選值=[/shop]；採用值=/shop"));return new ApplicationGraph(new Application("test","/project",List.of()),List.of(new GraphNode("api",NodeType.ENDPOINT,"GET /api",Map.of("path","/api","httpMethod","GET"),source,Confidence.CONFIRMED,proof)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());}
 @Test void plainWorkspaceFilenameIsValid(){assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph("workspace:config.json")));}
 @Test void nestedTraversalAbsoluteAndOtherNamespacesAreRejected(){for(String source:List.of("workspace:sub/config.json","workspace:sub\\config.json","workspace:..config.json","workspace:/config.json","workspace:C:\\config.json","external:config.json","file:///config.json","/config.json","C:\\config.json","../config.json"))assertThrows(IllegalStateException.class,()->GraphIntegrityValidator.validate(graph(source)),source);}
}
