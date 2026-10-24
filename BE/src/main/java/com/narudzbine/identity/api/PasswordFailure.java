package com.narudzbine.identity.api;

public final class PasswordFailure extends RuntimeException {
    public enum Reason { TOKEN_INVALID, REAUTHENTICATION_REQUIRED, REQUEST_IN_PROGRESS, PASSWORD_REJECTED, DEPENDENCY_UNAVAILABLE }
    private final Reason reason;
    public PasswordFailure(Reason reason) { super("Password operation could not be completed."); this.reason = reason; }
    public Reason reason() { return reason; }
}
