package io.screentrace.report;

import java.io.IOException;
import java.nio.file.Path;

/** Safe, user-facing failure for a local preview resource outside its configured output. */
public final class PreviewResourceBoundaryException extends IOException {
  private PreviewResourceBoundaryException(String message) { super(message); }

  public static PreviewResourceBoundaryException outside(Path resource) {
    String name = resource.getFileName() == null ? "未知資源" : resource.getFileName().toString();
    name = name.replaceAll("[\\\\/\\p{Cntrl}]", "_");
    if (name.equals(".") || name.equals("..") || name.isBlank()) name = "未知資源";
    return new PreviewResourceBoundaryException("預覽資源位於分析輸出目錄之外，已拒絕（資源：輸出外資源/" + name + "；根目錄類型：分析輸出目錄）");
  }

  public static PreviewResourceBoundaryException invalid() {
    return new PreviewResourceBoundaryException("預覽資源 URL 無法安全解析，已拒絕（資源：無法解析；根目錄類型：分析輸出目錄）");
  }
}
