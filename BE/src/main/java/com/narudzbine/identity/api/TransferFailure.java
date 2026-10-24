package com.narudzbine.identity.api;

public final class TransferFailure extends RuntimeException {
    public enum Reason { NOT_FOUND, FORBIDDEN, INVALID_STATE, REQUEST_IN_PROGRESS, IDEMPOTENCY_MISMATCH, REAUTHENTICATION_REQUIRED }
    private final Reason reason;
    public TransferFailure(Reason reason) { super("Ownership request could not be completed.");this.reason=reason; }
    public Reason reason() { return reason; }
}
