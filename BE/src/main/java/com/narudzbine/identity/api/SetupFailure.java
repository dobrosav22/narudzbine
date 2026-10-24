package com.narudzbine.identity.api;
public final class SetupFailure extends RuntimeException {
    public enum Reason { NOT_FOUND,FORBIDDEN,TOKEN_INVALID,INVALID_STATE,REQUEST_IN_PROGRESS,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,EMAIL_UNAVAILABLE,REGISTRATION_UNAVAILABLE,PASSWORD_REJECTED,DEPENDENCY_UNAVAILABLE }
    private final Reason reason;
    public SetupFailure(Reason reason){super("Setup request could not be completed.");this.reason=reason;}
    public Reason reason(){return reason;}
}
