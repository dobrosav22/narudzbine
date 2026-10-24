package com.narudzbine.identity.api;

public final class BusinessAccessDenied extends RuntimeException {
    public enum Reason { INACCESSIBLE_SCOPE, CAPABILITY_DENIED }

    private final Reason reason;

    public BusinessAccessDenied(Reason reason) {
        super("Business access denied.");
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
