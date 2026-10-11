package io.screentrace.adapter.spring;
import java.nio.file.Path;
import java.util.List;
/** Source-compatible facade for the shared static contract extractor. */
final class ApiContractExtractor extends io.screentrace.parser.jsp.ApiContractExtractor {
 ApiContractExtractor(Path root,List<Path> files){super(root,files);}
}
