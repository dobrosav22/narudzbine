package com.narudzbine.audit.api;

import java.util.UUID;

public interface PasswordAudit {
    enum Action { PASSWORD_OPERATION_STARTED, PASSWORD_OPERATION_APPLIED, PASSWORD_OPERATION_UNCERTAIN, PASSWORD_OPERATION_REJECTED, PASSWORD_OPERATION_COMPLETED }
    void passwordOperation(UUID account, UUID operation, Action action);
}
