package com.narudzbine.audit.api;

import java.util.UUID;

public interface TransferAudit {
    enum Action { TRANSFER_REQUESTED, TRANSFER_REVOKED, TRANSFER_INVALIDATED, TRANSFER_EXPIRED, TRANSFER_ACCEPTED }
    void changed(UUID actor,UUID transfer,Action action);
}
