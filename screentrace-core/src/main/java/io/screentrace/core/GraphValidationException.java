package io.screentrace.core;

/**
 * An application graph that breaks the integrity rules. One type for every validation failure, so a
 * caller catches it the same way with or without personas, and it never shares a base class with
 * the CLI's cancellation exceptions (RV-109).
 */
public final class GraphValidationException extends IllegalArgumentException {
  public GraphValidationException(String message) {
    super(message);
  }
}
