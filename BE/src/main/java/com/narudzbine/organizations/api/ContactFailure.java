package com.narudzbine.organizations.api;

import java.util.UUID;

public final class ContactFailure extends RuntimeException {
    public enum Reason { NOT_FOUND, CREATE_CONFLICT, REPLAY_EXPIRED, REVISION_CONFLICT }
    private final Reason reason;
    private final UUID resourceId;
    private final Long revision;
    public ContactFailure(Reason reason, UUID resourceId, Long revision) {
        super("Contact operation could not be completed.");
        this.reason = reason; this.resourceId = resourceId; this.revision = revision;
    }
    public Reason reason() { return reason; }
    public UUID resourceId() { return resourceId; }
    public Long revision() { return revision; }
}
