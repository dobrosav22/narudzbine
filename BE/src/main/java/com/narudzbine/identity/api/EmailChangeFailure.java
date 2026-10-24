package com.narudzbine.identity.api;

public final class EmailChangeFailure extends RuntimeException {
    public enum Reason { NOT_FOUND, TOKEN_INVALID, REAUTHENTICATION_REQUIRED, INVALID_STATE, EMAIL_UNAVAILABLE, REQUEST_IN_PROGRESS, IDEMPOTENCY_MISMATCH, DEPENDENCY_UNAVAILABLE }
    private final Reason reason;
    public EmailChangeFailure(Reason reason) { super("Email change could not be completed.");this.reason=reason; }
    public Reason reason() { return reason; }
}
