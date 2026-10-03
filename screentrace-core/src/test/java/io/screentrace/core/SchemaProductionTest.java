package io.screentrace.core;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class SchemaProductionTest {
 private ApplicationGraph graph(String version,boolean proof){var source=new SourceLocation("page.jsp",1);var evidence=proof?List.of(new AnalysisEvidence(source,"FixtureParser",ResolutionStatus.CONFIRMED,null)):List.<AnalysisEvidence>of();return new ApplicationGraph(new Application("sample",".",List.of()),List.of(new GraphNode("page",NodeType.SCREEN,"page",Map.of(),source,Confidence.CONFIRMED,evidence)),List.of(),List.of(),List.of(),version,List.of(),List.of());}
 @Test void mergesOnlyStrictSchemaTwoGraphs(){var merged=ApplicationGraphMerger.merge(graph("2.2",true),graph("2.2",true));assertEquals("2.2",merged.schemaVersion());assertDoesNotThrow(()->GraphIntegrityValidator.validate(merged));}
 @Test void rejectsHistoricalInputWithoutRelabeling(){var error=assertThrows(IllegalArgumentException.class,()->ApplicationGraphMerger.merge(graph("2.1",true),graph("2.2",true)));assertTrue(error.getMessage().contains("2.1"));assertTrue(error.getMessage().contains("2.2"));}
 @Test void rejectsMissingEvidenceEvenWhenInputClaimsSchemaTwo(){assertThrows(IllegalStateException.class,()->ApplicationGraphMerger.merge(graph("2.2",false),graph("2.2",true)));}
 @Test void twoHistoricalGraphsRemainExplicitlyHistorical(){var merged=ApplicationGraphMerger.merge(graph("2.1",false),graph("2.1",false));assertEquals("2.1",merged.schemaVersion());assertTrue(merged.diagnostics().stream().anyMatch(d->d.code().equals("HISTORICAL_SCHEMA")&&d.message().contains("歷史資料,未經 2.2 證據驗證")));}
 @Test void historicalConstructorsAreDeprecated(){for(var constructor:ApplicationGraph.class.getConstructors())if(constructor.getParameterCount()<8)assertTrue(constructor.isAnnotationPresent(Deprecated.class),constructor.toString());assertEquals("2.1",new ApplicationGraph(new Application("legacy",".",List.of()),List.of(),List.of(),List.of()).schemaVersion());}
}
