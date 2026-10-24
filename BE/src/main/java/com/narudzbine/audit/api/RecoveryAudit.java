package com.narudzbine.audit.api;

import java.util.UUID;
public interface RecoveryAudit {
    enum Action { RECOVERY_CREATED,RECOVERY_READ,RECOVERY_APPROVED,RECOVERY_REJECTED,RECOVERY_ACCEPTED,RECOVERY_COMPLETED }
    void recovery(UUID actor,UUID caseId,Action action,String reason);
}
