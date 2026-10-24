package com.narudzbine.audit.api;

import java.util.UUID;

/** Append a successful session action inside its existing writable transaction. */
public interface SessionAudit {
    void record(SessionAuditAction action, UUID accountId, UUID sessionId);
}
