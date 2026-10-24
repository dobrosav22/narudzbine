package com.narudzbine.audit.api;

import java.util.List;
import java.util.UUID;

public interface ContactAudit {
    enum Action { CONTACT_CREATED, CONTACT_UPDATED, CONTACT_ARCHIVED, CONTACT_RESTORED }
    enum Field { label, contact, state }
    void changed(UUID actor, UUID contact, Action action, List<Field> fields);
}
