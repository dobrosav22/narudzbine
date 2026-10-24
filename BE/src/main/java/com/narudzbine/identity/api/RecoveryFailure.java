package com.narudzbine.identity.api;

public final class RecoveryFailure extends RuntimeException {
    public enum Reason { NOT_FOUND,FORBIDDEN,INVALID_STATE,EVIDENCE_INCOMPLETE,NOTICE_PERIOD,REAUTHENTICATION_REQUIRED,
        TOKEN_INVALID,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,EMAIL_UNAVAILABLE,REQUEST_IN_PROGRESS,DEPENDENCY_UNAVAILABLE }
    private final Reason reason;
    private final java.util.UUID resourceId;
    public RecoveryFailure(Reason reason) {this(reason,null);}
    public RecoveryFailure(Reason reason,java.util.UUID resourceId) { super("Recovery request could not be completed.");this.reason=reason;this.resourceId=resourceId; }
    public Reason reason() { return reason; }
    public java.util.UUID resourceId() {return resourceId;}
}
