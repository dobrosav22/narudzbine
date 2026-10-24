package com.narudzbine.identity.api;

public final class MemberFailure extends RuntimeException {
    public enum Reason { NOT_FOUND, FORBIDDEN, INVALID_STATE, REQUEST_IN_PROGRESS }
    private final Reason reason;
    public MemberFailure(Reason reason) { super("Member operation could not be completed."); this.reason=reason; }
    public Reason reason() { return reason; }
}
