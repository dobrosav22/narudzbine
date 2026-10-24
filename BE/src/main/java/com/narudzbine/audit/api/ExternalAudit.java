package com.narudzbine.audit.api;

import java.util.UUID;

public interface ExternalAudit {
    enum Action { EXTERNAL_IDENTITY_LINKED, EXTERNAL_IDENTITY_UNLINKED }
    void externalIdentity(UUID account,UUID identity,Action action);
}
