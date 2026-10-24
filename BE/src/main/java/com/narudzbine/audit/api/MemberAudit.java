package com.narudzbine.audit.api;

import java.util.List;
import java.util.UUID;

public interface MemberAudit {
    enum Action { MEMBER_ROLE_CHANGED, MEMBER_DEACTIVATED, MEMBER_REACTIVATED }
    enum Field { role, state, securityEpoch, sessions }
    void changed(UUID actor, UUID member, Action action, List<Field> fields);
}
