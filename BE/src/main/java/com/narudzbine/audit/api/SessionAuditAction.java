package com.narudzbine.audit.api;

public enum SessionAuditAction {
    SESSION_CREATED("{session}"),
    SESSION_REAUTHENTICATED("{credential,csrfProof,authAt}"),
    SESSION_PASSWORD_ROTATED("{credential,csrfProof,securityEpoch,credentialGeneration}"),
    SESSION_LOGGED_OUT("{revokedAt}"),
    SESSION_REVOKED("{revokedAt}"),
    SESSION_REVOKED_ALL("{revokedAt}"),
    SESSION_EVICTED("{revokedAt}");

    private final String changedFields;

    SessionAuditAction(String changedFields) {
        this.changedFields = changedFields;
    }

    public String changedFields() {
        return changedFields;
    }
}
