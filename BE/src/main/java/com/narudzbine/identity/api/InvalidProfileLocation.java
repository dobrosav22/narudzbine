package com.narudzbine.identity.api;

public final class InvalidProfileLocation extends RuntimeException {
    public enum Reason { NOT_APPLICABLE, ARCHIVED }
    private final Reason reason;
    public InvalidProfileLocation(Reason reason) { super("The profile location cannot be selected."); this.reason = reason; }
    public Reason reason() { return reason; }
}
