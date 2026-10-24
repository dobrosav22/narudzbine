package com.narudzbine.audit.api;

import java.util.List;
import java.util.UUID;

public interface OrganizationAudit {
    enum Field { displayName, legalName, registeredAddress, defaultLanguage, staffSubmissionRestricted, partnerContactId }
    void closed(UUID actor,UUID organization,String privateReason);
    void settingsChanged(UUID actorId, UUID organizationId, List<Field> fields);
}
