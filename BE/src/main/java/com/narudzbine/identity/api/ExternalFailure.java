package com.narudzbine.identity.api;

public final class ExternalFailure extends RuntimeException {
    public enum Reason { TOKEN_INVALID, NOT_FOUND, REAUTHENTICATION_REQUIRED, INVALID_STATE, IDENTITY_UNAVAILABLE, RETAINED_METHOD_REQUIRED, DEPENDENCY_UNAVAILABLE }
    private final Reason reason;
    public ExternalFailure(Reason reason) { super("External authentication could not be completed.");this.reason=reason; }
    public Reason reason() { return reason; }
}
