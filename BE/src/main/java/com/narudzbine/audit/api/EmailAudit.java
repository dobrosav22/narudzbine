package com.narudzbine.audit.api;

import java.util.UUID;

public interface EmailAudit {
    enum Action { EMAIL_CHANGE_REQUESTED, EMAIL_ADDRESS_VERIFIED, EMAIL_CHANGE_CANCELLED }
    enum OperationAction { EMAIL_OPERATION_STARTED, EMAIL_OPERATION_APPLIED, EMAIL_OPERATION_UNCERTAIN, EMAIL_OPERATION_REJECTED, EMAIL_OPERATION_COMPLETED }
    void emailChange(UUID account,UUID change,Action action);
    void emailOperation(UUID account,UUID operation,OperationAction action);
}
