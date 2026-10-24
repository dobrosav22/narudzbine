package com.narudzbine.audit.api;

import java.util.List;
import java.util.UUID;

public interface AccountAudit {
    enum ProfileField { displayName, homeLocationId }
    void languageChanged(UUID accountId);
    void profileChanged(UUID accountId, List<ProfileField> fields);
}
