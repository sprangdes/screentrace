package io.screentrace.report;

/**
 * The migration target the review md names in its header (ADR 0156). A report without one keeps the
 * original requirement's target; {@link #NONE} leaves the header line out.
 */
public record MigrationTarget(String backend, String frontend) {
  public static final MigrationTarget NONE = new MigrationTarget(null, null);

  public MigrationTarget {
    if ((backend == null) != (frontend == null))
      throw new IllegalArgumentException("migration target needs both backend and frontend");
    for (String value : new String[] {backend, frontend})
      if (value != null
          && (value.isBlank()
              || value.length() > 80
              || value.chars().anyMatch(c -> c < 32 || c == 127)))
        throw new IllegalArgumentException("migration target 必須是 1 至 80 字、不含控制字元的文字");
  }

  public boolean none() {
    return backend == null;
  }
}
