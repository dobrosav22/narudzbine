package com.narudzbine.audit.api;

import java.util.List;
import java.util.UUID;

public interface LocationAudit {
    enum Action { LOCATION_CREATED, LOCATION_UPDATED, LOCATION_ARCHIVED, LOCATION_RESTORED }
    enum Field { name, address, contact, instructions, state, homeLocationId }
    void changed(UUID actor, UUID location, Action action, List<Field> fields);
}
